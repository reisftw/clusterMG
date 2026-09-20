const express = require("express");
const db = require("../db");
const { auditLog } = require("../audit/auditLog");
const { requireRotAuth, requireRotPermission, userHasRotPermission } = require("../auth/middleware");
const { randomId } = require("../secureRandom");
const { noStore } = require("../security/noStore");
const { notifyUsers } = require("../notifications/helpers");
const { sendSstProtocolAssignedEmail, sendSstProtocolOpenedEmail } = require("../email/service");

// URL publica pra montar o link do e-mail (mesmo padrao do resto do
// email/service.js — ROT_PUBLIC_URL, com fallback pro dominio real).
const PUBLIC_APP_URL = process.env.ROT_PUBLIC_URL || "https://operacao.retiradas.tech";

const router = express.Router();
router.use(requireRotAuth, noStore);

function fail(status, message) {
	const error = new Error(message);
	error.status = status;
	throw error;
}

function nullableText(value, max = 2000) {
	const text = String(value ?? "").trim();
	return text ? text.slice(0, max) : null;
}

const PROTOCOL_TYPES = ["quase_acidente", "acidente", "incidente", "desvio", "inspecao_nao_conforme", "solicitacao", "risco_identificado", "atividade_interrompida", "epi_epc", "outro"];
const PROTOCOL_STATUSES = ["ABERTO", "EM_TRIAGEM", "EM_ANALISE", "EM_TRATATIVA", "AGUARDANDO_INFORMACAO", "AGUARDANDO_VALIDACAO", "CONCLUIDO", "CANCELADO", "DUPLICADO"];
const STATUS_LABELS = {
	ABERTO: "Aberto", EM_TRIAGEM: "Em triagem", EM_ANALISE: "Em análise", EM_TRATATIVA: "Em tratativa",
	AGUARDANDO_INFORMACAO: "Aguardando informação", AGUARDANDO_VALIDACAO: "Aguardando validação",
	CONCLUIDO: "Concluído", CANCELADO: "Cancelado", DUPLICADO: "Duplicado",
};
const PROTOCOL_PRIORITIES = ["baixa", "media", "alta", "critica"];
const CONSEQUENCE_TYPES = ["queda", "choque_eletrico", "atropelamento", "colisao", "queda_objeto", "dano_material", "exposicao", "lesao_potencial", "outro"];

// Campos especificos por tipo de ocorrencia (secoes 28-32 da
// especificacao), guardados em sst_protocols.details — nao justificam
// coluna fixa nem tabela por tipo, e sao os mesmos pra quase acidente/
// desvio/acidente/incidente (investigacao usa causa raiz e medidas
// independente do tipo).
function sanitizeDetails(raw) {
	if (!raw || typeof raw !== "object") return {};
	const details = {};
	if (raw.potentialConsequence && CONSEQUENCE_TYPES.includes(raw.potentialConsequence)) details.potentialConsequence = raw.potentialConsequence;
	if (nullableText(raw.immediateAction, 1000)) details.immediateAction = nullableText(raw.immediateAction, 1000);
	if (nullableText(raw.rootCause, 2000)) details.rootCause = nullableText(raw.rootCause, 2000);
	if (nullableText(raw.correctiveMeasures, 2000)) details.correctiveMeasures = nullableText(raw.correctiveMeasures, 2000);
	return details;
}

// Fase B do dominio Seguranca do Trabalho: so o cockpit inicial. Nao ha
// ainda tabela de protocolo (isso e Fase C) — os numeros abaixo sao
// reais (zero), nao inventados, ate a fundacao de protocolos existir.
router.get("/dashboard", requireRotPermission("sst.dashboard.visualizar"), async (req, res, next) => {
	try {
		const { clause, params } = await protocolVisibilityClause(req);
		const { rows } = await db.query(
			`select
				count(*) filter (where status not in ('CONCLUIDO','CANCELADO','DUPLICADO'))::int as open_protocols,
				count(*) filter (where priority = 'critica' and status not in ('CONCLUIDO','CANCELADO','DUPLICADO'))::int as critical_protocols,
				count(*) filter (where type = 'quase_acidente' and created_at >= now() - interval '30 days')::int as near_misses_in_period
			 from sst_protocols p where ${clause}`,
			params,
		);
		res.json({
			ok: true,
			openProtocols: rows[0]?.open_protocols || 0,
			criticalProtocols: rows[0]?.critical_protocols || 0,
			overdueActions: 0,
			nearMissesInPeriod: rows[0]?.near_misses_in_period || 0,
		});
	} catch (error) {
		next(error);
	}
});

// Time SST (tecnico + gestor) pra popular o seletor de "atribuir a
// outra pessoa". So quem ja pode atribuir enxerga a lista.
router.get("/team", requireRotPermission("sst.protocolo.atribuir"), async (req, res, next) => {
	try {
		// Nao restringe aos cargos sst_tech/sst_manager por id — qualquer
		// pessoa cujo cargo realmente segure sst.protocolo.responder conta
		// como "equipe SST" (inclui site_admin, que herda tudo via "*" na
		// coluna legada em vez de linha na tabela de permissoes).
		const { rows } = await db.query(
			`select u.id, u.name, r.name as role_name from rot_users u
			 join rot_roles r on r.id = u.role_id
			 where u.status = 'ativo'
			   and (
			     r.id = 'site_admin'
			     or exists (select 1 from rot_role_permissions rp where rp.role_id = r.id and rp.permission_id = 'sst.protocolo.responder')
			     or (
			       not exists (select 1 from rot_role_permissions rp2 where rp2.role_id = r.id)
			       and (r.permissions ? 'sst.protocolo.responder' or r.permissions ? '*')
			     )
			   )
			 order by u.name`,
		);
		res.json({ ok: true, items: rows.map((row) => ({ id: row.id, name: row.name, context: row.role_name })) });
	} catch (error) {
		next(error);
	}
});

// Quem tem visao total (gestao SST global) enxerga tudo; quem tem
// abrangencia (tecnico/gestor SST regional) fica restrito a propria
// regional + operacoes atribuidas; quem nao e SST so ve o que abriu, o
// que e sobre si mesmo, ou o que envolve alguem que gerencia (modo
// acompanhamento — resolvido no detalhe, nao aqui).
async function protocolVisibilityClause(req, alias = "p") {
	if (userHasRotPermission(req.rotUser, "sst.protocolo.visualizar_todos")) {
		return { clause: "true", params: [] };
	}
	if (userHasRotPermission(req.rotUser, "sst.protocolo.visualizar_abrangencia")) {
		const params = [];
		const conditions = [];
		if (!req.rotUser.is_global) {
			params.push(req.rotUser.regional_id);
			conditions.push(`${alias}.regional_id = $${params.length}`);
			const scopes = Array.isArray(req.rotUser.operation_scopes) && req.rotUser.operation_scopes.length ? req.rotUser.operation_scopes : ["ROT"];
			params.push(scopes);
			conditions.push(`(${alias}.operation_scope is null or ${alias}.operation_scope = any($${params.length}::text[]))`);
		}
		return { clause: conditions.length ? conditions.join(" and ") : "true", params };
	}
	// Gestor operacional (nao-SST) da regional acompanha TODOS os
	// protocolos da propria regional, em modo leitura — nao so os que
	// envolvem colaboradores especificos. Resolvido no detalhe via
	// assertProtocolViewable.
	if (await isRegionalLeadership(req)) {
		if (req.rotUser.is_global) return { clause: "true", params: [] };
		return { clause: `${alias}.regional_id = $1`, params: [req.rotUser.regional_id] };
	}
	const params = [req.rotUser.id];
	let clause = `(${alias}.requested_by = $1 or ${alias}.employee_id = $1`;
	const managedIds = await getManagedEmployeeIds(req);
	if (managedIds.length) {
		params.push(managedIds);
		clause += ` or ${alias}.employee_id = any($${params.length}::text[])`;
	}
	clause += ")";
	return { clause, params };
}

// "Gestor" = lideranca operacional (nao precisa ser SST): nivel de
// cargo alto o suficiente (tech_lead pra cima) ou lider/supervisor
// formal da regional via regional_responsaveis.
async function isRegionalLeadership(req) {
	if (req.rotUser.is_global) return true;
	if (Number(req.rotUser.role_level) >= 60) return true;
	if (!req.rotUser.regional_id) return false;
	const { rows } = await db.query(
		`select 1 from regional_responsaveis where regional_id = $1 and tipo in ('lider','supervisor') and source_payload->>'userId' = $2 limit 1`,
		[req.rotUser.regional_id, req.rotUser.id],
	);
	return rows.length > 0;
}

// Hierarquia REAL ja existente: mesma regional + nivel de cargo maior
// (mesmo criterio usado no RBAC de Usuarios/Cargos), OU lideranca formal
// da regional via regional_responsaveis. Nao existe FK direta
// colaborador->gestor no projeto — essa e a fonte de verdade real.
async function getManagedEmployeeIds(req) {
	if (req.rotUser.is_global || !req.rotUser.regional_id) return [];
	const { rows } = await db.query(
		`select u.id from rot_users u
		 join rot_roles r on r.id = u.role_id
		 where u.regional_id = $1 and coalesce(r.level, 0) < $2 and u.id <> $3`,
		[req.rotUser.regional_id, req.rotUser.role_level, req.rotUser.id],
	);
	let ids = rows.map((row) => row.id);
	const { rows: leadRows } = await db.query(
		`select 1 from regional_responsaveis where regional_id = $1 and tipo in ('lider','supervisor') and source_payload->>'userId' = $2 limit 1`,
		[req.rotUser.regional_id, req.rotUser.id],
	);
	if (leadRows.length) {
		const { rows: allInRegional } = await db.query(`select id from rot_users where regional_id = $1 and id <> $2`, [req.rotUser.regional_id, req.rotUser.id]);
		ids = Array.from(new Set([...ids, ...allInRegional.map((row) => row.id)]));
	}
	return ids;
}

const PROTOCOL_SELECT = `
	select p.*,
		r.nome as regional_name,
		bc.nome as base_name,
		c.nome as company_name,
		emp.name as employee_name,
		req.name as requested_by_name,
		asg.name as assigned_to_name,
		a.code as asset_code, a.name as asset_name,
		rel.protocol_number as related_protocol_number
	from sst_protocols p
	left join regionais r on r.id = p.regional_id
	left join regional_cidades bc on bc.id = p.base_id
	left join operacao_empresas c on c.id = p.company_id
	left join rot_users emp on emp.id = p.employee_id
	left join rot_users req on req.id = p.requested_by
	left join rot_users asg on asg.id = p.assigned_to
	left join rot_assets a on a.id = p.asset_id
	left join sst_protocols rel on rel.id = p.related_protocol_id
`;

function publicProtocol(row, isSstStaff) {
	return {
		id: row.id,
		protocolNumber: row.protocol_number,
		type: row.type,
		subject: row.subject,
		description: row.description,
		status: row.status,
		priority: row.priority,
		operationScope: row.operation_scope,
		regionalId: row.regional_id,
		regionalName: row.regional_name,
		baseId: row.base_id,
		baseName: row.base_name,
		companyId: row.company_id,
		companyName: row.company_name,
		employeeId: row.employee_id,
		employeeName: row.employee_name,
		requestedBy: row.requested_by,
		requestedByName: row.requested_by_name,
		assignedTo: row.assigned_to,
		assignedToName: row.assigned_to_name,
		assetId: row.asset_id,
		assetCode: row.asset_code,
		assetName: row.asset_name,
		aprId: row.apr_id,
		relatedProtocolId: row.related_protocol_id,
		details: row.details || {},
		relatedProtocolNumber: row.related_protocol_number,
		location: row.location,
		riskPresent: row.risk_present,
		closedAt: row.closed_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		viewMode: isSstStaff ? "sst" : "readonly",
	};
}

async function protocolTimeline(client, req, protocolId, eventType, title, description, before, after) {
	await client.query(
		`insert into sst_protocol_timeline (protocol_id, event_type, title, description, before_data, after_data, created_by)
		 values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
		[protocolId, eventType, title, description, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, req.rotUser.id],
	);
}

// Notifica todos os interessados de um protocolo (solicitante,
// colaborador, responsavel SST) em qualquer movimentacao relevante —
// nao so mensagens/atribuicao, tambem status/prioridade/conclusao.
// Nunca notifica quem executou a propria acao.
async function notifyProtocolStakeholders(client, req, protocol, { type, title, body }) {
	const ids = Array.from(new Set([protocol.requested_by, protocol.employee_id, protocol.assigned_to].filter((uid) => uid && uid !== req.rotUser.id)));
	if (!ids.length) return;
	await notifyUsers(client, {
		userIds: ids,
		type,
		title,
		body,
		entityType: "SST_PROTOCOL",
		entityId: protocol.id,
		deepLink: `/seguranca-trabalho/protocolos/${protocol.id}`,
	});
}

async function generateProtocolNumber(client) {
	const year = new Date().getFullYear();
	await client.query(`insert into sst_protocol_sequences (year, next_number) values ($1, 1) on conflict (year) do nothing`, [year]);
	const { rows } = await client.query(`select next_number from sst_protocol_sequences where year = $1 for update`, [year]);
	const number = Number(rows[0].next_number);
	await client.query(`update sst_protocol_sequences set next_number = next_number + 1 where year = $1`, [year]);
	return `SST-${year}-${String(number).padStart(6, "0")}`;
}

async function loadProtocolForUpdate(client, id) {
	const { rows } = await client.query(`${PROTOCOL_SELECT} where p.id = $1 for update of p`, [id]);
	if (!rows[0]) fail(404, "Protocolo não encontrado.");
	return rows[0];
}

// Alem de sst.protocolo.visualizar_*, o proprio solicitante, o
// colaborador envolvido e quem o gerencia (modo acompanhamento) podem
// ver — mas so quem tem permissao de gestao pode editar.
async function assertProtocolViewable(req, row) {
	const isSstStaff = userHasRotPermission(req.rotUser, ["sst.protocolo.visualizar_abrangencia", "sst.protocolo.visualizar_todos"]);
	if (isSstStaff) return true;
	if (row.requested_by === req.rotUser.id || row.employee_id === req.rotUser.id) return false;
	if (await isRegionalLeadership(req) && row.regional_id && (req.rotUser.is_global || row.regional_id === req.rotUser.regional_id)) return false;
	const managedIds = await getManagedEmployeeIds(req);
	if (row.employee_id && managedIds.includes(row.employee_id)) return false;
	fail(404, "Protocolo não encontrado.");
	return false;
}

router.get("/protocols", async (req, res, next) => {
	try {
		const { clause, params } = await protocolVisibilityClause(req);
		const conditions = [clause];
		const values = [...params];
		if (req.query.status) {
			values.push(req.query.status);
			conditions.push(`p.status = $${values.length}`);
		}
		if (req.query.priority) {
			values.push(req.query.priority);
			conditions.push(`p.priority = $${values.length}`);
		}
		if (req.query.type) {
			values.push(req.query.type);
			conditions.push(`p.type = $${values.length}`);
		}
		if (req.query.q) {
			values.push(`%${req.query.q}%`);
			conditions.push(`(p.protocol_number ilike $${values.length} or p.subject ilike $${values.length})`);
		}
		const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
		const { rows } = await db.query(
			`${PROTOCOL_SELECT} where ${conditions.join(" and ")} order by p.created_at desc limit ${limit}`,
			values,
		);
		const isSstStaff = userHasRotPermission(req.rotUser, ["sst.protocolo.visualizar_abrangencia", "sst.protocolo.visualizar_todos"]);
		res.json({ ok: true, items: rows.map((row) => publicProtocol(row, isSstStaff)) });
	} catch (error) {
		next(error);
	}
});

router.get("/protocols/:id", async (req, res, next) => {
	try {
		const { rows } = await db.query(`${PROTOCOL_SELECT} where p.id = $1`, [req.params.id]);
		const row = rows[0];
		if (!row) fail(404, "Protocolo não encontrado.");
		await assertProtocolViewable(req, row);
		const isSstStaff = userHasRotPermission(req.rotUser, ["sst.protocolo.visualizar_abrangencia", "sst.protocolo.visualizar_todos"]);
		const { rows: timeline } = await db.query(
			`select t.*, u.name as created_by_name from sst_protocol_timeline t left join rot_users u on u.id = t.created_by where t.protocol_id = $1 order by t.created_at desc, t.id desc`,
			[req.params.id],
		);
		const { rows: messageRows } = await db.query(
			`select m.*, u.name as author_name from sst_protocol_messages m left join rot_users u on u.id = m.author_id
			 where m.protocol_id = $1 ${isSstStaff ? "" : "and m.visibility = 'compartilhado'"} order by m.created_at`,
			[req.params.id],
		);
		const { rows: requestRows } = await db.query(
			`select r.*, req.name as requested_by_name, tgt.name as target_user_name
			 from sst_information_requests r
			 left join rot_users req on req.id = r.requested_by
			 left join rot_users tgt on tgt.id = r.target_user_id
			 where r.protocol_id = $1 order by r.created_at desc`,
			[req.params.id],
		);
		const { rows: actionPlanRows } = await db.query(`${ACTION_PLAN_SELECT} where ap.protocol_id = $1 order by ap.created_at desc`, [req.params.id]);
		res.json({
			ok: true,
			protocol: publicProtocol(row, isSstStaff),
			timeline: timeline.map((item) => ({
				id: item.id,
				eventType: item.event_type,
				title: item.title,
				description: item.description,
				createdBy: item.created_by,
				createdByName: item.created_by_name || "Sistema",
				createdAt: item.created_at,
			})),
			messages: messageRows.map((item) => ({
				id: item.id,
				authorId: item.author_id,
				authorName: item.author_name || "Sistema",
				visibility: item.visibility,
				body: item.body,
				createdAt: item.created_at,
			})),
			informationRequests: requestRows.map((item) => ({
				id: item.id,
				requestedBy: item.requested_by,
				requestedByName: item.requested_by_name,
				targetUserId: item.target_user_id,
				targetUserName: item.target_user_name,
				question: item.question,
				status: item.status,
				answer: item.answer,
				answeredAt: item.answered_at,
				createdAt: item.created_at,
				canAnswer: item.status === "pending" && item.target_user_id === req.rotUser.id,
			})),
			actionPlans: actionPlanRows.map((item) => publicActionPlan(item, req)),
		});
	} catch (error) {
		next(error);
	}
});

// Porta de entrada aberta: qualquer usuario autenticado pode reportar
// pra Seguranca do Trabalho (CTA contextual), nao so quem tem
// sst.protocolo.criar. Quem nao e SST so define dados basicos —
// prioridade/responsavel ficam com o SST na triagem.
router.post("/protocols", async (req, res, next) => {
	let client;
	try {
		const type = String(req.body?.type || "").trim();
		if (!PROTOCOL_TYPES.includes(type)) fail(400, "Informe um tipo de ocorrência válido.");
		const subject = nullableText(req.body?.subject, 200);
		if (!subject) fail(400, "Informe o assunto do protocolo.");
		const isSstStaff = userHasRotPermission(req.rotUser, "sst.protocolo.criar");

		const employeeId = nullableText(req.body?.employeeId) || req.rotUser.id;
		const priority = isSstStaff && PROTOCOL_PRIORITIES.includes(req.body?.priority) ? req.body.priority : "media";
		const assignedTo = isSstStaff ? nullableText(req.body?.assignedTo) : null;

		client = await db.connect();
		await client.query("begin");
		const id = randomId("sstp");
		const protocolNumber = await generateProtocolNumber(client);
		const { rows } = await client.query(
			`insert into sst_protocols (
				id, protocol_number, type, subject, description, priority,
				operation_scope, regional_id, base_id, company_id,
				employee_id, requested_by, assigned_to, asset_id, apr_id, related_protocol_id,
				location, risk_present, details
			) values (
				$1,$2,$3,$4,$5,$6,
				$7,$8,$9,$10,
				$11,$12,$13,$14,$15,$16,
				$17,$18,$19::jsonb
			) returning *`,
			[
				id, protocolNumber, type, subject, nullableText(req.body?.description, 4000), priority,
				req.body?.operationScope || null, req.body?.regionalId || req.rotUser.regional_id || null, req.body?.baseId || null, req.body?.companyId || null,
				employeeId, req.rotUser.id, assignedTo, req.body?.assetId || null, req.body?.aprId || null, req.body?.relatedProtocolId || null,
				nullableText(req.body?.location, 300), req.body?.riskPresent === true, JSON.stringify(sanitizeDetails(req.body?.details)),
			],
		);
		await protocolTimeline(client, req, id, "created", "Protocolo aberto", `${req.rotUser.name || "Usuário"} abriu o protocolo ${protocolNumber}.`, null, rows[0]);
		await client.query("commit");
		await auditLog(req, { action: "create", entity: "sst_protocols", entityId: id, after: rows[0] });
		const { rows: hydrated } = await db.query(`${PROTOCOL_SELECT} where p.id = $1`, [id]);
		if (!assignedTo) {
			// Sem responsavel definido na criacao: avisa por e-mail todo
			// mundo com o cargo de Gestor SST (assim que alguem assumir, os
			// avisos passam a ir so pra essa pessoa — ver endpoint /assign).
			db.query(
				`select u.id, u.name, u.email from rot_users u
				 join rot_roles r on r.id = u.role_id
				 where u.status = 'ativo' and u.email is not null and u.email <> ''
				   and exists (select 1 from rot_role_permissions rp where rp.role_id = r.id and rp.permission_id = 'sst.protocolo.atribuir')`,
			)
				.then(({ rows: managers }) =>
					sendSstProtocolOpenedEmail({
						recipients: managers,
						protocolNumber,
						subject,
						type,
						priority,
						employeeName: hydrated[0]?.employee_name,
						protocolUrl: `${PUBLIC_APP_URL}/seguranca-trabalho/protocolos/${id}`,
					}),
				)
				.catch((error) => console.warn("[rot-sst-email]", error?.message || error));
		}
		res.status(201).json({ ok: true, protocol: publicProtocol(hydrated[0], isSstStaff) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.patch("/protocols/:id", requireRotPermission("sst.protocolo.editar"), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const before = await loadProtocolForUpdate(client, req.params.id);
		const mergedDetails = req.body?.details && typeof req.body.details === "object" ? { ...(before.details || {}), ...sanitizeDetails(req.body.details) } : before.details;
		const { rows } = await client.query(
			`update sst_protocols set
				subject = coalesce($2, subject),
				description = case when $3::text is not null then $3 else description end,
				location = case when $4::text is not null then $4 else location end,
				risk_present = coalesce($5, risk_present),
				details = $6::jsonb
			 where id = $1 returning *`,
			[req.params.id, nullableText(req.body?.subject, 200), nullableText(req.body?.description, 4000), nullableText(req.body?.location, 300), req.body?.riskPresent, JSON.stringify(mergedDetails)],
		);
		await protocolTimeline(client, req, req.params.id, "updated", "Protocolo atualizado", "Dados do protocolo foram atualizados.", before, rows[0]);
		await notifyProtocolStakeholders(client, req, before, { type: "sst_protocol_updated", title: "Protocolo atualizado", body: `${before.protocol_number} teve dados atualizados.` });
		await client.query("commit");
		await auditLog(req, { action: "update", entity: "sst_protocols", entityId: req.params.id, before, after: rows[0] });
		const isSstStaff = userHasRotPermission(req.rotUser, ["sst.protocolo.visualizar_abrangencia", "sst.protocolo.visualizar_todos"]);
		res.json({ ok: true, protocol: publicProtocol(rows[0], isSstStaff) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/protocols/:id/assign", requireRotPermission("sst.protocolo.atribuir"), async (req, res, next) => {
	let client;
	try {
		const assignedTo = nullableText(req.body?.assignedTo) || req.rotUser.id;
		client = await db.connect();
		await client.query("begin");
		const before = await loadProtocolForUpdate(client, req.params.id);
		const { rows: userRows } = await client.query(`select name, email from rot_users where id = $1`, [assignedTo]);
		if (!userRows[0]) fail(400, "Usuário responsável inválido.");
		await client.query(`update sst_protocols set assigned_to = $2 where id = $1 returning *`, [req.params.id, assignedTo]);
		const beforeName = before.assigned_to_name || "Não atribuído";
		await protocolTimeline(client, req, req.params.id, "assigned", "Responsável alterado", `${beforeName} → ${userRows[0].name}`, { assignedTo: before.assigned_to }, { assignedTo });
		if (assignedTo !== req.rotUser.id) {
			await notifyUsers(client, {
				userIds: [assignedTo],
				type: "sst_protocol_assigned",
				title: "Protocolo atribuído a você",
				body: `${before.protocol_number} · ${before.subject}`,
				entityType: "SST_PROTOCOL",
				entityId: req.params.id,
				deepLink: `/seguranca-trabalho/protocolos/${req.params.id}`,
			});
		}
		await client.query("commit");
		await auditLog(req, { action: "assign", entity: "sst_protocols", entityId: req.params.id, before: { assignedTo: before.assigned_to }, after: { assignedTo } });
		if (userRows[0].email) {
			sendSstProtocolAssignedEmail({
				to: userRows[0].email,
				name: userRows[0].name,
				protocolNumber: before.protocol_number,
				subject: before.subject,
				protocolUrl: `${PUBLIC_APP_URL}/seguranca-trabalho/protocolos/${req.params.id}`,
			}).catch((error) => console.warn("[rot-sst-email]", error?.message || error));
		}
		const { rows: hydrated } = await db.query(`${PROTOCOL_SELECT} where p.id = $1`, [req.params.id]);
		res.json({ ok: true, protocol: publicProtocol(hydrated[0], true) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/protocols/:id/change-priority", requireRotPermission("sst.protocolo.alterar_prioridade"), async (req, res, next) => {
	let client;
	try {
		const priority = String(req.body?.priority || "");
		if (!PROTOCOL_PRIORITIES.includes(priority)) fail(400, "Prioridade inválida.");
		client = await db.connect();
		await client.query("begin");
		const before = await loadProtocolForUpdate(client, req.params.id);
		const { rows } = await client.query(`update sst_protocols set priority = $2 where id = $1 returning *`, [req.params.id, priority]);
		await protocolTimeline(client, req, req.params.id, "priority_changed", "Prioridade alterada", `${before.priority} → ${priority}`, { priority: before.priority }, { priority });
		await notifyProtocolStakeholders(client, req, before, { type: "sst_priority_changed", title: "Prioridade do protocolo alterada", body: `${before.protocol_number} agora é ${priority}.` });
		await client.query("commit");
		await auditLog(req, { action: "change_priority", entity: "sst_protocols", entityId: req.params.id, before: { priority: before.priority }, after: { priority } });
		const isSstStaff = userHasRotPermission(req.rotUser, ["sst.protocolo.visualizar_abrangencia", "sst.protocolo.visualizar_todos"]);
		res.json({ ok: true, protocol: publicProtocol(rows[0], isSstStaff) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/protocols/:id/change-status", requireRotPermission("sst.protocolo.alterar_status"), async (req, res, next) => {
	let client;
	try {
		const status = String(req.body?.status || "");
		if (!PROTOCOL_STATUSES.includes(status)) fail(400, "Status inválido.");
		client = await db.connect();
		await client.query("begin");
		const before = await loadProtocolForUpdate(client, req.params.id);
		const closedAt = status === "CONCLUIDO" ? "now()" : "null";
		const { rows } = await client.query(`update sst_protocols set status = $2, closed_at = ${closedAt} where id = $1 returning *`, [req.params.id, status]);
		await protocolTimeline(client, req, req.params.id, "status_changed", "Status alterado", `${before.status} → ${status}`, { status: before.status }, { status });
		await notifyProtocolStakeholders(client, req, before, { type: "sst_status_changed", title: "Status do protocolo alterado", body: `${before.protocol_number} agora está ${STATUS_LABELS[status] || status}.` });
		await client.query("commit");
		await auditLog(req, { action: "change_status", entity: "sst_protocols", entityId: req.params.id, before: { status: before.status }, after: { status } });
		const isSstStaff = userHasRotPermission(req.rotUser, ["sst.protocolo.visualizar_abrangencia", "sst.protocolo.visualizar_todos"]);
		res.json({ ok: true, protocol: publicProtocol(rows[0], isSstStaff) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/protocols/:id/close", requireRotPermission("sst.protocolo.concluir"), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const before = await loadProtocolForUpdate(client, req.params.id);
		await client.query(`update sst_protocols set status = 'CONCLUIDO', closed_at = now() where id = $1 returning *`, [req.params.id]);
		await protocolTimeline(client, req, req.params.id, "closed", "Protocolo concluído", nullableText(req.body?.note, 1000) || "Tratativa encerrada pela Segurança do Trabalho.", { status: before.status }, { status: "CONCLUIDO" });
		await notifyProtocolStakeholders(client, req, before, { type: "sst_protocol_closed", title: "Protocolo concluído", body: `${before.protocol_number} foi concluído.` });
		await client.query("commit");
		await auditLog(req, { action: "close", entity: "sst_protocols", entityId: req.params.id, before: { status: before.status }, after: { status: "CONCLUIDO" } });
		const { rows: hydrated } = await db.query(`${PROTOCOL_SELECT} where p.id = $1`, [req.params.id]);
		res.json({ ok: true, protocol: publicProtocol(hydrated[0], true) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Comunicacao estruturada: nota interna (so SST ve) vs resposta oficial
// (visivel a quem acompanha o protocolo). As duas sao sempre escritas
// pela Segurança do Trabalho — quem so acompanha participa respondendo
// uma solicitacao de informacao, nao postando mensagem livre.
router.post("/protocols/:id/messages", requireRotPermission("sst.protocolo.responder"), async (req, res, next) => {
	let client;
	try {
		const visibility = req.body?.visibility === "interno" ? "interno" : "compartilhado";
		const body = nullableText(req.body?.body, 4000);
		if (!body) fail(400, "Escreva uma mensagem.");
		client = await db.connect();
		await client.query("begin");
		const protocol = await loadProtocolForUpdate(client, req.params.id);
		const id = randomId("sstmsg");
		await client.query(
			`insert into sst_protocol_messages (id, protocol_id, author_id, visibility, body) values ($1,$2,$3,$4,$5)`,
			[id, req.params.id, req.rotUser.id, visibility, body],
		);
		await protocolTimeline(
			client, req, req.params.id,
			visibility === "interno" ? "internal_note" : "official_response",
			visibility === "interno" ? "Nota interna adicionada" : "Resposta oficial enviada",
			visibility === "interno" ? "Visível somente para a equipe de Segurança do Trabalho." : body.slice(0, 200),
			null, null,
		);
		if (visibility === "compartilhado") {
			const notifyIds = [protocol.requested_by, protocol.employee_id].filter((uid) => uid && uid !== req.rotUser.id);
			await notifyUsers(client, {
				userIds: notifyIds,
				type: "sst_protocol_response",
				title: "Nova resposta no protocolo",
				body: `${protocol.protocol_number} · ${protocol.subject}`,
				entityType: "SST_PROTOCOL",
				entityId: req.params.id,
				deepLink: `/seguranca-trabalho/protocolos/${req.params.id}`,
			});
		}
		await client.query("commit");
		await auditLog(req, { action: "message", entity: "sst_protocols", entityId: req.params.id, after: { visibility, body } });
		res.status(201).json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Muda o protocolo pra AGUARDANDO_INFORMACAO ate a pessoa responder —
// esse e o UNICO jeito de quem so acompanha (colaborador/gestor)
// participar ativamente, sem virar permissao geral de edicao.
router.post("/protocols/:id/information-requests", requireRotPermission("sst.protocolo.solicitar_informacao"), async (req, res, next) => {
	let client;
	try {
		const targetUserId = nullableText(req.body?.targetUserId);
		const question = nullableText(req.body?.question, 1000);
		if (!targetUserId) fail(400, "Selecione o destinatário.");
		if (!question) fail(400, "Escreva a pergunta.");
		client = await db.connect();
		await client.query("begin");
		const protocol = await loadProtocolForUpdate(client, req.params.id);
		const { rows: targetRows } = await client.query(`select name from rot_users where id = $1`, [targetUserId]);
		if (!targetRows[0]) fail(400, "Destinatário inválido.");
		const id = randomId("sstir");
		await client.query(
			`insert into sst_information_requests (id, protocol_id, requested_by, target_user_id, question) values ($1,$2,$3,$4,$5)`,
			[id, req.params.id, req.rotUser.id, targetUserId, question],
		);
		await client.query(`update sst_protocols set status = 'AGUARDANDO_INFORMACAO' where id = $1`, [req.params.id]);
		await protocolTimeline(client, req, req.params.id, "information_requested", "Informação solicitada", `Solicitado a ${targetRows[0].name}: ${question}`, { status: protocol.status }, { status: "AGUARDANDO_INFORMACAO" });
		await notifyUsers(client, {
			userIds: [targetUserId],
			type: "sst_information_requested",
			title: "Segurança do Trabalho solicitou sua manifestação",
			body: `${protocol.protocol_number} · ${question}`,
			entityType: "SST_PROTOCOL",
			entityId: req.params.id,
			deepLink: `/seguranca-trabalho/protocolos/${req.params.id}`,
		});
		await client.query("commit");
		await auditLog(req, { action: "request_information", entity: "sst_protocols", entityId: req.params.id, after: { targetUserId, question } });
		res.status(201).json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// So o proprio destinatario responde — nao e permissao de gestao, e
// vinculo de quem foi solicitado. Depois de responder, volta a ser
// somente-leitura pra essa pessoa (nao vira acesso permanente).
router.post("/protocols/:id/information-requests/:requestId/answer", async (req, res, next) => {
	let client;
	try {
		const answer = nullableText(req.body?.answer, 4000);
		if (!answer) fail(400, "Escreva sua resposta.");
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(`select * from sst_information_requests where id = $1 and protocol_id = $2 for update`, [req.params.requestId, req.params.id]);
		const request = rows[0];
		if (!request) fail(404, "Solicitação não encontrada.");
		if (request.target_user_id !== req.rotUser.id) fail(403, "Esta solicitação não é destinada a você.");
		if (request.status === "answered") fail(409, "Esta solicitação já foi respondida.");
		await client.query(`update sst_information_requests set status='answered', answer=$2, answered_at=now() where id=$1`, [req.params.requestId, answer]);
		await protocolTimeline(client, req, req.params.id, "information_received", "Gestor/colaborador respondeu à solicitação de informação", answer.slice(0, 200), null, null);
		const notifyIds = [request.requested_by].filter(Boolean);
		await notifyUsers(client, {
			userIds: notifyIds,
			type: "sst_information_received",
			title: "Resposta recebida no protocolo",
			body: answer.slice(0, 200),
			entityType: "SST_PROTOCOL",
			entityId: req.params.id,
			deepLink: `/seguranca-trabalho/protocolos/${req.params.id}`,
		});
		await client.query("commit");
		await auditLog(req, { action: "answer_information_request", entity: "sst_protocols", entityId: req.params.id, after: { answer } });
		res.json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Plano de Acao: entidade unica reutilizavel (secao 37 — "nao criar
// uma implementacao diferente de acao pra cada modulo"). Por enquanto
// so nasce de protocolo, mas protocol_id fica nullable de proposito
// pra quando APR/inspecao tiverem fluxo proprio nas proximas fases.
const ACTION_PLAN_SELECT = `
	select ap.*,
		p.protocol_number,
		resp.name as responsible_name,
		val.name as validator_name,
		creator.name as created_by_name
	from sst_action_plans ap
	left join sst_protocols p on p.id = ap.protocol_id
	left join rot_users resp on resp.id = ap.responsible_id
	left join rot_users val on val.id = ap.validator_id
	left join rot_users creator on creator.id = ap.created_by
`;

function publicActionPlan(row, req) {
	return {
		id: row.id,
		protocolId: row.protocol_id,
		protocolNumber: row.protocol_number,
		title: row.title,
		description: row.description,
		responsibleId: row.responsible_id,
		responsibleName: row.responsible_name,
		operationScope: row.operation_scope,
		regionalId: row.regional_id,
		baseId: row.base_id,
		companyId: row.company_id,
		priority: row.priority,
		dueDate: row.due_date,
		status: row.status,
		overdue: !["CONCLUIDO", "CANCELADO"].includes(row.status) && row.due_date && new Date(row.due_date) < new Date(),
		completionNote: row.completion_note,
		validatorId: row.validator_id,
		validatorName: row.validator_name,
		validatedAt: row.validated_at,
		validationNote: row.validation_note,
		createdByName: row.created_by_name,
		createdAt: row.created_at,
		completedAt: row.completed_at,
		canSubmit: row.status === "EM_ANDAMENTO" && row.responsible_id === req.rotUser.id,
	};
}

router.post("/protocols/:id/action-plans", requireRotPermission("sst.protocolo.criar_acao"), async (req, res, next) => {
	let client;
	try {
		const title = nullableText(req.body?.title, 200);
		if (!title) fail(400, "Informe o título do plano de ação.");
		const responsibleId = nullableText(req.body?.responsibleId);
		if (!responsibleId) fail(400, "Selecione o responsável.");
		const priority = PROTOCOL_PRIORITIES.includes(req.body?.priority) ? req.body.priority : "media";
		client = await db.connect();
		await client.query("begin");
		const protocol = await loadProtocolForUpdate(client, req.params.id);
		const { rows: userRows } = await client.query(`select name from rot_users where id = $1`, [responsibleId]);
		if (!userRows[0]) fail(400, "Responsável inválido.");
		const id = randomId("sstap");
		const { rows } = await client.query(
			`insert into sst_action_plans (id, protocol_id, title, description, responsible_id, operation_scope, regional_id, base_id, company_id, priority, due_date, status, created_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'EM_ANDAMENTO',$12) returning *`,
			[
				id, req.params.id, title, nullableText(req.body?.description, 2000), responsibleId,
				protocol.operation_scope, protocol.regional_id, protocol.base_id, protocol.company_id,
				priority, req.body?.dueDate || null, req.rotUser.id,
			],
		);
		await protocolTimeline(client, req, req.params.id, "action_created", "Plano de ação criado", `${title} · responsável: ${userRows[0].name}`, null, null);
		if (responsibleId !== req.rotUser.id) {
			await notifyUsers(client, {
				userIds: [responsibleId],
				type: "sst_action_assigned",
				title: "Novo plano de ação atribuído a você",
				body: `${protocol.protocol_number} · ${title}`,
				entityType: "SST_PROTOCOL",
				entityId: req.params.id,
				deepLink: `/seguranca-trabalho/protocolos/${req.params.id}`,
			});
		}
		await client.query("commit");
		await auditLog(req, { action: "create", entity: "sst_action_plans", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.patch("/action-plans/:id", requireRotPermission("sst.plano_acao.gerenciar"), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows: beforeRows } = await client.query(`select * from sst_action_plans where id = $1 for update`, [req.params.id]);
		if (!beforeRows[0]) fail(404, "Plano de ação não encontrado.");
		const { rows } = await client.query(
			`update sst_action_plans set
				title = coalesce($2, title),
				description = case when $3::text is not null then $3 else description end,
				priority = coalesce($4, priority),
				due_date = case when $5::date is not null then $5 else due_date end
			 where id = $1 returning *`,
			[req.params.id, nullableText(req.body?.title, 200), nullableText(req.body?.description, 2000), PROTOCOL_PRIORITIES.includes(req.body?.priority) ? req.body.priority : null, req.body?.dueDate || null],
		);
		await client.query("commit");
		await auditLog(req, { action: "update", entity: "sst_action_plans", entityId: req.params.id, before: beforeRows[0], after: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Quem executa != quem valida (secao 40). O responsavel so pode
// submeter pra validacao; so quem tem sst.plano_acao.validar decide se
// volta pra EM_ANDAMENTO ou fecha como CONCLUIDO.
router.post("/action-plans/:id/submit", async (req, res, next) => {
	let client;
	try {
		const completionNote = nullableText(req.body?.completionNote, 2000);
		if (!completionNote) fail(400, "Descreva o que foi feito antes de enviar para validação.");
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(`select * from sst_action_plans where id = $1 for update`, [req.params.id]);
		const plan = rows[0];
		if (!plan) fail(404, "Plano de ação não encontrado.");
		if (plan.responsible_id !== req.rotUser.id && !userHasRotPermission(req.rotUser, "sst.plano_acao.gerenciar")) fail(403, "Você não é o responsável por este plano de ação.");
		if (plan.status !== "EM_ANDAMENTO") fail(409, "Este plano de ação não está em andamento.");
		const { rows: updated } = await client.query(
			`update sst_action_plans set status='AGUARDANDO_VALIDACAO', completion_note=$2 where id=$1 returning *`,
			[req.params.id, completionNote],
		);
		if (plan.protocol_id) {
			await protocolTimeline(client, req, plan.protocol_id, "action_submitted", "Plano de ação enviado para validação", `${plan.title}: ${completionNote}`, null, null);
			const { rows: protoRows } = await client.query(`select * from sst_protocols where id = $1`, [plan.protocol_id]);
			if (protoRows[0]) {
				await notifyProtocolStakeholders(client, req, protoRows[0], { type: "sst_action_submitted", title: "Plano de ação aguardando validação", body: plan.title });
			}
		}
		await client.query("commit");
		await auditLog(req, { action: "submit", entity: "sst_action_plans", entityId: req.params.id, after: updated[0] });
		res.json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/action-plans/:id/validate", requireRotPermission("sst.plano_acao.validar"), async (req, res, next) => {
	let client;
	try {
		const approved = req.body?.approved === true;
		const note = nullableText(req.body?.note, 1000);
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(`select * from sst_action_plans where id = $1 for update`, [req.params.id]);
		const plan = rows[0];
		if (!plan) fail(404, "Plano de ação não encontrado.");
		if (plan.status !== "AGUARDANDO_VALIDACAO") fail(409, "Este plano de ação não está aguardando validação.");
		const nextStatus = approved ? "CONCLUIDO" : "EM_ANDAMENTO";
		const { rows: updated } = await client.query(
			`update sst_action_plans set status=$2, validator_id=$3, validated_at=now(), validation_note=$4, completed_at = case when $2='CONCLUIDO' then now() else null end where id=$1 returning *`,
			[req.params.id, nextStatus, req.rotUser.id, note],
		);
		if (plan.protocol_id) {
			await protocolTimeline(client, req, plan.protocol_id, approved ? "action_validated" : "action_rejected", approved ? "Plano de ação validado" : "Plano de ação devolvido", note || (approved ? "Ação concluída e validada." : "Ação devolvida para ajustes."), null, null);
		}
		if (plan.responsible_id) {
			await notifyUsers(client, {
				userIds: [plan.responsible_id],
				type: approved ? "sst_action_completed" : "sst_action_rejected",
				title: approved ? "Plano de ação validado" : "Plano de ação devolvido pela SST",
				body: plan.title,
				entityType: "SST_PROTOCOL",
				entityId: plan.protocol_id,
				deepLink: plan.protocol_id ? `/seguranca-trabalho/protocolos/${plan.protocol_id}` : null,
			});
		}
		await client.query("commit");
		await auditLog(req, { action: "validate", entity: "sst_action_plans", entityId: req.params.id, after: updated[0] });
		res.json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ==========================================================================
// Relatorios SST — camada analitica sobre as MESMAS tabelas transacionais
// do protocolo/planos de acao (sst_protocols, sst_protocol_timeline,
// sst_action_plans). Nao duplica dado nem regra: reusa PROTOCOL_SELECT,
// protocolVisibilityClause, STATUS_LABELS/PROTOCOL_TYPES/PRIORIDADES e o
// mesmo RBAC granular do resto do dominio.
//
// SLA: o dominio SST ainda nao tem uma engine de SLA configuravel
// (nenhuma tabela/coluna de prazo por prioridade existe hoje). Definimos
// aqui um limite padrao por prioridade — unica fonte dessa regra no
// backend, usada tanto no calculo do resumo quanto na tabela detalhada.
// Se um dia existir configuracao real de SLA, e so trocar esta constante
// por leitura de config, sem duplicar a logica em outro lugar.
const SLA_THRESHOLD_MINUTES = { critica: 4 * 60, alta: 24 * 60, media: 72 * 60, baixa: 120 * 60 };

function parseReportPeriod(query) {
	const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999`) : new Date();
	const from = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000`) : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) fail(400, "Período inválido.");
	const spanMs = to.getTime() - from.getTime();
	const previousTo = new Date(from.getTime() - 1);
	const previousFrom = new Date(previousTo.getTime() - spanMs);
	const granularity = ["day", "week", "month"].includes(query.granularity)
		? query.granularity
		: spanMs <= 32 * 24 * 60 * 60 * 1000 ? "day" : spanMs <= 190 * 24 * 60 * 60 * 1000 ? "week" : "month";
	return { from, to, previousFrom, previousTo, granularity };
}

// Mesma visibilidade regional/abrangencia dos protocolos (secao 65 da
// especificacao: RBAC sempre validado no backend, nunca no filtro que o
// frontend manda) + os filtros globais da pagina de relatorios.
async function reportProtocolFilter(req, query, alias = "p") {
	const { clause, params } = await protocolVisibilityClause(req, alias);
	const conditions = [clause];
	const values = [...params];
	const eq = (col, val) => {
		values.push(val);
		conditions.push(`${alias}.${col} = $${values.length}`);
	};
	if (query.operationScope) eq("operation_scope", query.operationScope);
	if (query.regionalId) eq("regional_id", query.regionalId);
	if (query.baseId) eq("base_id", query.baseId);
	if (query.companyId) eq("company_id", query.companyId);
	if (query.type) eq("type", query.type);
	if (query.status) eq("status", query.status);
	if (query.priority) eq("priority", query.priority);
	if (query.assignedTo) eq("assigned_to", query.assignedTo);
	return { clause: conditions.join(" and "), params: values };
}

// Planos de acao carregam a propria regional/empresa/operacao (herdadas
// do protocolo na criacao — migration 050), entao a mesma regra de
// escopo regional se aplica direto na tabela, sem precisar de join.
async function reportActionPlanFilter(req, query) {
	const conditions = ["true"];
	const values = [];
	if (!userHasRotPermission(req.rotUser, "sst.protocolo.visualizar_todos") && !req.rotUser.is_global) {
		values.push(req.rotUser.regional_id);
		conditions.push(`ap.regional_id = $${values.length}`);
	}
	const eq = (col, val) => {
		values.push(val);
		conditions.push(`ap.${col} = $${values.length}`);
	};
	if (query.operationScope) eq("operation_scope", query.operationScope);
	if (query.regionalId) eq("regional_id", query.regionalId);
	if (query.baseId) eq("base_id", query.baseId);
	if (query.companyId) eq("company_id", query.companyId);
	return { clause: conditions.join(" and "), params: values };
}

function bucketExpr(alias, column, granularity) {
	if (granularity === "day") return `date_trunc('day', ${alias}.${column})`;
	if (granularity === "week") return `date_trunc('week', ${alias}.${column})`;
	return `date_trunc('month', ${alias}.${column})`;
}

// Resumo executivo (secoes 8-10, 21-23 da especificacao): KPIs do
// periodo + comparacao factual com o periodo imediatamente anterior de
// mesma duracao. Nao classifica a variacao como "melhor"/"pior".
router.get("/reports/summary", requireRotPermission("sst.relatorio.visualizar"), async (req, res, next) => {
	try {
		const period = parseReportPeriod(req.query);
		const { clause, params } = await reportProtocolFilter(req, req.query);

		async function countBetween(column, from, to) {
			const values = [...params, from, to];
			const { rows } = await db.query(
				`select count(*)::int as count from sst_protocols p where ${clause} and p.${column} >= $${values.length - 1} and p.${column} <= $${values.length}`,
				values,
			);
			return rows[0].count;
		}

		async function slaAndResolution(from, to) {
			const values = [...params, from, to];
			const { rows } = await db.query(
				`select p.priority, extract(epoch from (p.closed_at - p.created_at)) / 60 as minutes
				 from sst_protocols p
				 where ${clause} and p.closed_at is not null and p.closed_at >= $${values.length - 1} and p.closed_at <= $${values.length}`,
				values,
			);
			if (!rows.length) return { closedCount: 0, avgResolutionMinutes: null, slaCompliancePct: null };
			const compliant = rows.filter((row) => Number(row.minutes) <= (SLA_THRESHOLD_MINUTES[row.priority] || SLA_THRESHOLD_MINUTES.media)).length;
			const avg = rows.reduce((sum, row) => sum + Number(row.minutes), 0) / rows.length;
			return { closedCount: rows.length, avgResolutionMinutes: Math.round(avg), slaCompliancePct: Math.round((compliant / rows.length) * 1000) / 10 };
		}

		async function firstResponseMinutes(from, to) {
			const values = [...params, from, to];
			const { rows } = await db.query(
				`select extract(epoch from (fr.first_response_at - p.created_at)) / 60 as minutes
				 from sst_protocols p
				 join lateral (
					select min(t.created_at) as first_response_at from sst_protocol_timeline t
					where t.protocol_id = p.id and t.event_type <> 'created'
				 ) fr on fr.first_response_at is not null
				 where ${clause} and p.created_at >= $${values.length - 1} and p.created_at <= $${values.length}`,
				values,
			);
			if (!rows.length) return null;
			return Math.round(rows.reduce((sum, row) => sum + Number(row.minutes), 0) / rows.length);
		}

		const [opened, closed, sla, previousOpened, previousClosed, previousSla, firstResponse] = await Promise.all([
			countBetween("created_at", period.from, period.to),
			countBetween("closed_at", period.from, period.to),
			slaAndResolution(period.from, period.to),
			countBetween("created_at", period.previousFrom, period.previousTo),
			countBetween("closed_at", period.previousFrom, period.previousTo),
			slaAndResolution(period.previousFrom, period.previousTo),
			firstResponseMinutes(period.from, period.to),
		]);

		const { rows: openNowRows } = await db.query(
			`select count(*)::int as count from sst_protocols p where ${clause} and p.status not in ('CONCLUIDO','CANCELADO','DUPLICADO')`,
			params,
		);

		const { clause: apClause, params: apParams } = await reportActionPlanFilter(req, req.query);
		const { rows: overdueRows } = await db.query(
			`select count(*)::int as count from sst_action_plans ap where ${apClause} and ap.status not in ('CONCLUIDO','CANCELADO') and ap.due_date is not null and ap.due_date < current_date`,
			apParams,
		);

		function delta(current, previous) {
			if (previous === null || previous === undefined || previous === 0 || current === null) return null;
			return Math.round(((current - previous) / previous) * 1000) / 10;
		}

		res.json({
			ok: true,
			period: { from: period.from.toISOString(), to: period.to.toISOString(), granularity: period.granularity },
			kpis: {
				opened: { value: opened, deltaPct: delta(opened, previousOpened) },
				closed: { value: closed, deltaPct: delta(closed, previousClosed) },
				inProgress: { value: openNowRows[0].count },
				slaCompliancePct: { value: sla.slaCompliancePct, deltaPct: delta(sla.slaCompliancePct, previousSla.slaCompliancePct) },
				avgResolutionMinutes: { value: sla.avgResolutionMinutes, deltaPct: delta(sla.avgResolutionMinutes, previousSla.avgResolutionMinutes) },
				avgFirstResponseMinutes: { value: firstResponse },
				overdueActions: { value: overdueRows[0].count },
			},
		});
	} catch (error) {
		next(error);
	}
});

// Evolucao temporal (secoes 11-13, 21): aberturas, conclusoes e o
// "backlog" (protocolos ainda nao concluidos ao final de cada bucket) +
// percentual de SLA cumprido por bucket, no mesmo agrupamento.
router.get("/reports/timeline", requireRotPermission("sst.relatorio.visualizar"), async (req, res, next) => {
	try {
		const period = parseReportPeriod(req.query);
		const { clause, params } = await reportProtocolFilter(req, req.query);
		const openedBucket = bucketExpr("p", "created_at", period.granularity);
		const closedBucket = bucketExpr("p", "closed_at", period.granularity);
		const values = [...params, period.from, period.to];
		const fromIdx = values.length - 1;
		const toIdx = values.length;

		const [openedRows, closedRows, slaRows] = await Promise.all([
			db.query(`select ${openedBucket} as bucket, count(*)::int as count from sst_protocols p where ${clause} and p.created_at >= $${fromIdx} and p.created_at <= $${toIdx} group by 1 order by 1`, values),
			db.query(`select ${closedBucket} as bucket, count(*)::int as count from sst_protocols p where ${clause} and p.closed_at is not null and p.closed_at >= $${fromIdx} and p.closed_at <= $${toIdx} group by 1 order by 1`, values),
			db.query(
				`select ${closedBucket} as bucket, p.priority, extract(epoch from (p.closed_at - p.created_at)) / 60 as minutes
				 from sst_protocols p where ${clause} and p.closed_at is not null and p.closed_at >= $${fromIdx} and p.closed_at <= $${toIdx}`,
				values,
			),
		]);

		const stepInterval = { day: "1 day", week: "1 week", month: "1 month" }[period.granularity];
		const { rows: backlogRows } = await db.query(
			`with buckets as (
				select generate_series(date_trunc('${period.granularity}', $${fromIdx}::timestamptz), date_trunc('${period.granularity}', $${toIdx}::timestamptz), interval '${stepInterval}') as bucket_start
			 )
			 select b.bucket_start as bucket,
				(select count(*)::int from sst_protocols p where ${clause}
					and p.created_at <= (b.bucket_start + interval '${stepInterval}' - interval '1 second')
					and (p.closed_at is null or p.closed_at > (b.bucket_start + interval '${stepInterval}' - interval '1 second'))
				) as count
			 from buckets b order by b.bucket_start`,
			values,
		);

		const slaByBucket = new Map();
		for (const row of slaRows.rows) {
			const key = row.bucket.toISOString();
			const entry = slaByBucket.get(key) || { total: 0, compliant: 0 };
			entry.total += 1;
			if (Number(row.minutes) <= (SLA_THRESHOLD_MINUTES[row.priority] || SLA_THRESHOLD_MINUTES.media)) entry.compliant += 1;
			slaByBucket.set(key, entry);
		}
		const slaTimeline = Array.from(slaByBucket.entries())
			.map(([bucket, entry]) => ({ bucket, compliancePct: Math.round((entry.compliant / entry.total) * 1000) / 10 }))
			.sort((a, b) => a.bucket.localeCompare(b.bucket));

		res.json({
			ok: true,
			granularity: period.granularity,
			opened: openedRows.rows,
			closed: closedRows.rows,
			backlog: backlogRows,
			sla: slaTimeline,
		});
	} catch (error) {
		next(error);
	}
});

// Distribuicao por tipo/status/prioridade/operacao/regional/base/empresa
// (secoes 14, 24-29) — protocolos ABERTOS no periodo selecionado.
router.get("/reports/distribution", requireRotPermission("sst.relatorio.visualizar"), async (req, res, next) => {
	try {
		const period = parseReportPeriod(req.query);
		const { clause, params } = await reportProtocolFilter(req, req.query);
		const values = [...params, period.from, period.to];
		const periodClause = `p.created_at >= $${values.length - 1} and p.created_at <= $${values.length}`;

		async function groupBy(column) {
			const { rows } = await db.query(
				`select p.${column} as key, count(*)::int as count from sst_protocols p where ${clause} and ${periodClause} group by 1 order by count desc`,
				values,
			);
			return rows;
		}

		const [byType, byStatus, byPriority, byOperation, byRegional, byBase, byCompany] = await Promise.all([
			groupBy("type"),
			groupBy("status"),
			groupBy("priority"),
			groupBy("operation_scope"),
			db.query(`select p.regional_id as key, r.nome as label, count(*)::int as count from sst_protocols p left join regionais r on r.id = p.regional_id where ${clause} and ${periodClause} group by 1,2 order by count desc`, values).then((r) => r.rows),
			db.query(`select p.base_id as key, bc.nome as label, count(*)::int as count from sst_protocols p left join regional_cidades bc on bc.id = p.base_id where ${clause} and ${periodClause} group by 1,2 order by count desc`, values).then((r) => r.rows),
			db.query(`select p.company_id as key, c.nome as label, count(*)::int as count from sst_protocols p left join operacao_empresas c on c.id = p.company_id where ${clause} and ${periodClause} group by 1,2 order by count desc`, values).then((r) => r.rows),
		]);

		res.json({ ok: true, byType, byStatus, byPriority, byOperation, byRegional, byBase, byCompany });
	} catch (error) {
		next(error);
	}
});

// Blocos por tipo de ocorrencia (secoes 15-19): quase acidentes,
// acidentes/incidentes, desvios e "inspecoes" (unico tipo estruturado
// hoje pra nao-conformidade — o dominio nao tem tabela separada de
// inspecao/checklist, entao o indicador reflete protocolos do tipo
// inspecao_nao_conforme, sem inventar uma taxa de "conformes" que o
// esquema atual nao registra).
router.get("/reports/occurrences", requireRotPermission("sst.relatorio.visualizar"), async (req, res, next) => {
	try {
		const period = parseReportPeriod(req.query);
		const { clause, params } = await reportProtocolFilter(req, req.query);
		const values = [...params, period.from, period.to];
		const periodClause = `p.created_at >= $${values.length - 1} and p.created_at <= $${values.length}`;

		const [nearMissTotal, nearMissByConsequence, accByType, deviationRows, inspectionTotal, inspectionByStatus] = await Promise.all([
			db.query(`select count(*)::int as total from sst_protocols p where ${clause} and ${periodClause} and p.type = 'quase_acidente'`, values).then((r) => r.rows[0].total),
			db.query(`select coalesce(p.details->>'potentialConsequence','nao_informado') as key, count(*)::int as count from sst_protocols p where ${clause} and ${periodClause} and p.type = 'quase_acidente' group by 1 order by count desc`, values).then((r) => r.rows),
			db.query(`select p.type as key, count(*)::int as count from sst_protocols p where ${clause} and ${periodClause} and p.type in ('acidente','incidente') group by 1`, values).then((r) => r.rows),
			db.query(
				`select count(*)::int as total, count(*) filter (where exists (select 1 from sst_action_plans ap where ap.protocol_id = p.id))::int as with_action_plan
				 from sst_protocols p where ${clause} and ${periodClause} and p.type = 'desvio'`,
				values,
			).then((r) => r.rows[0]),
			db.query(`select count(*)::int as total from sst_protocols p where ${clause} and ${periodClause} and p.type = 'inspecao_nao_conforme'`, values).then((r) => r.rows[0].total),
			db.query(`select p.status as key, count(*)::int as count from sst_protocols p where ${clause} and ${periodClause} and p.type = 'inspecao_nao_conforme' group by 1`, values).then((r) => r.rows),
		]);

		res.json({
			ok: true,
			nearMiss: { total: nearMissTotal, byConsequence: nearMissByConsequence },
			accidentsIncidents: { byType: accByType },
			deviations: { total: deviationRows.total, withActionPlan: deviationRows.with_action_plan },
			inspections: { total: inspectionTotal, byStatus: inspectionByStatus },
		});
	} catch (error) {
		next(error);
	}
});

// Planos de acao (secao 20): criados/concluidos no periodo, status
// atual, vencidos (snapshot de agora) e evolucao mensal criados x
// concluidos — mesma tabela sst_action_plans usada no restante do modulo.
router.get("/reports/action-plans", requireRotPermission("sst.relatorio.visualizar"), async (req, res, next) => {
	try {
		const period = parseReportPeriod(req.query);
		const { clause, params } = await reportActionPlanFilter(req, req.query);
		const values = [...params, period.from, period.to];
		const fromIdx = values.length - 1;
		const toIdx = values.length;
		const createdClause = `ap.created_at >= $${fromIdx} and ap.created_at <= $${toIdx}`;
		const completedClause = `ap.completed_at is not null and ap.completed_at >= $${fromIdx} and ap.completed_at <= $${toIdx}`;

		const [createdRows, completedRows, statusRows, overdueRows, createdMonthly, completedMonthly] = await Promise.all([
			db.query(`select count(*)::int as count from sst_action_plans ap where ${clause} and ${createdClause}`, values).then((r) => r.rows[0].count),
			db.query(
				`select count(*)::int as count, count(*) filter (where ap.due_date is not null and ap.completed_at::date <= ap.due_date)::int as on_time
				 from sst_action_plans ap where ${clause} and ${completedClause}`,
				values,
			).then((r) => r.rows[0]),
			db.query(`select ap.status as key, count(*)::int as count from sst_action_plans ap where ${clause} group by 1`, params).then((r) => r.rows),
			db.query(`select count(*)::int as count from sst_action_plans ap where ${clause} and ap.status not in ('CONCLUIDO','CANCELADO') and ap.due_date is not null and ap.due_date < current_date`, params).then((r) => r.rows[0].count),
			db.query(`select ${bucketExpr("ap", "created_at", period.granularity)} as bucket, count(*)::int as count from sst_action_plans ap where ${clause} and ${createdClause} group by 1 order by 1`, values).then((r) => r.rows),
			db.query(`select ${bucketExpr("ap", "completed_at", period.granularity)} as bucket, count(*)::int as count from sst_action_plans ap where ${clause} and ${completedClause} group by 1 order by 1`, values).then((r) => r.rows),
		]);

		res.json({
			ok: true,
			created: createdRows,
			completed: completedRows.count,
			onTimeCompletionPct: completedRows.count ? Math.round((completedRows.on_time / completedRows.count) * 1000) / 10 : null,
			overdue: overdueRows,
			byStatus: statusRows,
			timeline: { created: createdMonthly, completed: completedMonthly },
		});
	} catch (error) {
		next(error);
	}
});

// Carga de trabalho por responsavel SST (secao 30) — distribuicao
// operacional, NAO um ranking/score individual de desempenho.
router.get("/reports/workload", requireRotPermission("sst.relatorio.visualizar"), async (req, res, next) => {
	try {
		const { clause, params } = await reportProtocolFilter(req, req.query);
		const { rows } = await db.query(
			`select p.assigned_to as user_id, u.name,
				count(*) filter (where p.status not in ('CONCLUIDO','CANCELADO','DUPLICADO'))::int as open_count,
				count(*) filter (where p.status = 'EM_ANALISE')::int as in_analysis,
				count(*) filter (where p.status = 'AGUARDANDO_INFORMACAO')::int as awaiting_info,
				count(*) filter (where p.status = 'CONCLUIDO')::int as completed
			 from sst_protocols p left join rot_users u on u.id = p.assigned_to
			 where ${clause} and p.assigned_to is not null
			 group by 1, 2 order by open_count desc`,
			params,
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

// Tabela detalhada paginada (secoes 35-38) — mesma visibilidade/filtros
// do resumo, com busca e ordenacao.
router.get("/reports/details", requireRotPermission("sst.relatorio.visualizar"), async (req, res, next) => {
	try {
		const period = parseReportPeriod(req.query);
		const { clause, params } = await reportProtocolFilter(req, req.query);
		const values = [...params, period.from, period.to];
		const conditions = [clause, `p.created_at >= $${values.length - 1} and p.created_at <= $${values.length}`];
		if (req.query.q) {
			values.push(`%${req.query.q}%`);
			conditions.push(`(p.protocol_number ilike $${values.length} or p.subject ilike $${values.length} or emp.name ilike $${values.length} or c.nome ilike $${values.length} or bc.nome ilike $${values.length})`);
		}
		const sortMap = { createdAt: "p.created_at", protocolNumber: "p.protocol_number", priority: "p.priority", status: "p.status", closedAt: "p.closed_at" };
		const sortCol = sortMap[req.query.sort] || "p.created_at";
		const sortDir = req.query.dir === "asc" ? "asc" : "desc";
		const page = Math.max(1, Number(req.query.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
		const whereClause = conditions.join(" and ");

		const JOINS = `
			from sst_protocols p
			left join regionais r on r.id = p.regional_id
			left join regional_cidades bc on bc.id = p.base_id
			left join operacao_empresas c on c.id = p.company_id
			left join rot_users emp on emp.id = p.employee_id
			left join rot_users reqr on reqr.id = p.requested_by
			left join rot_users asg on asg.id = p.assigned_to
		`;

		const { rows: countRows } = await db.query(`select count(*)::int as count ${JOINS} where ${whereClause}`, values);
		const dataValues = [...values, pageSize, (page - 1) * pageSize];
		const { rows } = await db.query(
			`select p.*, r.nome as regional_name, bc.nome as base_name, c.nome as company_name, emp.name as employee_name, asg.name as assigned_to_name,
				(select min(t.created_at) from sst_protocol_timeline t where t.protocol_id = p.id and t.event_type <> 'created') as first_response_at
			 ${JOINS} where ${whereClause}
			 order by ${sortCol} ${sortDir} nulls last
			 limit $${dataValues.length - 1} offset $${dataValues.length}`,
			dataValues,
		);

		const items = rows.map((row) => {
			const createdAt = new Date(row.created_at);
			const closedAt = row.closed_at ? new Date(row.closed_at) : null;
			const firstResponseAt = row.first_response_at ? new Date(row.first_response_at) : null;
			const resolutionMinutes = closedAt ? Math.round((closedAt - createdAt) / 60000) : null;
			const firstResponseMinutes = firstResponseAt ? Math.round((firstResponseAt - createdAt) / 60000) : null;
			const slaThreshold = SLA_THRESHOLD_MINUTES[row.priority] || SLA_THRESHOLD_MINUTES.media;
			return {
				id: row.id,
				protocolNumber: row.protocol_number,
				type: row.type,
				subject: row.subject,
				status: row.status,
				priority: row.priority,
				regionalName: row.regional_name,
				baseName: row.base_name,
				companyName: row.company_name,
				employeeName: row.employee_name,
				assignedToName: row.assigned_to_name,
				createdAt: row.created_at,
				closedAt: row.closed_at,
				firstResponseAt: row.first_response_at,
				resolutionMinutes,
				firstResponseMinutes,
				slaCompliant: resolutionMinutes === null ? null : resolutionMinutes <= slaThreshold,
			};
		});

		res.json({ ok: true, items, page, pageSize, total: countRows[0].count, totalPages: Math.max(1, Math.ceil(countRows[0].count / pageSize)) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
