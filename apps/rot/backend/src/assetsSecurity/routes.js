const express = require("express");
const crypto = require("node:crypto");
const db = require("../db");
const { auditLog } = require("../audit/auditLog");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { randomId } = require("../secureRandom");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth, noStore);

const CONFIG_TABLES = {
	categories: {
		table: "rot_asset_categories",
		permission: "checklists.configurar",
		publicName: "category",
		fields: ["name", "description", "active"],
	},
	types: {
		table: "rot_asset_types",
		permission: "checklists.configurar",
		publicName: "type",
		fields: ["category_id", "name", "description", "requires_checklist", "default_inspection_frequency", "active"],
	},
	statuses: {
		table: "rot_asset_statuses",
		permission: "checklists.configurar",
		publicName: "status",
		fields: ["name", "color", "blocks_use", "blocks_transfer", "sort_order", "active"],
	},
	criticalities: {
		table: "rot_asset_criticalities",
		permission: "checklists.configurar",
		publicName: "criticality",
		fields: ["name", "color", "weight", "actions", "active"],
	},
	codePatterns: {
		table: "rot_asset_code_patterns",
		permission: "checklists.configurar",
		publicName: "codePattern",
		fields: ["name", "prefix", "padding", "next_number", "operation_scope", "category_id", "type_id", "company_id", "active"],
	},
};

function fail(status, message) {
	const error = new Error(message);
	error.status = status;
	throw error;
}

function normalizeOperationScope(value) {
	const scope = String(value || "ROT").trim().toUpperCase();
	return ["ROT", "FIELD", "DELIVERY"].includes(scope) ? scope : "ROT";
}

function nullableText(value, max = 500) {
	const text = String(value ?? "").trim();
	return text ? text.slice(0, max) : null;
}

function randomPublicToken() {
	return crypto.randomBytes(32).toString("base64url");
}

function publicConfig(row) {
	return {
		...row,
		requiresChecklist: row.requires_checklist,
		defaultInspectionFrequency: row.default_inspection_frequency,
		blocksUse: row.blocks_use,
		blocksTransfer: row.blocks_transfer,
		sortOrder: row.sort_order,
		nextNumber: row.next_number,
		operationScope: row.operation_scope,
		categoryId: row.category_id,
		typeId: row.type_id,
		companyId: row.company_id,
		regionalId: row.regional_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function publicAsset(row, req) {
	const canSeeValue = userHasRotPermission(req.rotUser, "ativos.valor.visualizar");
	return {
		id: row.id,
		code: row.code,
		publicToken: row.public_token,
		qrUrl: `/ativo/${row.public_token}`,
		name: row.name,
		categoryId: row.category_id,
		categoryName: row.category_name,
		typeId: row.type_id,
		typeName: row.type_name,
		description: row.description,
		manufacturer: row.manufacturer,
		model: row.model,
		serialNumber: row.serial_number,
		patrimony: row.patrimony,
		assetValue: canSeeValue ? Number(row.asset_value || 0) : null,
		acquiredAt: row.acquired_at,
		companyId: row.company_id,
		companyName: row.company_name,
		operationScope: row.operation_scope,
		regionalId: row.regional_id,
		regionalName: row.regional_name,
		baseId: row.base_id,
		baseCode: row.base_code,
		baseName: row.base_name,
		statusId: row.status_id,
		statusName: row.status_name,
		statusColor: row.status_color,
		statusBlocksUse: Boolean(row.status_blocks_use),
		statusBlocksTransfer: Boolean(row.status_blocks_transfer),
		criticalityId: row.criticality_id,
		criticalityName: row.criticality_name,
		criticalityColor: row.criticality_color,
		criticalityWeight: Number(row.criticality_weight || 0),
		highValue: Boolean(row.high_value),
		criticalEquipment: Boolean(row.critical_equipment),
		requiresChecklist: Boolean(row.requires_checklist),
		checklistTemplateId: row.checklist_template_id,
		inspectionFrequency: row.inspection_frequency,
		structuralResponsibleType: row.structural_responsible_type,
		structuralResponsibleId: row.structural_responsible_id,
		custodyUserId: row.custody_user_id,
		custodyUserName: row.custody_user_name,
		custodyTechnicianId: row.custody_technician_id,
		custodyTechnicianName: row.custody_technician_name,
		lastMovementAt: row.last_movement_at,
		lastInspectionAt: row.last_inspection_at,
		nextInspectionAt: row.next_inspection_at,
		notes: row.notes,
		active: row.active !== false,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const ASSET_SELECT = `
	select
		a.*,
		c.name as category_name,
		t.name as type_name,
		co.nome as company_name,
		r.nome as regional_name,
		b.code as base_code,
		b.nome as base_name,
		s.name as status_name,
		s.color as status_color,
		s.blocks_use as status_blocks_use,
		s.blocks_transfer as status_blocks_transfer,
		cr.name as criticality_name,
		cr.color as criticality_color,
		cr.weight as criticality_weight,
		u.name as custody_user_name,
		tech.nome as custody_technician_name
	from rot_assets a
	left join rot_asset_categories c on c.id = a.category_id
	left join rot_asset_types t on t.id = a.type_id
	left join operacao_empresas co on co.id = a.company_id
	left join regionais r on r.id = a.regional_id
	left join regional_cidades b on b.id = a.base_id
	left join rot_asset_statuses s on s.id = a.status_id
	left join rot_asset_criticalities cr on cr.id = a.criticality_id
	left join rot_users u on u.id = a.custody_user_id
	left join operacao_tecnicos tech on tech.id = a.custody_technician_id
`;

function applyRegionalScope(req, conditions, params, alias = "a") {
	const scope = scopeRegionalFilter(req);
	if (scope) {
		params.push(scope);
		conditions.push(`${alias}.regional_id = $${params.length}`);
	}
}

// Espelha applyRegionalScope, mas para o eixo de operacao (ROT/FIELD/DELIVERY).
// Cargo global enxerga todas as operacoes; cargo nao-global so enxerga as
// operacoes atribuidas a ele em rot_user_operation_scopes (req.rotUser.operation_scopes).
// Sem isso, um usuario ROT conseguia listar ativos FIELD/DELIVERY da propria
// regional so passando ?operationScope=FIELD na querystring.
function applyOperationScope(req, conditions, params, alias = "a") {
	const user = req.rotUser;
	if (user?.is_global) return;
	const scopes = Array.isArray(user?.operation_scopes) && user.operation_scopes.length ? user.operation_scopes : ["ROT"];
	params.push(scopes);
	conditions.push(`${alias}.operation_scope = any($${params.length}::text[])`);
}

const INSPECTION_FREQUENCY_DAYS = { diario: 1, semanal: 7, quinzenal: 15, mensal: 30 };
function inspectionFrequencyDays(frequency) {
	return INSPECTION_FREQUENCY_DAYS[frequency] || null;
}

function assetPayload(body = {}) {
	return {
		name: nullableText(body.name, 180),
		categoryId: nullableText(body.categoryId),
		typeId: nullableText(body.typeId),
		description: nullableText(body.description, 1000),
		manufacturer: nullableText(body.manufacturer, 180),
		model: nullableText(body.model, 180),
		serialNumber: nullableText(body.serialNumber, 180),
		patrimony: nullableText(body.patrimony, 180),
		assetValue: body.assetValue === "" || body.assetValue === null || body.assetValue === undefined ? null : Number(body.assetValue),
		acquiredAt: nullableText(body.acquiredAt),
		companyId: nullableText(body.companyId),
		operationScope: normalizeOperationScope(body.operationScope),
		regionalId: nullableText(body.regionalId),
		baseId: nullableText(body.baseId),
		statusId: nullableText(body.statusId) || "disponivel",
		criticalityId: nullableText(body.criticalityId) || "informativo",
		highValue: Boolean(body.highValue),
		criticalEquipment: Boolean(body.criticalEquipment),
		requiresChecklist: Boolean(body.requiresChecklist),
		checklistTemplateId: nullableText(body.checklistTemplateId),
		inspectionFrequency: nullableText(body.inspectionFrequency),
		structuralResponsibleType: nullableText(body.structuralResponsibleType) || "REGIONAL",
		structuralResponsibleId: nullableText(body.structuralResponsibleId),
		custodyUserId: nullableText(body.custodyUserId),
		custodyTechnicianId: nullableText(body.custodyTechnicianId),
		nextInspectionAt: nullableText(body.nextInspectionAt),
		notes: nullableText(body.notes, 2000),
		active: body.active !== false,
	};
}

function insertBaseCodeInPrefix(prefix, baseCode) {
	const parts = String(prefix || "").split("-").filter(Boolean);
	if (parts.length > 1) return [parts[0], baseCode, ...parts.slice(1)].join("-");
	return `${prefix}-${baseCode}`;
}

async function generateAssetCode(client, payload) {
	const { rows } = await client.query(
		`select *
		   from rot_asset_code_patterns
		  where active = true
		    and (operation_scope is null or operation_scope = $1)
		    and (category_id is null or category_id = $2)
		    and (type_id is null or type_id = $3)
		    and (company_id is null or company_id = $4)
		  order by
		    case when company_id is not null then 0 else 1 end,
		    case when type_id is not null then 0 else 1 end,
		    case when category_id is not null then 0 else 1 end,
		    case when operation_scope is not null then 0 else 1 end
		  limit 1
		  for update`,
		[payload.operationScope, payload.categoryId, payload.typeId, payload.companyId],
	);
	const pattern = rows[0];
	if (!pattern) fail(500, "Nenhum padrão de código de ativo configurado.");
	let baseCode = null;
	if (payload.baseId) {
		const { rows: baseRows } = await client.query(`select code from regional_cidades where id = $1 and code is not null`, [payload.baseId]);
		if (!baseRows[0]) fail(400, "Base de origem inválida.");
		baseCode = baseRows[0].code;
	}
	const next = Number(pattern.next_number || 1);
	const sequence = String(next).padStart(Number(pattern.padding || 6), "0");
	const prefixWithBase = baseCode ? insertBaseCodeInPrefix(pattern.prefix, baseCode) : pattern.prefix;
	const code = `${prefixWithBase}-${sequence}`;
	await client.query(`update rot_asset_code_patterns set next_number = next_number + 1 where id = $1`, [pattern.id]);
	return code;
}

function assertAssetAccess(req, asset) {
	const scope = scopeRegionalFilter(req);
	if (scope && asset.regional_id !== scope) fail(403, "Regional não autorizada.");
	if (!req.rotUser?.is_global) {
		const scopes = Array.isArray(req.rotUser?.operation_scopes) && req.rotUser.operation_scopes.length ? req.rotUser.operation_scopes : ["ROT"];
		if (!scopes.includes(asset.operation_scope)) fail(403, "Operação não autorizada.");
	}
}

async function loadAssetForUpdate(client, req, assetId) {
	const { rows } = await client.query(
		`${ASSET_SELECT} where a.id = $1 and a.deleted_at is null for update of a`,
		[assetId],
	);
	const asset = rows[0];
	if (!asset) fail(404, "Ativo não encontrado.");
	assertAssetAccess(req, asset);
	return asset;
}

async function hydrateAsset(assetId, req) {
	const { rows } = await db.query(`${ASSET_SELECT} where a.id = $1`, [assetId]);
	return rows[0] ? publicAsset(rows[0], req) : null;
}

async function assetTimeline(client, req, assetId, eventType, title, description, before, after) {
	await client.query(
		`insert into rot_asset_timeline (asset_id, event_type, title, description, before_data, after_data, created_by)
		 values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
		[
			assetId,
			eventType,
			title,
			description || null,
			before ? JSON.stringify(before) : null,
			after ? JSON.stringify(after) : null,
			req.rotUser.id,
		],
	);
}

function validateChecklistAnswers(questions, answers) {
	const byQuestion = new Map((Array.isArray(answers) ? answers : []).map((answer) => [String(answer.questionId || ""), answer]));
	for (const question of questions) {
		if (!question.required) continue;
		const answer = byQuestion.get(question.id);
		const value = answer?.value ?? answer?.label ?? "";
		if (value === "" || value === null || value === undefined) {
			fail(400, `Responda o item obrigatório: ${question.label}`);
		}
	}
	return questions.map((question) => {
		const answer = byQuestion.get(question.id) || {};
		const label = String(answer.label || answer.value || "").trim();
		const answerStatus = String(answer.status || "").trim();
		const status = answerStatus || (label === "N-OK" ? "N-OK" : label === "OK" ? "OK" : label || null);
		return {
			id: randomId("answer"),
			questionId: question.id,
			value: answer.value ?? label,
			label,
			status,
		};
	});
}

async function executeChecklist(client, req, { assetId, templateId, answers }) {
	const { rows: templates } = await client.query(
		`select t.*, v.id as version_id
		 from rot_checklist_templates t
		 join rot_checklist_template_versions v on v.id = t.active_version_id
		 where t.id = coalesce($1, t.id) and t.active = true
		 order by t.created_at
		 limit 1`,
		[templateId || null],
	);
	const template = templates[0];
	if (!template) fail(400, "Modelo de checklist não encontrado.");
	const { rows: questions } = await client.query(
		`select * from rot_checklist_questions where version_id=$1 order by sort_order,id`,
		[template.version_id],
	);
	const normalizedAnswers = validateChecklistAnswers(questions, answers);
	const hasNok = normalizedAnswers.some((answer) => answer.status === "N-OK");
	const executionId = randomId("chk");
	await client.query(
		`insert into rot_checklist_executions (id, template_id, version_id, asset_id, executed_by, status, result, completed_at)
		 values ($1,$2,$3,$4,$5,'COMPLETED',$6,now())`,
		[executionId, template.id, template.version_id, assetId || null, req.rotUser.id, hasNok ? "N-OK" : "OK"],
	);
	for (const answer of normalizedAnswers) {
		await client.query(
			`insert into rot_checklist_answers (id, execution_id, question_id, value, label, status)
			 values ($1,$2,$3,$4::jsonb,$5,$6)`,
			[answer.id, executionId, answer.questionId, JSON.stringify(answer.value), answer.label, answer.status],
		);
	}
	return { id: executionId, templateId: template.id, result: hasNok ? "N-OK" : "OK", hasNok };
}

async function createOccurrence(client, req, { assetId, type, description, criticalityId, evidence, status = "ABERTA" }) {
	const id = randomId("occ");
	const { rows } = await client.query(
		`insert into rot_asset_occurrences (id, asset_id, type, description, criticality_id, status, evidence, opened_by)
		 values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
		 returning *`,
		[id, assetId, type || "Problema reportado", description, criticalityId || "atencao", status, JSON.stringify(evidence || []), req.rotUser.id],
	);
	return rows[0];
}

async function blockAsset(client, req, { asset, reason, origin = "manual", occurrenceId = null, evidence = [] }) {
	const id = randomId("blk");
	await client.query(
		`insert into rot_asset_blocks (id, asset_id, occurrence_id, reason, origin, evidence, blocked_by)
		 values ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
		[id, asset.id, occurrenceId, reason, origin, JSON.stringify(evidence || []), req.rotUser.id],
	);
	const { rows } = await client.query(
		`update rot_assets set status_id='bloqueado', last_movement_at=now() where id=$1 returning *`,
		[asset.id],
	);
	await assetTimeline(client, req, asset.id, "blocked", "Ativo bloqueado", reason, asset, rows[0]);
	return rows[0];
}

async function nextMaintenanceCode(client) {
	const { rows } = await client.query(
		`select coalesce(max((regexp_match(code, 'OM-[0-9]{4}-([0-9]+)'))[1]::bigint), 0) + 1 as next
		 from rot_maintenance_orders
		 where code like $1`,
		[`OM-${new Date().getFullYear()}-%`],
	);
	return `OM-${new Date().getFullYear()}-${String(rows[0]?.next || 1).padStart(6, "0")}`;
}

router.get("/meta", requireRotPermission(["ativos.visualizar", "ativos.criar", "ativos.editar"]), async (_req, res, next) => {
	try {
		const [categories, types, statuses, criticalities, codePatterns, bases, regionals, companies, technicians, users] = await Promise.all([
			db.query(`select * from rot_asset_categories order by active desc, name`),
			db.query(`select * from rot_asset_types order by active desc, name`),
			db.query(`select * from rot_asset_statuses order by sort_order, name`),
			db.query(`select * from rot_asset_criticalities order by weight, name`),
			db.query(`select * from rot_asset_code_patterns order by active desc, name`),
			db.query(`select id, nome as name, code, regional_id from regional_cidades where code is not null order by nome`),
			db.query(`select id, nome as name from regionais where ativo = true order by nome`),
			db.query(`select id, nome as name from operacao_empresas where status = 'Ativa' order by nome`),
			db.query(`select id, nome as name, regional_id from operacao_tecnicos where status = 'Ativo' order by nome`),
			db.query(`select id, name, username, regional_id from rot_users where status = 'ativo' order by name`),
		]);
		res.json({
			ok: true,
			categories: categories.rows.map(publicConfig),
			types: types.rows.map(publicConfig),
			statuses: statuses.rows.map(publicConfig),
			criticalities: criticalities.rows.map(publicConfig),
			codePatterns: codePatterns.rows.map(publicConfig),
			bases: bases.rows.map((item) => ({ id: item.id, name: `${item.name} (${item.code})`, code: item.code, regionalId: item.regional_id })),
			regionals: regionals.rows,
			companies: companies.rows,
			technicians: technicians.rows.map((item) => ({ id: item.id, name: item.name, regionalId: item.regional_id })),
			users: users.rows.map((item) => ({ id: item.id, name: item.name, context: `@${item.username}`, regionalId: item.regional_id })),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/dashboard", requireRotPermission("ativos.dashboard.visualizar"), async (req, res, next) => {
	try {
		const params = [];
		const conditions = ["a.deleted_at is null"];
		applyRegionalScope(req, conditions, params, "a");
		applyOperationScope(req, conditions, params, "a");
		const where = `where ${conditions.join(" and ")}`;
		const { rows } = await db.query(
			`select
				count(*)::int as total,
				count(*) filter (where a.active and coalesce(s.blocks_use,false) = false)::int as available,
				count(*) filter (where a.custody_user_id is not null or a.custody_technician_id is not null)::int as in_use,
				count(*) filter (where coalesce(s.blocks_use,false) = true)::int as blocked,
				count(*) filter (where a.status_id = 'com_ocorrencia')::int as with_problem,
				count(*) filter (where a.status_id = 'manutencao')::int as in_maintenance,
				count(*) filter (where a.high_value)::int as high_value,
				count(*) filter (where a.critical_equipment)::int as critical_equipment,
				count(*) filter (where a.next_inspection_at is not null and a.next_inspection_at < now())::int as overdue_inspections,
				coalesce(sum(a.asset_value), 0)::numeric as total_value
			 from rot_assets a
			 left join rot_asset_statuses s on s.id = a.status_id
			 ${where}`,
			params,
		);
		const { rows: byRegional } = await db.query(
			`select coalesce(r.nome, 'Sem regional') as name, count(*)::int as total, coalesce(sum(a.asset_value), 0)::numeric as total_value
			 from rot_assets a
			 left join regionais r on r.id = a.regional_id
			 ${where}
			 group by coalesce(r.nome, 'Sem regional')
			 order by total desc, name
			 limit 10`,
			params,
		);
		const { rows: byBase } = await db.query(
			`select coalesce(b.nome, 'Sem base') as name, count(*)::int as total, coalesce(sum(a.asset_value), 0)::numeric as total_value
			 from rot_assets a
			 left join regional_cidades b on b.id = a.base_id
			 ${where}
			 group by coalesce(b.nome, 'Sem base')
			 order by total desc, name
			 limit 10`,
			params,
		);
		const regionalScope = scopeRegionalFilter(req);
		const [checklists, transfers, returnsData, occurrences, maintenance] = await Promise.all([
			db.query(
				`select
					count(*) filter (where completed_at::date = current_date)::int as today,
					count(*) filter (where result = 'OK' and completed_at::date = current_date)::int as ok_today,
					count(*) filter (where result = 'N-OK' and completed_at::date = current_date)::int as nok_today
				 from rot_checklist_executions e
				 left join rot_assets a on a.id = e.asset_id
				 where ($1::text is null or a.regional_id = $1)`,
				[regionalScope],
			),
			db.query(`select count(*) filter (where created_at::date = current_date)::int as today, count(*) filter (where status='PENDING_ACCEPTANCE')::int as pending from rot_asset_transfers where ($1::text is null or regional_id=$1)`, [regionalScope]),
			db.query(`select count(*) filter (where rt.created_at::date = current_date)::int as today, count(*) filter (where rt.status='PENDING_VALIDATION')::int as pending from rot_asset_returns rt join rot_assets a on a.id=rt.asset_id where ($1::text is null or a.regional_id=$1)`, [regionalScope]),
			db.query(`select count(*) filter (where o.status in ('ABERTA','EM_TRATATIVA'))::int as open from rot_asset_occurrences o join rot_assets a on a.id=o.asset_id where ($1::text is null or a.regional_id=$1)`, [regionalScope]),
			db.query(`select count(*) filter (where m.status not in ('LIBERADO','CANCELADO'))::int as open from rot_maintenance_orders m join rot_assets a on a.id=m.asset_id where ($1::text is null or a.regional_id=$1)`, [regionalScope]),
		]);
		const checklistRow = checklists.rows[0] || {};
		const checklistToday = Number(checklistRow.today || 0);
		const checklistOkToday = Number(checklistRow.ok_today || 0);
		res.json({
			ok: true,
			summary: {
				total: Number(rows[0]?.total || 0),
				available: Number(rows[0]?.available || 0),
				inUse: Number(rows[0]?.in_use || 0),
				blocked: Number(rows[0]?.blocked || 0),
				withProblem: Number(rows[0]?.with_problem || 0),
				inMaintenance: Number(rows[0]?.in_maintenance || 0),
				highValue: Number(rows[0]?.high_value || 0),
				criticalEquipment: Number(rows[0]?.critical_equipment || 0),
				overdueInspections: Number(rows[0]?.overdue_inspections || 0),
				totalValue: userHasRotPermission(req.rotUser, "ativos.valor.visualizar") ? Number(rows[0]?.total_value || 0) : null,
				openOccurrences: Number(occurrences.rows[0]?.open || 0),
				openMaintenance: Number(maintenance.rows[0]?.open || 0),
				checklistsToday: checklistToday,
				nokToday: Number(checklistRow.nok_today || 0),
				conformityRateToday: checklistToday ? Number(((checklistOkToday / checklistToday) * 100).toFixed(2)) : 0,
				transfersToday: Number(transfers.rows[0]?.today || 0),
				pendingTransfers: Number(transfers.rows[0]?.pending || 0),
				returnsToday: Number(returnsData.rows[0]?.today || 0),
				pendingReturns: Number(returnsData.rows[0]?.pending || 0),
			},
			byRegional: byRegional.map((item) => ({ name: item.name, total: Number(item.total), totalValue: Number(item.total_value || 0) })),
			byBase: byBase.map((item) => ({ name: item.name, total: Number(item.total), totalValue: Number(item.total_value || 0) })),
		});
	} catch (error) {
		next(error);
	}
});

// Ativos sob custodia do PROPRIO usuario logado agora — sem exigir
// ativos.visualizar, porque ver o que voce mesmo esta segurando e
// informacao pessoal, nao de gestao. Alimenta o card "Meus ativos" no
// Dashboard.
router.get("/assets/mine", async (req, res, next) => {
	try {
		const { rows } = await db.query(`${ASSET_SELECT} where a.deleted_at is null and a.custody_user_id = $1 order by a.last_movement_at desc nulls last`, [req.rotUser.id]);
		res.json({ ok: true, items: rows.map((row) => publicAsset(row, req)) });
	} catch (error) {
		next(error);
	}
});

// Checklist obrigatorio do dia-a-dia: so os ativos que a propria pessoa
// tem em custodia, exigem checklist e estao com a inspecao vencida
// (proximo prazo nulo ou ja passado). O supervisor define a frequencia
// no cadastro do ativo — o tecnico so ve o que esta pendente pra ele.
router.get("/assets/checklists/pending-for-me", async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`${ASSET_SELECT} where a.deleted_at is null and a.custody_user_id = $1 and a.requires_checklist = true
			 and (a.next_inspection_at is null or a.next_inspection_at <= now())
			 order by a.next_inspection_at nulls first`,
			[req.rotUser.id],
		);
		res.json({ ok: true, items: rows.map((row) => publicAsset(row, req)) });
	} catch (error) {
		next(error);
	}
});

router.get("/assets", requireRotPermission("ativos.visualizar"), async (req, res, next) => {
	try {
		const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
		const offset = Math.max(0, Number(req.query.offset) || 0);
		const params = [];
		const conditions = ["a.deleted_at is null"];
		applyRegionalScope(req, conditions, params, "a");
		applyOperationScope(req, conditions, params, "a");
		for (const [key, column] of [
			["statusId", "a.status_id"],
			["categoryId", "a.category_id"],
			["typeId", "a.type_id"],
			["operationScope", "a.operation_scope"],
			["regionalId", "a.regional_id"],
			["baseId", "a.base_id"],
			["companyId", "a.company_id"],
		]) {
			if (req.query[key]) {
				params.push(String(req.query[key]));
				conditions.push(`${column} = $${params.length}`);
			}
		}
		if (req.query.q) {
			params.push(`%${String(req.query.q).trim()}%`);
			conditions.push(`(a.name ilike $${params.length} or a.code ilike $${params.length} or a.serial_number ilike $${params.length} or a.patrimony ilike $${params.length})`);
		}
		const where = `where ${conditions.join(" and ")}`;
		const { rows: totalRows } = await db.query(`select count(*)::int as total from rot_assets a ${where}`, params);
		params.push(limit, offset);
		const { rows } = await db.query(
			`${ASSET_SELECT}
			 ${where}
			 order by a.created_at desc
			 limit $${params.length - 1} offset $${params.length}`,
			params,
		);
		res.json({ ok: true, items: rows.map((row) => publicAsset(row, req)), total: totalRows[0]?.total || 0 });
	} catch (error) {
		next(error);
	}
});

router.post("/assets", requireRotPermission("ativos.criar"), async (req, res, next) => {
	let client;
	try {
		const payload = assetPayload(req.body || {});
		if (!payload.name) fail(400, "Informe o nome do ativo.");
		if (!payload.regionalId && !req.rotUser.is_global) payload.regionalId = req.rotUser.regional_id || null;
		if (!payload.regionalId) fail(400, "Informe a regional do ativo.");
		if (!payload.baseId) fail(400, "Informe a base de origem do ativo.");
		if (!req.rotUser.is_global) {
			const scopes = Array.isArray(req.rotUser.operation_scopes) && req.rotUser.operation_scopes.length ? req.rotUser.operation_scopes : ["ROT"];
			if (!scopes.includes(payload.operationScope)) fail(403, "Você não tem acesso a essa operação.");
		}
		if (payload.assetValue !== null && (!Number.isFinite(payload.assetValue) || payload.assetValue < 0)) fail(400, "Valor do ativo inválido.");

		client = await db.connect();
		await client.query("begin");
		const id = randomId("asset");
		const code = await generateAssetCode(client, payload);
		const publicToken = randomPublicToken();
		const { rows } = await client.query(
			`insert into rot_assets (
				id, code, public_token, name, category_id, type_id, description, manufacturer, model, serial_number, patrimony,
				asset_value, acquired_at, company_id, operation_scope, regional_id, base_id, status_id, criticality_id, high_value,
				critical_equipment, requires_checklist, inspection_frequency, structural_responsible_type, structural_responsible_id,
				custody_user_id, custody_technician_id, next_inspection_at, notes, active, created_by, last_movement_at, checklist_template_id
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
				$12,$13,$14,$15,$16,$17,$18,$19,$20,
				$21,$22,$23,$24,$25,
				$26,$27,$28,$29,$30,$31,now(),$32
			) returning *`,
			[
				id, code, publicToken, payload.name, payload.categoryId, payload.typeId, payload.description, payload.manufacturer, payload.model,
				payload.serialNumber, payload.patrimony, payload.assetValue, payload.acquiredAt, payload.companyId, payload.operationScope,
				payload.regionalId, payload.baseId, payload.statusId, payload.criticalityId, payload.highValue, payload.criticalEquipment, payload.requiresChecklist,
				payload.inspectionFrequency, payload.structuralResponsibleType, payload.structuralResponsibleId, payload.custodyUserId,
				payload.custodyTechnicianId, payload.nextInspectionAt, payload.notes, payload.active, req.rotUser.id, payload.checklistTemplateId,
			],
		);
		await client.query(
			`insert into rot_asset_timeline (asset_id, event_type, title, description, after_data, created_by)
			 values ($1,'created','Ativo cadastrado','Codigo unico e QR gerados automaticamente.',$2::jsonb,$3)`,
			[id, JSON.stringify(rows[0]), req.rotUser.id],
		);
		await client.query("commit");
		await auditLog(req, { action: "create", entity: "rot_assets", entityId: id, after: rows[0] });
		const { rows: hydrated } = await db.query(`${ASSET_SELECT} where a.id = $1`, [id]);
		res.status(201).json({ ok: true, asset: publicAsset(hydrated[0], req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/assets/:id/public-token", requireRotPermission("ativos.editar"), async (req, res, next) => {
	try {
		const { rows: beforeRows } = await db.query(`select * from rot_assets where id = $1 and deleted_at is null`, [req.params.id]);
		const before = beforeRows[0];
		if (!before) fail(404, "Ativo não encontrado.");
		assertAssetAccess(req, before);
		const token = randomPublicToken();
		const { rows } = await db.query(
			`update rot_assets set public_token = $2, updated_at = now() where id = $1 returning *`,
			[req.params.id, token],
		);
		await auditLog(req, {
			action: "rotate_public_token",
			entity: "rot_assets",
			entityId: req.params.id,
			before: { publicTokenRotated: true },
			after: { publicTokenRotated: true },
		});
		const { rows: hydrated } = await db.query(`${ASSET_SELECT} where a.id = $1`, [req.params.id]);
		res.json({ ok: true, asset: publicAsset(hydrated[0] || rows[0], req) });
	} catch (error) {
		next(error);
	}
});

router.put("/assets/:id", requireRotPermission("ativos.editar"), async (req, res, next) => {
	let client;
	try {
		const payload = assetPayload(req.body || {});
		const { rows: beforeRows } = await db.query(`select * from rot_assets where id = $1 and deleted_at is null`, [req.params.id]);
		const before = beforeRows[0];
		if (!before) fail(404, "Ativo não encontrado.");
		assertAssetAccess(req, before);

		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(
			`update rot_assets set
				name=$2, category_id=$3, type_id=$4, description=$5, manufacturer=$6, model=$7,
				serial_number=$8, patrimony=$9, asset_value=$10, acquired_at=$11, company_id=$12,
				operation_scope=$13, regional_id=$14, status_id=$15, criticality_id=$16, high_value=$17,
				critical_equipment=$18, requires_checklist=$19, inspection_frequency=$20,
				structural_responsible_type=$21, structural_responsible_id=$22, custody_user_id=$23,
				custody_technician_id=$24, next_inspection_at=$25, notes=$26, active=$27, base_id=$28, checklist_template_id=$29
			 where id=$1 returning *`,
			[
				req.params.id, payload.name || before.name, payload.categoryId, payload.typeId, payload.description, payload.manufacturer,
				payload.model, payload.serialNumber, payload.patrimony, payload.assetValue, payload.acquiredAt, payload.companyId,
				payload.operationScope, payload.regionalId || before.regional_id, payload.statusId, payload.criticalityId, payload.highValue,
				payload.criticalEquipment, payload.requiresChecklist, payload.inspectionFrequency, payload.structuralResponsibleType,
				payload.structuralResponsibleId, payload.custodyUserId, payload.custodyTechnicianId, payload.nextInspectionAt, payload.notes,
				payload.active, payload.baseId || before.base_id, payload.checklistTemplateId,
			],
		);
		await client.query(
			`insert into rot_asset_timeline (asset_id, event_type, title, description, before_data, after_data, created_by)
			 values ($1,'updated','Ativo atualizado','Dados cadastrais atualizados.',$2::jsonb,$3::jsonb,$4)`,
			[req.params.id, JSON.stringify(before), JSON.stringify(rows[0]), req.rotUser.id],
		);
		await client.query("commit");
		await auditLog(req, { action: "update", entity: "rot_assets", entityId: req.params.id, before, after: rows[0] });
		const { rows: hydrated } = await db.query(`${ASSET_SELECT} where a.id = $1`, [req.params.id]);
		res.json({ ok: true, asset: publicAsset(hydrated[0], req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.delete("/assets/:id", requireRotPermission("ativos.excluir"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`update rot_assets set deleted_at=now(), active=false where id=$1 and deleted_at is null returning *`, [req.params.id]);
		if (!rows[0]) fail(404, "Ativo não encontrado.");
		await db.query(
			`insert into rot_asset_timeline (asset_id, event_type, title, description, before_data, created_by)
			 values ($1,'deleted','Ativo inativado','Inativacao logica do ativo.',$2::jsonb,$3)`,
			[req.params.id, JSON.stringify(rows[0]), req.rotUser.id],
		);
		await auditLog(req, { action: "delete", entity: "rot_assets", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.get("/assets/:id/timeline", requireRotPermission("ativos.historico.visualizar"), async (req, res, next) => {
	try {
		const { rows: assetRows } = await db.query(`select regional_id, operation_scope from rot_assets where id=$1 and deleted_at is null`, [req.params.id]);
		if (!assetRows[0]) fail(404, "Ativo não encontrado.");
		assertAssetAccess(req, assetRows[0]);
		const { rows } = await db.query(
			`select t.*, u.name as created_by_name
			 from rot_asset_timeline t
			 left join rot_users u on u.id = t.created_by
			 where t.asset_id=$1
			 order by t.created_at desc, t.id desc
			 limit 200`,
			[req.params.id],
		);
		res.json({
			ok: true,
			items: rows.map((row) => ({
				id: row.id,
				eventType: row.event_type,
				title: row.title,
				description: row.description,
				beforeData: row.before_data,
				afterData: row.after_data,
				createdBy: row.created_by,
				createdByName: row.created_by_name,
				createdAt: row.created_at,
			})),
		});
	} catch (error) {
		next(error);
	}
});

// Autoatendimento: pegar um ativo disponivel pra si mesmo direto pela
// lista de Ativos, sem precisar escanear o QR fisico (mesma regra do
// checkout publico em publicRoutes.js: so ativo disponivel, sem
// custodia e sem bloqueio de uso).
router.post("/assets/:id/checkout", async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		if (asset.status_blocks_use || asset.status_id !== "disponivel" || asset.custody_user_id || asset.custody_technician_id) {
			fail(409, "Este ativo não está disponível para retirada.");
		}
		const { rows } = await client.query(
			`update rot_assets set custody_user_id=$2, custody_technician_id=null, status_id='em_uso', last_movement_at=now() where id=$1 returning *`,
			[asset.id, req.rotUser.id],
		);
		const after = rows[0];
		await assetTimeline(client, req, asset.id, "checkout", "Ativo retirado", `Retirado por ${req.rotUser.name || req.rotUser.username || "usuário"}.`, asset, after);
		await client.query("commit");
		await auditLog(req, { action: "checkout", entity: "rot_assets", entityId: asset.id, before: asset, after });
		res.json({ ok: true, asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.get("/checklists/templates", requireRotPermission("checklists.visualizar"), async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select t.*, v.version_number,
				coalesce((
					select jsonb_agg(jsonb_build_object(
						'id', q.id,
						'label', q.label,
						'type', q.question_type,
						'required', q.required,
						'options', q.options,
						'rules', q.rules
					) order by q.sort_order, q.id)
					from rot_checklist_questions q
					where q.version_id = v.id
				), '[]'::jsonb) as questions
			 from rot_checklist_templates t
			 left join rot_checklist_template_versions v on v.id = t.active_version_id
			 where t.active = true
			 order by t.name`,
		);
		res.json({
			ok: true,
			items: rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description,
				application: row.application,
				frequency: row.frequency,
				activeVersionId: row.active_version_id,
				versionNumber: row.version_number,
				questions: row.questions || [],
			})),
		});
	} catch (error) {
		next(error);
	}
});

router.post("/checklists/templates", requireRotPermission("checklists.configurar"), async (req, res, next) => {
	let client;
	try {
		const name = nullableText(req.body?.name, 180);
		if (!name) fail(400, "Informe o nome do checklist.");
		const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
		if (!questions.length) fail(400, "Informe ao menos uma pergunta.");
		client = await db.connect();
		await client.query("begin");
		const templateId = randomId("tpl");
		const versionId = randomId("tplv");
		await client.query(
			`insert into rot_checklist_templates (id, name, description, application, frequency, created_by)
			 values ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
			[
				templateId,
				name,
				nullableText(req.body?.description, 1000),
				JSON.stringify(req.body?.application || {}),
				JSON.stringify(req.body?.frequency || { type: "on_demand" }),
				req.rotUser.id,
			],
		);
		await client.query(
			`insert into rot_checklist_template_versions (id, template_id, version_number, snapshot, published_by)
			 values ($1,$2,1,$3::jsonb,$4)`,
			[versionId, templateId, JSON.stringify({ name, questions }), req.rotUser.id],
		);
		for (const [index, question] of questions.entries()) {
			await client.query(
				`insert into rot_checklist_questions (id, version_id, sort_order, label, question_type, required, options, rules)
				 values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
				[
					randomId("q"),
					versionId,
					(index + 1) * 10,
					nullableText(question.label, 500) || `Pergunta ${index + 1}`,
					nullableText(question.type, 60) || "single_choice",
					question.required !== false,
					JSON.stringify(question.options || ["OK", "N-OK", "Não se aplica"]),
					JSON.stringify(question.rules || []),
				],
			);
		}
		await client.query(`update rot_checklist_templates set active_version_id=$2 where id=$1`, [templateId, versionId]);
		await client.query("commit");
		await auditLog(req, { action: "create", entity: "rot_checklist_templates", entityId: templateId, after: { name, questions } });
		res.status(201).json({ ok: true, template: { id: templateId, name } });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Editar publica uma nova versao (mantendo as anteriores intactas —
// execucoes ja registradas continuam referenciando a versao que
// usaram). Excluir e soft-delete (active=false), assim ativos que
// ja apontavam pra esse checklist como padrao nao quebram — so some
// da lista de selecao de novos checklists/ativos.
router.put("/checklists/templates/:id", requireRotPermission("checklists.configurar"), async (req, res, next) => {
	let client;
	try {
		const name = nullableText(req.body?.name, 180);
		if (!name) fail(400, "Informe o nome do checklist.");
		const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
		if (!questions.length) fail(400, "Informe ao menos uma pergunta.");
		client = await db.connect();
		await client.query("begin");
		const { rows: existingRows } = await client.query(`select * from rot_checklist_templates where id=$1 and active=true`, [req.params.id]);
		const existing = existingRows[0];
		if (!existing) fail(404, "Checklist não encontrado.");
		const { rows: versionRows } = await client.query(`select coalesce(max(version_number),0) as max from rot_checklist_template_versions where template_id=$1`, [req.params.id]);
		const versionNumber = Number(versionRows[0].max) + 1;
		const versionId = randomId("tplv");
		await client.query(
			`update rot_checklist_templates set name=$2, description=$3, application=$4::jsonb, frequency=$5::jsonb, updated_at=now() where id=$1`,
			[
				req.params.id,
				name,
				nullableText(req.body?.description, 1000),
				JSON.stringify(req.body?.application || existing.application || {}),
				JSON.stringify(req.body?.frequency || existing.frequency || { type: "on_demand" }),
			],
		);
		await client.query(
			`insert into rot_checklist_template_versions (id, template_id, version_number, snapshot, published_by)
			 values ($1,$2,$3,$4::jsonb,$5)`,
			[versionId, req.params.id, versionNumber, JSON.stringify({ name, questions }), req.rotUser.id],
		);
		for (const [index, question] of questions.entries()) {
			await client.query(
				`insert into rot_checklist_questions (id, version_id, sort_order, label, question_type, required, options, rules)
				 values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
				[
					randomId("q"),
					versionId,
					(index + 1) * 10,
					nullableText(question.label, 500) || `Pergunta ${index + 1}`,
					nullableText(question.type, 60) || "single_choice",
					question.required !== false,
					JSON.stringify(question.options || ["OK", "N-OK", "Não se aplica"]),
					JSON.stringify(question.rules || []),
				],
			);
		}
		await client.query(`update rot_checklist_templates set active_version_id=$2 where id=$1`, [req.params.id, versionId]);
		await client.query("commit");
		await auditLog(req, { action: "update", entity: "rot_checklist_templates", entityId: req.params.id, before: existing, after: { name, questions } });
		res.json({ ok: true, template: { id: req.params.id, name } });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.delete("/checklists/templates/:id", requireRotPermission("checklists.configurar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`update rot_checklist_templates set active=false, updated_at=now() where id=$1 returning *`,
			[req.params.id],
		);
		if (!rows[0]) fail(404, "Checklist não encontrado.");
		await auditLog(req, { action: "delete", entity: "rot_checklist_templates", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/assets/:id/checklists", requireRotPermission("checklists.executar"), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		const checklist = await executeChecklist(client, req, {
			assetId: asset.id,
			templateId: asset.checklist_template_id || req.body?.templateId,
			answers: req.body?.answers,
		});
		let after = asset;
		let occurrence = null;
		if (checklist.hasNok) {
			occurrence = await createOccurrence(client, req, {
				assetId: asset.id,
				type: "N-OK em checklist",
				description: nullableText(req.body?.observation, 1000) || "Checklist registrou resposta N-OK.",
				criticalityId: req.body?.criticalityId || "alto",
				evidence: req.body?.evidence || [],
			});
			after = await blockAsset(client, req, {
				asset,
				reason: "Checklist com resposta N-OK.",
				origin: "checklist",
				occurrenceId: occurrence.id,
				evidence: req.body?.evidence || [],
			});
		} else {
			const days = inspectionFrequencyDays(asset.inspection_frequency);
			const { rows } = await client.query(
				`update rot_assets set last_inspection_at=now(), next_inspection_at = case when $2::int is null then null else now() + ($2::int * interval '1 day') end where id=$1 returning *`,
				[asset.id, days],
			);
			after = rows[0];
		}
		await assetTimeline(client, req, asset.id, "checklist", `Checklist: ${checklist.result}`, checklist.hasNok ? "Resposta N-OK registrada." : "Itens conformes.", asset, after);
		await client.query("commit");
		await auditLog(req, { action: "checklist", entity: "rot_assets", entityId: asset.id, before: asset, after });
		res.status(201).json({ ok: true, checklist, occurrence, asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Historico/gestao de checklists realizados — pra quem tem
// checklists.configurar (lideranca/gestao). O tecnico comum so ve o
// "pendente para mim" em /assets/checklists/pending-for-me; aqui e a
// visao de quem cria os modelos e acompanha o que foi executado.
router.get("/checklists/executions", requireRotPermission("checklists.configurar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select e.id, e.status, e.result, e.started_at, e.completed_at, e.template_id,
				a.id as asset_id, a.code as asset_code, a.name as asset_name,
				t.name as template_name, u.name as executed_by_name
			 from rot_checklist_executions e
			 left join rot_assets a on a.id = e.asset_id
			 left join rot_checklist_templates t on t.id = e.template_id
			 left join rot_users u on u.id = e.executed_by
			 where ($1::text is null or a.regional_id = $1)
			 order by e.created_at desc
			 limit 200`,
			[scopeRegionalFilter(req)],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

router.get("/checklists/executions/:id", requireRotPermission("checklists.configurar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select e.id, e.status, e.result, e.started_at, e.completed_at, e.template_id,
				a.id as asset_id, a.code as asset_code, a.name as asset_name, a.regional_id,
				t.name as template_name, u.name as executed_by_name
			 from rot_checklist_executions e
			 left join rot_assets a on a.id = e.asset_id
			 left join rot_checklist_templates t on t.id = e.template_id
			 left join rot_users u on u.id = e.executed_by
			 where e.id = $1`,
			[req.params.id],
		);
		const execution = rows[0];
		if (!execution) fail(404, "Execução de checklist não encontrada.");
		const scope = scopeRegionalFilter(req);
		if (scope && execution.regional_id !== scope) fail(403, "Regional não autorizada.");
		const { rows: answers } = await db.query(
			`select ans.id, ans.question_id, ans.value, ans.label, ans.status, q.label as question_label, q.sort_order
			 from rot_checklist_answers ans
			 left join rot_checklist_questions q on q.id = ans.question_id
			 where ans.execution_id = $1
			 order by q.sort_order, ans.id`,
			[req.params.id],
		);
		res.json({ ok: true, execution, answers });
	} catch (error) {
		next(error);
	}
});

router.get("/transfers", requireRotPermission("ativos.transferir"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select tr.*, a.code, a.name as asset_name, from_t.nome as from_technician_name, to_t.nome as to_technician_name,
				from_u.name as from_user_name, to_u.name as to_user_name, u.name as requested_by_name
			 from rot_asset_transfers tr
			 join rot_assets a on a.id = tr.asset_id
			 left join operacao_tecnicos from_t on from_t.id = tr.from_technician_id
			 left join operacao_tecnicos to_t on to_t.id = tr.to_technician_id
			 left join rot_users from_u on from_u.id = tr.from_user_id
			 left join rot_users to_u on to_u.id = tr.to_user_id
			 left join rot_users u on u.id = tr.requested_by
			 where ($1::text is null or tr.regional_id=$1)
			 order by tr.created_at desc
			 limit 100`,
			[scopeRegionalFilter(req)],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

router.get("/returns", requireRotPermission("ativos.devolver"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select rt.*, a.code, a.name as asset_name, from_t.nome as from_technician_name, s.name as destination_status_name, u.name as returned_by_name
			 from rot_asset_returns rt
			 join rot_assets a on a.id = rt.asset_id
			 left join operacao_tecnicos from_t on from_t.id = rt.from_technician_id
			 left join rot_asset_statuses s on s.id = rt.destination_status_id
			 left join rot_users u on u.id = rt.returned_by
			 where ($1::text is null or a.regional_id=$1)
			 order by rt.created_at desc
			 limit 100`,
			[scopeRegionalFilter(req)],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

router.get("/blocks", requireRotPermission(["ativos.bloquear", "ativos.liberar", "ativos.visualizar"]), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select b.*, a.code, a.name as asset_name, u.name as blocked_by_name, ru.name as released_by_name
			 from rot_asset_blocks b
			 join rot_assets a on a.id = b.asset_id
			 left join rot_users u on u.id = b.blocked_by
			 left join rot_users ru on ru.id = b.released_by
			 where ($1::text is null or a.regional_id=$1)
			 order by b.active desc, b.blocked_at desc
			 limit 100`,
			[scopeRegionalFilter(req)],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

router.post("/assets/:id/transfer", requireRotPermission("ativos.transferir"), async (req, res, next) => {
	let client;
	try {
		const toTechnicianId = nullableText(req.body?.toTechnicianId);
		const toUserId = nullableText(req.body?.toUserId);
		if (!toTechnicianId && !toUserId) fail(400, "Informe o novo responsável.");
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		if (asset.status_blocks_transfer && !userHasRotPermission(req.rotUser, "ativos.liberar")) {
			fail(409, "Ativo bloqueado para transferência.");
		}
		const requiresAcceptance = Boolean(req.body?.requiresAcceptance ?? asset.high_value);
		let checklist = null;
		if (req.body?.checklist?.answers?.length) {
			checklist = await executeChecklist(client, req, { assetId: asset.id, templateId: asset.checklist_template_id || req.body.checklist.templateId, answers: req.body.checklist.answers });
			if (checklist.hasNok) fail(409, "Checklist de transferência possui N-OK. Corrija antes de transferir.");
		}
		const transferId = randomId("trf");
		const status = requiresAcceptance ? "PENDING_ACCEPTANCE" : "COMPLETED";
		const { rows: transfers } = await client.query(
			`insert into rot_asset_transfers (
				id, asset_id, from_user_id, from_technician_id, to_user_id, to_technician_id, operation_scope, regional_id,
				reason, condition, checklist_execution_id, evidence, notes, requires_acceptance, status, requested_by, completed_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,case when $15='COMPLETED' then now() else null end)
			returning *`,
			[
				transferId,
				asset.id,
				asset.custody_user_id,
				asset.custody_technician_id,
				toUserId,
				toTechnicianId,
				asset.operation_scope,
				asset.regional_id,
				nullableText(req.body?.reason, 500),
				nullableText(req.body?.condition, 500),
				checklist?.id || null,
				JSON.stringify(req.body?.evidence || []),
				nullableText(req.body?.notes, 1000),
				requiresAcceptance,
				status,
				req.rotUser.id,
			],
		);
		let after = asset;
		if (!requiresAcceptance) {
			const { rows } = await client.query(
				`update rot_assets set custody_user_id=$2, custody_technician_id=$3, status_id='em_uso', last_movement_at=now() where id=$1 returning *`,
				[asset.id, toUserId, toTechnicianId],
			);
			after = rows[0];
		}
		await assetTimeline(client, req, asset.id, requiresAcceptance ? "transfer_pending" : "transfer", requiresAcceptance ? "Transferência aguardando aceite" : "Ativo transferido", nullableText(req.body?.notes, 1000), asset, after);
		await client.query("commit");
		await auditLog(req, { action: "transfer", entity: "rot_assets", entityId: asset.id, before: asset, after });
		res.status(201).json({ ok: true, transfer: transfers[0], asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Lista as transferencias aguardando aceite DO PROPRIO usuario logado —
// sem exigir ativos.transferir, porque aceitar/recusar algo endereçado a
// voce e uma acao pessoal, nao de gestao. E o que alimenta o card de
// "transferencias pendentes" no Dashboard.
router.get("/transfers/pending-for-me", async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select tr.*, a.code, a.name as asset_name, from_t.nome as from_technician_name, from_u.name as from_user_name, u.name as requested_by_name
			 from rot_asset_transfers tr
			 join rot_assets a on a.id = tr.asset_id
			 left join operacao_tecnicos from_t on from_t.id = tr.from_technician_id
			 left join rot_users from_u on from_u.id = tr.from_user_id
			 left join rot_users u on u.id = tr.requested_by
			 where tr.status = 'PENDING_ACCEPTANCE' and tr.to_user_id = $1
			 order by tr.created_at desc`,
			[req.rotUser.id],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

// So quem tem ativos.transferir (gestao) OU o proprio destinatario
// (to_user_id) pode aceitar — antes exigia so a permissao de gestao, e o
// destinatario (um tecnico comum, sem essa permissao) nao tinha como
// aceitar a propria transferencia.
function assertTransferRecipientOrManager(req, transfer) {
	if (userHasRotPermission(req.rotUser, "ativos.transferir")) return;
	if (transfer.to_user_id && transfer.to_user_id === req.rotUser.id) return;
	fail(403, "Você não tem permissão para responder a esta transferência.");
}

// Editar uma transferencia ainda pendente (destino/condicao/motivo) — so
// gestao (ativos.transferir), e so enquanto ninguem aceitou/recusou ainda.
router.put("/transfers/:id", requireRotPermission("ativos.transferir"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`select * from rot_asset_transfers where id=$1`, [req.params.id]);
		const transfer = rows[0];
		if (!transfer) fail(404, "Transferência não encontrada.");
		if (transfer.status !== "PENDING_ACCEPTANCE") fail(409, "Só é possível editar uma transferência ainda pendente.");
		const toUserId = nullableText(req.body?.toUserId);
		const toTechnicianId = nullableText(req.body?.toTechnicianId);
		if (req.body?.toUserId !== undefined || req.body?.toTechnicianId !== undefined) {
			if (!toUserId && !toTechnicianId) fail(400, "Informe o novo responsável.");
		}
		const { rows: updated } = await db.query(
			`update rot_asset_transfers set
				to_user_id = case when $2::boolean then $3 else to_user_id end,
				to_technician_id = case when $4::boolean then $5 else to_technician_id end,
				condition = coalesce($6, condition),
				reason = coalesce($7, reason),
				notes = coalesce($8, notes),
				requires_acceptance = coalesce($9, requires_acceptance)
			 where id=$1 returning *`,
			[
				req.params.id,
				req.body?.toUserId !== undefined,
				toUserId,
				req.body?.toTechnicianId !== undefined,
				toTechnicianId,
				nullableText(req.body?.condition, 500),
				nullableText(req.body?.reason, 500),
				req.body?.notes === undefined ? null : nullableText(req.body?.notes, 1000),
				typeof req.body?.requiresAcceptance === "boolean" ? req.body.requiresAcceptance : null,
			],
		);
		await auditLog(req, { action: "update", entity: "rot_asset_transfers", entityId: req.params.id, before: transfer, after: updated[0] });
		res.json({ ok: true, transfer: updated[0] });
	} catch (error) {
		next(error);
	}
});

router.post("/transfers/:id/accept", async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(`select * from rot_asset_transfers where id=$1 for update`, [req.params.id]);
		const transfer = rows[0];
		if (!transfer) fail(404, "Transferência não encontrada.");
		if (transfer.status !== "PENDING_ACCEPTANCE") fail(409, "Transferência não está pendente.");
		assertTransferRecipientOrManager(req, transfer);
		const asset = await loadAssetForUpdate(client, req, transfer.asset_id);
		const { rows: updatedAssets } = await client.query(
			`update rot_assets set custody_user_id=$2, custody_technician_id=$3, status_id='em_uso', last_movement_at=now() where id=$1 returning *`,
			[asset.id, transfer.to_user_id, transfer.to_technician_id],
		);
		await client.query(
			`update rot_asset_transfers set status='COMPLETED', accepted_by=$2, accepted_at=now(), completed_at=now() where id=$1`,
			[transfer.id, req.rotUser.id],
		);
		await assetTimeline(client, req, asset.id, "transfer_accept", "Recebimento confirmado", nullableText(req.body?.notes, 1000), asset, updatedAssets[0]);
		await client.query("commit");
		res.json({ ok: true, asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/transfers/:id/decline", async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(`select * from rot_asset_transfers where id=$1 for update`, [req.params.id]);
		const transfer = rows[0];
		if (!transfer) fail(404, "Transferência não encontrada.");
		if (transfer.status !== "PENDING_ACCEPTANCE") fail(409, "Transferência não está pendente.");
		assertTransferRecipientOrManager(req, transfer);
		const declineReason = nullableText(req.body?.reason, 1000);
		if (!declineReason) fail(400, "Informe o motivo da recusa.");
		await client.query(
			`update rot_asset_transfers set status='CANCELED', declined_by=$2, declined_at=now(), decline_reason=$3 where id=$1`,
			[transfer.id, req.rotUser.id, declineReason],
		);
		await assetTimeline(client, req, transfer.asset_id, "transfer_decline", "Transferência recusada", declineReason, null, null);
		await client.query("commit");
		res.json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// So gestao (ativos.devolver) OU quem esta com o ativo AGORA
// (custody_user_id = o proprio) pode devolver — devolver o que voce
// mesmo esta segurando e acao pessoal, mesma logica ja aplicada em
// aceitar/recusar transferencia.
function assertReturnAllowed(req, asset) {
	if (userHasRotPermission(req.rotUser, "ativos.devolver")) return;
	if (asset.custody_user_id && asset.custody_user_id === req.rotUser.id) return;
	fail(403, "Você não tem permissão para devolver este ativo.");
}

router.post("/assets/:id/return", async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		assertReturnAllowed(req, asset);
		let checklist = null;
		if (req.body?.checklist?.answers?.length) {
			checklist = await executeChecklist(client, req, { assetId: asset.id, templateId: asset.checklist_template_id || req.body.checklist.templateId, answers: req.body.checklist.answers });
		} else if (asset.requires_checklist) {
			fail(400, "Checklist de devolução obrigatório para este ativo.");
		}
		const destinationStatusId = nullableText(req.body?.destinationStatusId) || (checklist?.hasNok ? "aguardando_validacao" : "disponivel");
		const returnId = randomId("ret");
		await client.query(
			`insert into rot_asset_returns (
				id, asset_id, from_user_id, from_technician_id, destination_status_id, condition, problems,
				checklist_execution_id, evidence, notes, status, returned_by, completed_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'COMPLETED',$11,now())`,
			[
				returnId,
				asset.id,
				asset.custody_user_id,
				asset.custody_technician_id,
				destinationStatusId,
				nullableText(req.body?.condition, 500),
				nullableText(req.body?.problems, 1000),
				checklist?.id || null,
				JSON.stringify(req.body?.evidence || []),
				nullableText(req.body?.notes, 1000),
				req.rotUser.id,
			],
		);
		const { rows: updated } = await client.query(
			`update rot_assets set custody_user_id=null, custody_technician_id=null, status_id=$2, last_movement_at=now() where id=$1 returning *`,
			[asset.id, destinationStatusId],
		);
		await assetTimeline(client, req, asset.id, "return", "Ativo devolvido", nullableText(req.body?.notes, 1000), asset, updated[0]);
		if (checklist?.hasNok) {
			await createOccurrence(client, req, {
				assetId: asset.id,
				type: "N-OK em devolução",
				description: nullableText(req.body?.problems, 1000) || "Checklist de devolução registrou N-OK.",
				criticalityId: "alto",
				evidence: req.body?.evidence || [],
			});
		}
		await client.query("commit");
		await auditLog(req, { action: "return", entity: "rot_assets", entityId: asset.id, before: asset, after: updated[0] });
		res.status(201).json({ ok: true, asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.get("/occurrences", requireRotPermission("ocorrencias.visualizar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select o.*, a.code, a.name as asset_name, cr.name as criticality_name, cr.color as criticality_color, u.name as opened_by_name
			 from rot_asset_occurrences o
			 join rot_assets a on a.id=o.asset_id
			 left join rot_asset_criticalities cr on cr.id=o.criticality_id
			 left join rot_users u on u.id=o.opened_by
			 where ($1::text is null or a.regional_id=$1)
			 order by o.created_at desc
			 limit 100`,
			[scopeRegionalFilter(req)],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

router.post("/assets/:id/problem", requireRotPermission("ocorrencias.criar"), async (req, res, next) => {
	let client;
	try {
		const description = nullableText(req.body?.description, 2000);
		if (!description) fail(400, "Descreva o problema.");
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		const occurrence = await createOccurrence(client, req, {
			assetId: asset.id,
			type: nullableText(req.body?.type, 180) || "Problema reportado",
			description,
			criticalityId: req.body?.criticalityId || "atencao",
			evidence: req.body?.evidence || [],
		});
		let after = asset;
		if (req.body?.blockAsset) {
			after = await blockAsset(client, req, { asset, reason: description, origin: "occurrence", occurrenceId: occurrence.id, evidence: req.body?.evidence || [] });
		} else {
			const { rows } = await client.query(`update rot_assets set status_id='com_ocorrencia' where id=$1 returning *`, [asset.id]);
			after = rows[0];
			await assetTimeline(client, req, asset.id, "occurrence", "Problema reportado", description, asset, after);
		}
		await client.query("commit");
		await auditLog(req, { action: "create", entity: "rot_asset_occurrences", entityId: occurrence.id, after: occurrence });
		res.status(201).json({ ok: true, occurrence, asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/assets/:id/block", requireRotPermission("ativos.bloquear"), async (req, res, next) => {
	let client;
	try {
		const reason = nullableText(req.body?.reason, 1000);
		if (!reason) fail(400, "Informe o motivo do bloqueio.");
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		await blockAsset(client, req, { asset, reason, origin: "manual", evidence: req.body?.evidence || [] });
		await client.query("commit");
		res.json({ ok: true, asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/assets/:id/release", requireRotPermission("ativos.liberar"), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		await client.query(
			`update rot_asset_blocks set active=false, released_by=$2, released_at=now(), release_notes=$3 where asset_id=$1 and active=true`,
			[asset.id, req.rotUser.id, nullableText(req.body?.notes, 1000)],
		);
		const { rows } = await client.query(
			`update rot_assets set status_id=case when custody_user_id is not null or custody_technician_id is not null then 'em_uso' else 'disponivel' end where id=$1 returning *`,
			[asset.id],
		);
		await assetTimeline(client, req, asset.id, "release", "Ativo liberado", nullableText(req.body?.notes, 1000), asset, rows[0]);
		await client.query("commit");
		await auditLog(req, { action: "release", entity: "rot_assets", entityId: asset.id, before: asset, after: rows[0] });
		res.json({ ok: true, asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.get("/maintenance", requireRotPermission("manutencoes.visualizar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select m.*, a.code as asset_code, a.name as asset_name, cr.name as criticality_name, cr.color as criticality_color
			 from rot_maintenance_orders m
			 join rot_assets a on a.id=m.asset_id
			 left join rot_asset_criticalities cr on cr.id=m.criticality_id
			 where ($1::text is null or a.regional_id=$1)
			 order by m.created_at desc
			 limit 100`,
			[scopeRegionalFilter(req)],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

router.post("/assets/:id/maintenance", requireRotPermission("manutencoes.criar"), async (req, res, next) => {
	let client;
	try {
		const description = nullableText(req.body?.description, 2000);
		if (!description) fail(400, "Descreva a manutenção.");
		client = await db.connect();
		await client.query("begin");
		const asset = await loadAssetForUpdate(client, req, req.params.id);
		const id = randomId("om");
		const code = await nextMaintenanceCode(client);
		const { rows } = await client.query(
			`insert into rot_maintenance_orders (id, code, asset_id, occurrence_id, criticality_id, responsible_id, description, evidence, opened_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
			 returning *`,
			[id, code, asset.id, nullableText(req.body?.occurrenceId), req.body?.criticalityId || asset.criticality_id || "atencao", nullableText(req.body?.responsibleId), description, JSON.stringify(req.body?.evidence || []), req.rotUser.id],
		);
		const { rows: updated } = await client.query(`update rot_assets set status_id='manutencao' where id=$1 returning *`, [asset.id]);
		await assetTimeline(client, req, asset.id, "maintenance", `Manutenção aberta ${code}`, description, asset, updated[0]);
		await client.query("commit");
		await auditLog(req, { action: "create", entity: "rot_maintenance_orders", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, maintenance: rows[0], asset: await hydrateAsset(asset.id, req) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.put("/maintenance/:id", requireRotPermission("manutencoes.tratar"), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows: beforeRows } = await client.query(`select * from rot_maintenance_orders where id=$1 for update`, [req.params.id]);
		const before = beforeRows[0];
		if (!before) fail(404, "Manutenção não encontrada.");
		const requestedStatus = nullableText(req.body?.status, 80) || before.status;
		const status = requestedStatus === "EM_ANDAMENTO" ? "EM_MANUTENCAO" : requestedStatus;
		const allowedStatuses = new Set(["REPORTADO", "TRIAGEM", "AGUARDANDO_MANUTENCAO", "EM_MANUTENCAO", "AGUARDANDO_VALIDACAO", "LIBERADO", "CANCELADO"]);
		if (!allowedStatuses.has(status)) fail(400, "Status de manutenção inválido.");
		const { rows } = await client.query(
			`update rot_maintenance_orders set
				status=$2,
				service_performed=coalesce($3, service_performed),
				cost=coalesce($4, cost),
				notes=coalesce($5, notes),
				closed_by=case when $2 in ('LIBERADO','CANCELADO') then $6 else closed_by end,
				closed_at=case when $2 in ('LIBERADO','CANCELADO') then now() else closed_at end
			 where id=$1 returning *`,
			[req.params.id, status, nullableText(req.body?.servicePerformed, 2000), req.body?.cost === undefined ? null : Number(req.body.cost), nullableText(req.body?.notes, 2000), req.rotUser.id],
		);
		if (status === "LIBERADO") {
			const asset = await loadAssetForUpdate(client, req, before.asset_id);
			const { rows: updatedAsset } = await client.query(`update rot_assets set status_id='disponivel' where id=$1 returning *`, [asset.id]);
			await assetTimeline(client, req, asset.id, "maintenance_release", `Manutenção liberada ${before.code}`, nullableText(req.body?.notes, 1000), asset, updatedAsset[0]);
		}
		await client.query("commit");
		await auditLog(req, { action: "update", entity: "rot_maintenance_orders", entityId: req.params.id, before, after: rows[0] });
		res.json({ ok: true, maintenance: rows[0] });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/settings/:kind", async (req, res, next) => {
	try {
		const config = CONFIG_TABLES[req.params.kind];
		if (!config) fail(404, "Configuração não encontrada.");
		requireRotPermission(config.permission)(req, res, async (error) => {
			if (error) return next(error);
			try {
				const id = nullableText(req.body?.id, 80) || randomId("cfg");
				const columns = ["id"];
				const values = [id];
				for (const field of config.fields) {
					if (Object.prototype.hasOwnProperty.call(req.body || {}, field) || Object.prototype.hasOwnProperty.call(req.body || {}, toCamel(field))) {
						columns.push(field);
						const rawValue = req.body[field] ?? req.body[toCamel(field)];
						values.push(field === "actions" ? JSON.stringify(rawValue || {}) : rawValue);
					}
				}
				if (!columns.includes("name")) fail(400, "Informe o nome.");
				const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
				const updateSet = columns.filter((field) => field !== "id").map((field) => `${field}=excluded.${field}`).join(",");
				const { rows } = await db.query(
					`insert into ${config.table} (${columns.join(",")}) values (${placeholders})
					 on conflict (id) do update set ${updateSet}, updated_at=now()
					 returning *`,
					values,
				);
				await auditLog(req, { action: "upsert", entity: config.table, entityId: id, after: rows[0] });
				res.status(201).json({ ok: true, [config.publicName]: publicConfig(rows[0]) });
			} catch (innerError) {
				next(innerError);
			}
		});
	} catch (error) {
		next(error);
	}
});

router.delete("/settings/:kind/:id", async (req, res, next) => {
	try {
		const config = CONFIG_TABLES[req.params.kind];
		if (!config) fail(404, "Configuração não encontrada.");
		requireRotPermission(config.permission)(req, res, async (error) => {
			if (error) return next(error);
			try {
				const { rows } = await db.query(
					`update ${config.table} set active=false, updated_at=now() where id=$1 returning *`,
					[req.params.id],
				);
				if (!rows[0]) fail(404, "Configuração não encontrada.");
				await auditLog(req, { action: "delete", entity: config.table, entityId: req.params.id, before: rows[0] });
				res.json({ ok: true, [config.publicName]: publicConfig(rows[0]) });
			} catch (innerError) {
				next(innerError);
			}
		});
	} catch (error) {
		next(error);
	}
});

function toCamel(value) {
	return String(value).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

module.exports = router;
