const crypto = require("node:crypto");
const db = require("../db");
const documents = require("../documents");
const auditLog = require("../auditLog");

const VIEW_PERMISSIONS = [
	"mercado.dashboard.view",
	"mercado.lotes.view",
	"mercado.execucao.view",
	"mercado.backoffice.view",
	"mercado.financeiro.view",
	"mercado.auditoria.view",
];
const LOTES_VIEW_PERMISSIONS = ["mercado.lotes.view", "mercado.lotes.manage"];
const LOTES_MANAGE_PERMISSIONS = ["mercado.lotes.manage"];
const LOTES_ACCEPT_PERMISSIONS = ["mercado.lotes.accept", "mercado.lotes.manage"];
const EXECUCAO_VIEW_PERMISSIONS = ["mercado.execucao.view", "mercado.execucao.manage"];
const EXECUCAO_MANAGE_PERMISSIONS = [
	"mercado.execucao.manage",
	"mercado.execucao.evidencias",
];
const BACKOFFICE_VIEW_PERMISSIONS = [
	"mercado.backoffice.view",
	"mercado.backoffice.manage",
	"mercado.backoffice.approve",
];
const BACKOFFICE_MANAGE_PERMISSIONS = [
	"mercado.backoffice.manage",
	"mercado.backoffice.approve",
];
const FINANCEIRO_VIEW_PERMISSIONS = [
	"mercado.financeiro.view",
	"mercado.financeiro.manage",
];
const FINANCEIRO_MANAGE_PERMISSIONS = ["mercado.financeiro.manage"];
const CONFIG_VIEW_PERMISSIONS = ["mercado.config.view", "mercado.config.manage"];
const CONFIG_MANAGE_PERMISSIONS = ["mercado.config.manage"];

const ACTIVE_LOTE_STATUSES = ["ACCEPTED", "IN_EXECUTION"];
const OCCUPYING_LOTE_STATUSES = ["ACCEPTED", "IN_EXECUTION"];
const DEFAULT_CONFIG = {
	lotes: {
		quantidadesPermitidas: [15, 25, 35],
		maxLotesSimultaneosPorEmpresa: 3,
		maxLotesSimultaneosPorCidade: 1,
		distanciaMaximaKm: 8,
		criteriosAgrupamento: ["cidade", "bairro", "equipamento", "idade_os"],
	},
	prazos: {
		slaHoras: 72,
		desistenciaMinutos: 60,
		regularizacaoDias: 7,
		correcaoEvidenciasHoras: 48,
		conferenciaBackofficeHoras: 72,
	},
	financeiro: {
		precoBasePorEquipamento: 55,
		valorTentativa: 8,
		limiteTentativasRemuneradas: 2,
		descontoAgendamento: 10,
		penalizacaoPorHora: 1.5,
		pisoPorOs: 16,
		tetoPorOs: 90,
		arredondamento: "centavos",
	},
	suspensoes: {
		toleranciaHoras: 24,
		primeiraOcorrenciaDias: 3,
		segundaOcorrenciaDias: 7,
		terceiraOcorrenciaDias: 30,
		janelaApuracaoDias: 90,
	},
	integracoes: {
		frequenciaMinutos: 30,
		timeoutMs: 60000,
		retry: 3,
		concorrencia: 2,
		retencaoLogsDias: 90,
	},
};

function text(value) {
	return String(value ?? "").trim();
}

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function numberValue(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback, max = 1000) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function cleanArray(value) {
	if (Array.isArray(value)) return value.map(text).filter(Boolean);
	return String(value || "")
		.split(/[,\n;]/)
		.map(text)
		.filter(Boolean);
}

function mergeConfig(config = {}) {
	return {
		lotes: { ...DEFAULT_CONFIG.lotes, ...(config.lotes || {}) },
		prazos: { ...DEFAULT_CONFIG.prazos, ...(config.prazos || {}) },
		financeiro: { ...DEFAULT_CONFIG.financeiro, ...(config.financeiro || {}) },
		suspensoes: { ...DEFAULT_CONFIG.suspensoes, ...(config.suspensoes || {}) },
		integracoes: { ...DEFAULT_CONFIG.integracoes, ...(config.integracoes || {}) },
	};
}

function userName(user = {}) {
	return (
		text(user.profile?.displayName) ||
		text(user.profile?.nome) ||
		text(user.profile?.name) ||
		text(user.nome) ||
		text(user.email) ||
		text(user.uid)
	);
}

function userEmpresa(user = {}) {
	const profile = user.profile || {};
	return {
		id: text(user.empresa_id || user.empresaId || profile.empresa_id || profile.empresaId),
		nome: text(
			user.empresa_nome ||
				user.empresaNome ||
				profile.empresa_nome ||
				profile.empresaNome,
		),
	};
}

function permissionsOf(user = {}) {
	return new Set([
		...(Array.isArray(user.permissions) ? user.permissions : []),
		...(Array.isArray(user.profile?.permissions) ? user.profile.permissions : []),
	]);
}

function hasPermission(user = {}, permission) {
	if (String(user.role || user.profile?.role || "").toLowerCase() === "admin") {
		return true;
	}
	const permissions = permissionsOf(user);
	if (permissions.has("*") || permissions.has(permission)) return true;
	if (String(permission).endsWith(".view")) {
		return permissions.has(String(permission).replace(/\.view$/, ".manage"));
	}
	return false;
}

function canManageMercado(user = {}) {
	return [
		"mercado.lotes.manage",
		"mercado.backoffice.manage",
		"mercado.backoffice.approve",
		"mercado.financeiro.manage",
		"mercado.config.manage",
	].some((permission) => hasPermission(user, permission));
}

function assertEmpresaScope(user, empresaId) {
	if (canManageMercado(user)) return;
	const empresa = userEmpresa(user);
	if (!empresa.id || empresa.id !== text(empresaId)) {
		const error = new Error("Empresa nao autorizada para este recurso.");
		error.status = 403;
		throw error;
	}
}

function mapLote(row = {}) {
	return {
		id: row.id,
		codigo: row.codigo,
		status: row.status,
		cidade: row.cidade,
		bairros: row.bairros || [],
		equipamentoTipo: row.equipamento_tipo,
		quantidadeOs: Number(row.quantidade_os || 0),
		dificuldade: row.dificuldade,
		valorPotencial: Number(row.valor_potencial || 0),
		valorContratado: row.valor_contratado == null ? null : Number(row.valor_contratado),
		slaHours: Number(row.sla_hours || 0),
		regularizationDays: Number(row.regularization_days || 0),
		acceptedByEmpresaId: row.accepted_by_empresa_id || "",
		acceptedByEmpresaNome: row.accepted_by_empresa_nome || "",
		acceptedAt: row.accepted_at,
		withdrawDeadlineAt: row.withdraw_deadline_at,
		submittedAt: row.submitted_at,
		approvedAt: row.approved_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapOs(row = {}) {
	return {
		id: row.id,
		loteId: row.lote_id,
		ordemServicoId: row.ordem_servico_id,
		numOs: row.num_os,
		codigoCliente: row.codigo_cliente,
		nomeCliente: row.nome_cliente,
		telefone: row.telefone,
		endereco: row.endereco,
		bairro: row.bairro,
		cidade: row.cidade,
		equipamentoTipo: row.equipamento_tipo,
		macAddr: row.mac_addr,
		status: row.status,
		desfecho: row.desfecho,
		valorContratado: Number(row.valor_contratado || 0),
		valorAprovado: row.valor_aprovado == null ? null : Number(row.valor_aprovado),
		slaDueAt: row.sla_due_at,
		slaSuspendedUntil: row.sla_suspended_until,
		submittedAt: row.submitted_at,
		approvedAt: row.approved_at,
	};
}

async function writeEvent(client, payload = {}) {
	await client.query(
		`insert into mercado_lote_eventos (
			lote_id, lote_os_id, tipo, descricao, payload, created_by_uid, created_by_name
		) values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
		[
			payload.loteId || null,
			payload.loteOsId || null,
			payload.tipo,
			payload.descricao,
			JSON.stringify(payload.payload || {}),
			payload.user?.uid || null,
			userName(payload.user || {}),
		],
	);
}

async function audit(entity, action, recordId, beforeData, afterData, user) {
	return auditLog.recordAuditLog({
		module: "mercado",
		entity,
		action,
		recordId,
		userId: user?.uid,
		userName: userName(user),
		userEmail: user?.email,
		beforeData,
		afterData,
		changedFields: auditLog.calculateChangedFields(beforeData, afterData),
	});
}

async function getCurrentConfig() {
	const result = await db.query(
		`select * from mercado_config_versions where active = true order by version desc limit 1`,
	);
	const row = result.rows[0];
	if (!row) {
		return { id: null, version: 0, active: true, config: DEFAULT_CONFIG };
	}
	return {
		id: row.id,
		version: Number(row.version || 0),
		active: row.active,
		config: mergeConfig(row.config || {}),
		createdAt: row.created_at,
		createdByName: row.created_by_name,
	};
}

async function saveConfig(payload = {}, user = {}) {
	const nextConfig = mergeConfig(payload.config || payload);
	const client = await db.connect();
	try {
		await client.query("begin");
		const versionResult = await client.query(
			`select coalesce(max(version), 0) + 1 as version from mercado_config_versions`,
		);
		const version = Number(versionResult.rows[0]?.version || 1);
		await client.query(`update mercado_config_versions set active = false where active`);
		const result = await client.query(
			`insert into mercado_config_versions (
				version, active, config, created_by_uid, created_by_name
			) values ($1, true, $2::jsonb, $3, $4)
			returning *`,
			[version, JSON.stringify(nextConfig), user.uid || null, userName(user)],
		);
		await writeEvent(client, {
			tipo: "CONFIG_UPDATED",
			descricao: `Configuracao do Mercado versionada como v${version}.`,
			payload: { version },
			user,
		});
		await client.query("commit");
		await audit("mercado_config_versions", "create", String(result.rows[0].id), null, result.rows[0], user);
		return getCurrentConfig();
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

function simulatePricing(config, lote = {}) {
	const financeiro = mergeConfig(config).financeiro;
	const quantidade = positiveInteger(lote.quantidadeOs || lote.quantidade || 1, 1, 500);
	const dificuldade = String(lote.dificuldade || "NORMAL").toUpperCase();
	const dificuldadeMultiplier =
		dificuldade === "ALTA" ? 1.18 : dificuldade === "BAIXA" ? 0.94 : 1;
	const base = numberValue(lote.precoBase || financeiro.precoBasePorEquipamento, 55);
	const brutoPorOs = base * dificuldadeMultiplier;
	const piso = numberValue(financeiro.pisoPorOs, 0);
	const teto = numberValue(financeiro.tetoPorOs, 999999);
	const valorPorOs = Math.min(Math.max(brutoPorOs, piso), teto);
	const total = Math.round(valorPorOs * quantidade * 100) / 100;
	return {
		quantidade,
		precoBase: base,
		dificuldade,
		multiplicadorDificuldade: dificuldadeMultiplier,
		piso,
		teto,
		valorPorOs: Math.round(valorPorOs * 100) / 100,
		total,
	};
}

async function listEmpresas({ q = "", limit = 200 } = {}) {
	const rows = await documents.listAllDocuments("empresas_tecnicos");
	const query = text(q).toLowerCase();
	return rows
		.map((row) => ({
			id: row.documentId,
			nome: text(row.data?.nome || row.data?.empresa || row.documentId),
			cnpj: text(row.data?.cnpj || row.data?.documento),
			status: text(row.data?.status || "Ativa"),
			cidades: cleanArray(row.data?.cidades),
			regional: text(row.data?.regional),
		}))
		.filter((empresa) => !query || empresa.nome.toLowerCase().includes(query) || empresa.id.toLowerCase().includes(query))
		.slice(0, positiveInteger(limit, 200, 1000));
}

async function listHabilitacoes() {
	const result = await db.query(
		`select * from mercado_empresa_habilitacoes order by empresa_nome`,
	);
	return { items: result.rows };
}

async function saveHabilitacao(payload = {}, user = {}) {
	const empresaId = text(payload.empresaId || payload.empresa_id);
	if (!empresaId) {
		const error = new Error("Empresa obrigatoria.");
		error.status = 400;
		throw error;
	}
	const empresaNome = text(payload.empresaNome || payload.empresa_nome);
	const result = await db.query(
		`insert into mercado_empresa_habilitacoes (
			empresa_id, empresa_nome, enabled, cidades_autorizadas, limite_lotes,
			limite_por_cidade, observacoes, updated_by_uid, updated_by_name
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		on conflict (empresa_id) do update set
			empresa_nome = excluded.empresa_nome,
			enabled = excluded.enabled,
			cidades_autorizadas = excluded.cidades_autorizadas,
			limite_lotes = excluded.limite_lotes,
			limite_por_cidade = excluded.limite_por_cidade,
			observacoes = excluded.observacoes,
			updated_by_uid = excluded.updated_by_uid,
			updated_by_name = excluded.updated_by_name
		returning *`,
		[
			empresaId,
			empresaNome || empresaId,
			payload.enabled !== false,
			cleanArray(payload.cidadesAutorizadas || payload.cidades_autorizadas),
			positiveInteger(payload.limiteLotes || payload.limite_lotes, 3, 50),
			positiveInteger(payload.limitePorCidade || payload.limite_por_cidade, 1, 10),
			nullableText(payload.observacoes),
			user.uid || null,
			userName(user),
		],
	);
	await audit("mercado_empresa_habilitacoes", "update", empresaId, null, result.rows[0], user);
	return { item: result.rows[0] };
}

function buildListWhere(query = {}, user = {}) {
	const clauses = [];
	const params = [];
	function push(sql, value) {
		params.push(value);
		clauses.push(sql.replace("?", `$${params.length}`));
	}
	if (query.status) push("status = ?", text(query.status).toUpperCase());
	if (query.cidade) push("cidade ilike ?", `%${text(query.cidade)}%`);
	if (query.equipamentoTipo) push("equipamento_tipo ilike ?", `%${text(query.equipamentoTipo)}%`);
	if (query.empresaId) push("accepted_by_empresa_id = ?", text(query.empresaId));
	if (!canManageMercado(user)) {
		const empresa = userEmpresa(user);
		push("(accepted_by_empresa_id is null or accepted_by_empresa_id = ?)", empresa.id || "__no_company__");
	}
	return {
		where: clauses.length ? `where ${clauses.join(" and ")}` : "",
		params,
	};
}

async function listLotes(query = {}, user = {}) {
	const limit = positiveInteger(query.limit, 30, 100);
	const page = positiveInteger(query.page, 1, 100000);
	const offset = (page - 1) * limit;
	const { where, params } = buildListWhere(query, user);
	const result = await db.query(
		`select *, count(*) over() as total_count
		   from mercado_lotes
		  ${where}
		  order by created_at desc
		  limit $${params.length + 1} offset $${params.length + 2}`,
		[...params, limit, offset],
	);
	const total = Number(result.rows[0]?.total_count || 0);
	return {
		items: result.rows.map(mapLote),
		page,
		limit,
		total,
	};
}

async function getLote(id, user = {}) {
	const loteResult = await db.query(`select * from mercado_lotes where id = $1`, [id]);
	const lote = loteResult.rows[0];
	if (!lote) return null;
	if (lote.accepted_by_empresa_id) assertEmpresaScope(user, lote.accepted_by_empresa_id);
	const osResult = await db.query(
		`select * from mercado_lote_os where lote_id = $1 order by bairro, num_os`,
		[id],
	);
	const eventsResult = await db.query(
		`select * from mercado_lote_eventos where lote_id = $1 order by created_at desc limit 100`,
		[id],
	);
	return {
		item: mapLote(lote),
		os: osResult.rows.map(mapOs),
		events: eventsResult.rows,
	};
}

async function createManualLote(payload = {}, user = {}) {
	const config = await getCurrentConfig();
	const quantidade = positiveInteger(payload.quantidadeOs || payload.quantidade_os, 0, 500);
	const cidade = text(payload.cidade);
	const equipamentoTipo = text(payload.equipamentoTipo || payload.equipamento_tipo);
	if (!cidade || !equipamentoTipo || quantidade <= 0) {
		const error = new Error("Cidade, equipamento e quantidade sao obrigatorios.");
		error.status = 400;
		throw error;
	}
	const pricing = simulatePricing(config.config, {
		quantidade,
		dificuldade: payload.dificuldade,
	});
	const codigo = `MRC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
	const result = await db.query(
		`insert into mercado_lotes (
			codigo, status, cidade, bairros, equipamento_tipo, quantidade_os,
			dificuldade, valor_potencial, sla_hours, regularization_days,
			config_version_id, config_snapshot, pricing_snapshot, created_by_uid, created_by_name
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15)
		returning *`,
		[
			codigo,
			payload.publicar === false ? "DRAFT" : "AVAILABLE",
			cidade,
			cleanArray(payload.bairros),
			equipamentoTipo,
			quantidade,
			text(payload.dificuldade || "NORMAL").toUpperCase(),
			pricing.total,
			positiveInteger(config.config.prazos.slaHoras, 72, 720),
			positiveInteger(config.config.prazos.regularizacaoDias, 7, 365),
			config.id,
			JSON.stringify(config.config),
			JSON.stringify(pricing),
			user.uid || null,
			userName(user),
		],
	);
	await audit("mercado_lotes", "create", result.rows[0].id, null, result.rows[0], user);
	return { item: mapLote(result.rows[0]) };
}

async function generateLots(payload = {}, user = {}) {
	const config = await getCurrentConfig();
	const quantidade = positiveInteger(payload.quantidade || payload.quantidadeOs, 15, 35);
	if (!config.config.lotes.quantidadesPermitidas.includes(quantidade)) {
		const error = new Error("Quantidade de OS nao permitida para lote.");
		error.status = 400;
		throw error;
	}
	const cidade = text(payload.cidade);
	const equipamentoTipo = text(payload.equipamentoTipo || payload.equipamento_tipo);
	if (!cidade || !equipamentoTipo) {
		const error = new Error("Cidade e equipamento sao obrigatorios para gerar lotes.");
		error.status = 400;
		throw error;
	}
	const orders = await db.query(
		`select os.*
		   from ordens_servico os
		  where os.cidade ilike $1
		    and coalesce(os.status, '') not ilike '%fech%'
		    and coalesce(os.tipo, os.servico, '') <> ''
		    and not exists (
		    	select 1
		    	  from mercado_lote_os mlo
		    	  join mercado_lotes ml on ml.id = mlo.lote_id
		    	 where mlo.ordem_servico_id = os.id
		    	   and ml.status in ('DRAFT','AVAILABLE','ACCEPTED','IN_EXECUTION','SUBMITTED')
		    )
		  order by os.data_abertura nulls last, os.bairro nulls last
		  limit $2`,
		[`%${cidade}%`, quantidade],
	);
	if (orders.rows.length < quantidade) {
		const error = new Error("Nao ha OS elegiveis suficientes para formar o lote.");
		error.status = 400;
		throw error;
	}
	const bairros = [...new Set(orders.rows.map((row) => text(row.bairro)).filter(Boolean))];
	const pricing = simulatePricing(config.config, {
		quantidade: orders.rows.length,
		dificuldade: payload.dificuldade,
	});
	const client = await db.connect();
	try {
		await client.query("begin");
		const codigo = `MRC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
		const loteResult = await client.query(
			`insert into mercado_lotes (
				codigo, status, cidade, bairros, equipamento_tipo, quantidade_os,
				dificuldade, valor_potencial, sla_hours, regularization_days,
				config_version_id, config_snapshot, pricing_snapshot, created_by_uid, created_by_name
			) values ($1, 'AVAILABLE', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14)
			returning *`,
			[
				codigo,
				cidade,
				bairros,
				equipamentoTipo,
				orders.rows.length,
				text(payload.dificuldade || "NORMAL").toUpperCase(),
				pricing.total,
				config.config.prazos.slaHoras,
				config.config.prazos.regularizacaoDias,
				config.id,
				JSON.stringify(config.config),
				JSON.stringify(pricing),
				user.uid || null,
				userName(user),
			],
		);
		const lote = loteResult.rows[0];
		const valorPorOs = pricing.valorPorOs;
		for (const order of orders.rows) {
			await client.query(
				`insert into mercado_lote_os (
					lote_id, ordem_servico_id, num_os, codigo_cliente, nome_cliente,
					telefone, endereco, bairro, cidade, equipamento_tipo, mac_addr,
					valor_contratado, source_payload
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
				[
					lote.id,
					order.id,
					order.num_os,
					order.codigo_cliente,
					order.nome_cliente,
					order.telefone,
					order.endereco || order.endereco_resumo,
					order.bairro,
					order.cidade,
					equipamentoTipo,
					order.mac_addr || order.phy_addr,
					valorPorOs,
					JSON.stringify(order.source_payload || order),
				],
			);
		}
		await writeEvent(client, {
			loteId: lote.id,
			tipo: "LOTE_GERADO",
			descricao: `Lote ${codigo} gerado com ${orders.rows.length} OS.`,
			payload: { quantidade: orders.rows.length, cidade, equipamentoTipo },
			user,
		});
		await client.query("commit");
		await audit("mercado_lotes", "create", lote.id, null, lote, user);
		return getLote(lote.id, user);
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function assertCanAccept(client, lote, empresa, config) {
	const habilitacao = await client.query(
		`select * from mercado_empresa_habilitacoes where empresa_id = $1 for update`,
		[empresa.id],
	);
	const habilitada = habilitacao.rows[0];
	if (habilitada && habilitada.enabled === false) {
		const error = new Error("Empresa desabilitada para o Mercado.");
		error.status = 403;
		throw error;
	}
	const suspension = await client.query(
		`select * from mercado_suspensoes
		  where empresa_id = $1 and status = 'ACTIVE'
		    and (end_at is null or end_at > now())
		  limit 1`,
		[empresa.id],
	);
	if (suspension.rows[0]) {
		const error = new Error("Empresa suspensa para novos aceites.");
		error.status = 403;
		throw error;
	}
	const maxLotes = Number(habilitada?.limite_lotes || config.lotes.maxLotesSimultaneosPorEmpresa || 3);
	const maxCidade = Number(habilitada?.limite_por_cidade || config.lotes.maxLotesSimultaneosPorCidade || 1);
	const active = await client.query(
		`select cidade, count(*)::int as total
		   from mercado_lotes
		  where accepted_by_empresa_id = $1 and status = any($2::text[])
		  group by cidade`,
		[empresa.id, OCCUPYING_LOTE_STATUSES],
	);
	const total = active.rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
	if (total >= maxLotes) {
		const error = new Error("Empresa atingiu o limite de lotes ativos.");
		error.status = 409;
		throw error;
	}
	const sameCity = active.rows.find(
		(row) => text(row.cidade).toLowerCase() === text(lote.cidade).toLowerCase(),
	);
	if (sameCity && Number(sameCity.total || 0) >= maxCidade) {
		const error = new Error("Empresa ja possui lote ativo nesta cidade.");
		error.status = 409;
		throw error;
	}
	if (habilitada?.cidades_autorizadas?.length) {
		const allowed = habilitada.cidades_autorizadas.map((item) => text(item).toLowerCase());
		if (!allowed.includes(text(lote.cidade).toLowerCase())) {
			const error = new Error("Empresa nao habilitada para esta cidade.");
			error.status = 403;
			throw error;
		}
	}
}

async function acceptLote(id, user = {}) {
	const empresa = userEmpresa(user);
	if (!empresa.id) {
		const error = new Error("Usuario sem empresa vinculada.");
		error.status = 403;
		throw error;
	}
	const config = await getCurrentConfig();
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("select pg_advisory_xact_lock(hashtext($1))", [`mercado:empresa:${empresa.id}`]);
		const loteResult = await client.query(
			`select * from mercado_lotes where id = $1 for update`,
			[id],
		);
		const lote = loteResult.rows[0];
		if (!lote) {
			const error = new Error("Lote nao encontrado.");
			error.status = 404;
			throw error;
		}
		if (lote.status !== "AVAILABLE") {
			const error = new Error("Lote indisponivel para aceite.");
			error.status = 409;
			throw error;
		}
		await assertCanAccept(client, lote, empresa, config.config);
		const deadline = new Date(Date.now() + Number(config.config.prazos.desistenciaMinutos || 60) * 60000);
		const due = new Date(Date.now() + Number(lote.sla_hours || config.config.prazos.slaHoras || 72) * 3600000);
		const updated = await client.query(
			`update mercado_lotes
			    set status = 'ACCEPTED',
			        accepted_by_empresa_id = $2,
			        accepted_by_empresa_nome = $3,
			        accepted_by_uid = $4,
			        accepted_by_name = $5,
			        accepted_at = now(),
			        withdraw_deadline_at = $6,
			        valor_contratado = valor_potencial,
			        config_snapshot = $7::jsonb
			  where id = $1
			  returning *`,
			[id, empresa.id, empresa.nome || lote.accepted_by_empresa_nome, user.uid || null, userName(user), deadline, JSON.stringify(config.config)],
		);
		await client.query(
			`update mercado_lote_os
			    set status = 'IN_PROGRESS',
			        sla_due_at = $2
			  where lote_id = $1`,
			[id, due],
		);
		await writeEvent(client, {
			loteId: id,
			tipo: "LOTE_ACEITO",
			descricao: `Lote aceito por ${empresa.nome || empresa.id}.`,
			payload: { empresaId: empresa.id, empresaNome: empresa.nome },
			user,
		});
		await client.query("commit");
		await audit("mercado_lotes", "update", id, lote, updated.rows[0], user);
		return getLote(id, user);
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function withdrawLote(id, user = {}) {
	const empresa = userEmpresa(user);
	const client = await db.connect();
	try {
		await client.query("begin");
		const result = await client.query(`select * from mercado_lotes where id = $1 for update`, [id]);
		const lote = result.rows[0];
		if (!lote) {
			const error = new Error("Lote nao encontrado.");
			error.status = 404;
			throw error;
		}
		assertEmpresaScope(user, lote.accepted_by_empresa_id);
		if (lote.status !== "ACCEPTED") {
			const error = new Error("Apenas lotes aceitos podem ser desistidos nesta etapa.");
			error.status = 409;
			throw error;
		}
		if (!canManageMercado(user) && lote.withdraw_deadline_at && new Date(lote.withdraw_deadline_at).getTime() < Date.now()) {
			const error = new Error("Prazo de desistência expirado. Solicite autorização administrativa.");
			error.status = 409;
			throw error;
		}
		const updated = await client.query(
			`update mercado_lotes
			    set status = 'WITHDRAWN',
			        accepted_by_empresa_id = null,
			        accepted_by_empresa_nome = null,
			        accepted_by_uid = null,
			        accepted_by_name = null
			  where id = $1
			  returning *`,
			[id],
		);
		await client.query(`update mercado_lote_os set status = 'PENDING' where lote_id = $1`, [id]);
		await writeEvent(client, {
			loteId: id,
			tipo: "LOTE_DESISTIDO",
			descricao: `Desistencia registrada por ${empresa.nome || userName(user)}.`,
			payload: {},
			user,
		});
		await client.query("commit");
		await audit("mercado_lotes", "update", id, lote, updated.rows[0], user);
		return { item: mapLote(updated.rows[0]) };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function updateOsExecution(osId, payload = {}, user = {}) {
	const currentResult = await db.query(
		`select os.*, l.accepted_by_empresa_id
		   from mercado_lote_os os
		   join mercado_lotes l on l.id = os.lote_id
		  where os.id = $1`,
		[osId],
	);
	const current = currentResult.rows[0];
	if (!current) {
		const error = new Error("OS do Mercado nao encontrada.");
		error.status = 404;
		throw error;
	}
	assertEmpresaScope(user, current.accepted_by_empresa_id);
	const desfecho = nullableText(payload.desfecho);
	const allowed = new Set([
		"RECUPERADA",
		"TENTATIVAS_ESGOTADAS",
		"RECUSA_COMPROVADA",
		"IMPOSSIBILIDADE_OPERACIONAL",
		"DEVOLUCAO_PREVIA_CONFIRMADA",
	]);
	if (desfecho && !allowed.has(desfecho)) {
		const error = new Error("Desfecho invalido.");
		error.status = 400;
		throw error;
	}
	const status = payload.submeter ? "SUBMITTED" : "IN_PROGRESS";
	const result = await db.query(
		`update mercado_lote_os
		    set status = $2,
		        desfecho = coalesce($3, desfecho),
		        submitted_at = case when $2 = 'SUBMITTED' then now() else submitted_at end
		  where id = $1
		  returning *`,
		[osId, status, desfecho],
	);
	await audit("mercado_lote_os", "update", osId, current, result.rows[0], user);
	await maybeReleaseLoteSlot(result.rows[0].lote_id, user);
	return { item: mapOs(result.rows[0]) };
}

async function addTentativa(osId, payload = {}, user = {}) {
	await assertOsAccess(osId, user);
	const config = await getCurrentConfig();
	const valor = Math.max(0, numberValue(payload.valorProtegido, config.config.financeiro.valorTentativa));
	const result = await db.query(
		`insert into mercado_tentativas (
			lote_os_id, canal, resultado, observacao, evidencia_url, tentativa_at,
			valor_protegido, created_by_uid, created_by_name
		) values ($1,$2,$3,$4,$5,coalesce($6::timestamptz, now()),$7,$8,$9)
		returning *`,
		[
			osId,
			text(payload.canal || "telefone"),
			text(payload.resultado || "registrada"),
			nullableText(payload.observacao),
			nullableText(payload.evidenciaUrl || payload.evidencia_url),
			payload.tentativaAt || payload.tentativa_at || null,
			valor,
			user.uid || null,
			userName(user),
		],
	);
	return { item: result.rows[0] };
}

async function addAgendamento(osId, payload = {}, user = {}) {
	await assertOsAccess(osId, user);
	const config = await getCurrentConfig();
	const result = await db.query(
		`insert into mercado_agendamentos (
			lote_os_id, agendado_para, origem, confirmado, evidencia_url,
			desconto_aplicado, valor_desconto, created_by_uid, created_by_name
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		returning *`,
		[
			osId,
			payload.agendadoPara || payload.agendado_para,
			nullableText(payload.origem || "manual"),
			payload.confirmado === true,
			nullableText(payload.evidenciaUrl || payload.evidencia_url),
			payload.descontoAplicado !== false,
			numberValue(payload.valorDesconto, config.config.financeiro.descontoAgendamento),
			user.uid || null,
			userName(user),
		],
	);
	return { item: result.rows[0] };
}

async function addEvidencia(osId, payload = {}, user = {}) {
	await assertOsAccess(osId, user);
	const result = await db.query(
		`insert into mercado_evidencias (
			lote_os_id, tipo, url, descricao, payload, created_by_uid, created_by_name
		) values ($1,$2,$3,$4,$5::jsonb,$6,$7)
		returning *`,
		[
			osId,
			text(payload.tipo || "foto"),
			nullableText(payload.url),
			nullableText(payload.descricao),
			JSON.stringify(payload.payload || {}),
			user.uid || null,
			userName(user),
		],
	);
	return { item: result.rows[0] };
}

async function assertOsAccess(osId, user = {}) {
	const result = await db.query(
		`select os.id, l.accepted_by_empresa_id
		   from mercado_lote_os os
		   join mercado_lotes l on l.id = os.lote_id
		  where os.id = $1`,
		[osId],
	);
	const row = result.rows[0];
	if (!row) {
		const error = new Error("OS do Mercado nao encontrada.");
		error.status = 404;
		throw error;
	}
	assertEmpresaScope(user, row.accepted_by_empresa_id);
}

async function maybeReleaseLoteSlot(loteId, user = {}) {
	const pending = await db.query(
		`select count(*)::int as total
		   from mercado_lote_os
		  where lote_id = $1 and status not in ('SUBMITTED','APPROVED','REJECTED')`,
		[loteId],
	);
	if (Number(pending.rows[0]?.total || 0) > 0) return;
	await db.query(
		`update mercado_lotes
		    set status = 'SUBMITTED', submitted_at = coalesce(submitted_at, now())
		  where id = $1 and status in ('ACCEPTED','IN_EXECUTION')`,
		[loteId],
	);
	auditLog.recordAuditLog({
		module: "mercado",
		entity: "mercado_lotes",
		action: "update",
		recordId: loteId,
		userId: user?.uid,
		userName: userName(user),
		afterData: { status: "SUBMITTED" },
		changedFields: ["status"],
	});
}

async function listBackoffice(query = {}) {
	const status = text(query.status || "SUBMITTED").toUpperCase();
	const result = await db.query(
		`select os.*, l.codigo as lote_codigo, l.accepted_by_empresa_nome
		   from mercado_lote_os os
		   join mercado_lotes l on l.id = os.lote_id
		  where os.status = $1
		  order by os.submitted_at nulls last, os.created_at
		  limit 200`,
		[status],
	);
	return { items: result.rows.map((row) => ({ ...mapOs(row), loteCodigo: row.lote_codigo, empresaNome: row.accepted_by_empresa_nome })) };
}

async function approveOs(osId, payload = {}, user = {}) {
	const status = payload.status || (payload.approved === false ? "REJECTED" : "APPROVED");
	if (!["APPROVED", "REJECTED", "CORRECTION_REQUESTED", "EXCEPTION_CLOSED"].includes(status)) {
		const error = new Error("Status de aprovacao invalido.");
		error.status = 400;
		throw error;
	}
	const client = await db.connect();
	try {
		await client.query("begin");
		const current = await client.query(`select * from mercado_lote_os where id = $1 for update`, [osId]);
		const row = current.rows[0];
		if (!row) {
			const error = new Error("OS do Mercado nao encontrada.");
			error.status = 404;
			throw error;
		}
		const osStatus = status === "APPROVED" || status === "EXCEPTION_CLOSED" ? "APPROVED" : status === "REJECTED" ? "REJECTED" : "CORRECTION_REQUESTED";
		const valor = status === "APPROVED" || status === "EXCEPTION_CLOSED"
			? calculateApprovedValue(row, payload)
			: null;
		const updated = await client.query(
			`update mercado_lote_os
			    set status = $2,
			        valor_aprovado = $3,
			        approved_at = case when $2 = 'APPROVED' then now() else approved_at end
			  where id = $1
			  returning *`,
			[osId, osStatus, valor],
		);
		await client.query(
			`insert into mercado_aprovacoes (
				lote_id, lote_os_id, status, justificativa, payload, created_by_uid, created_by_name
			) values ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
			[
				row.lote_id,
				osId,
				status,
				nullableText(payload.justificativa),
				JSON.stringify(payload),
				user.uid || null,
				userName(user),
			],
		);
		await writeEvent(client, {
			loteId: row.lote_id,
			loteOsId: osId,
			tipo: `OS_${status}`,
			descricao: nullableText(payload.justificativa) || `BackOffice registrou ${status}.`,
			payload,
			user,
		});
		await client.query("commit");
		await maybeApproveLote(row.lote_id, user);
		return { item: mapOs(updated.rows[0]) };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

function calculateApprovedValue(row = {}, payload = {}) {
	if (payload.valorAprovado !== undefined || payload.valor_aprovado !== undefined) {
		return Math.max(0, numberValue(payload.valorAprovado ?? payload.valor_aprovado, 0));
	}
	return numberValue(row.valor_contratado, 0);
}

async function maybeApproveLote(loteId, user = {}) {
	const pending = await db.query(
		`select count(*)::int as total
		   from mercado_lote_os
		  where lote_id = $1 and status not in ('APPROVED','REJECTED')`,
		[loteId],
	);
	if (Number(pending.rows[0]?.total || 0) > 0) return;
	await db.query(
		`update mercado_lotes
		    set status = 'APPROVED', approved_at = coalesce(approved_at, now())
		  where id = $1 and status in ('SUBMITTED','IN_EXECUTION','ACCEPTED')`,
		[loteId],
	);
	await audit("mercado_lotes", "update", loteId, null, { status: "APPROVED" }, user);
}

async function dashboard(_query = {}, user = {}) {
	const empresa = userEmpresa(user);
	const scoped = !canManageMercado(user) && empresa.id;
	const params = [];
	const scopeSql = scoped ? "where accepted_by_empresa_id = $1" : "";
	if (scoped) params.push(empresa.id);
	const lots = await db.query(
		`select status, count(*)::int as total, coalesce(sum(valor_contratado), sum(valor_potencial), 0)::numeric as valor
		   from mercado_lotes
		  ${scopeSql}
		  group by status`,
		params,
	);
	const os = await db.query(
		`select os.desfecho, os.status, count(*)::int as total
		   from mercado_lote_os os
		   join mercado_lotes l on l.id = os.lote_id
		  ${scoped ? "where l.accepted_by_empresa_id = $1" : ""}
		  group by os.desfecho, os.status`,
		params,
	);
	const empresas = await db.query(
		`select accepted_by_empresa_id, accepted_by_empresa_nome, count(*)::int as lotes
		   from mercado_lotes
		  where accepted_by_empresa_id is not null
		  group by accepted_by_empresa_id, accepted_by_empresa_nome
		  order by lotes desc
		  limit 10`,
	);
	return {
		lotes: lots.rows,
		os: os.rows,
		rankingEmpresas: empresas.rows,
		config: (await getCurrentConfig()).config,
	};
}

async function listFinanceiro(query = {}, user = {}) {
	const competencia = text(query.competencia) || new Date().toISOString().slice(0, 7);
	const params = [competencia];
	let where = "where competencia = $1";
	if (!canManageMercado(user)) {
		const empresa = userEmpresa(user);
		params.push(empresa.id || "__no_company__");
		where += ` and empresa_id = $${params.length}`;
	}
	const result = await db.query(
		`select * from mercado_financeiro_apuracoes ${where} order by empresa_nome`,
		params,
	);
	return { items: result.rows };
}

async function gerarApuracao(payload = {}, user = {}) {
	const competencia = text(payload.competencia) || new Date().toISOString().slice(0, 7);
	const empresaId = text(payload.empresaId || payload.empresa_id || userEmpresa(user).id);
	if (!empresaId) {
		const error = new Error("Empresa obrigatoria para apuracao.");
		error.status = 400;
		throw error;
	}
	assertEmpresaScope(user, empresaId);
	const values = await db.query(
		`select l.accepted_by_empresa_id as empresa_id,
		        coalesce(l.accepted_by_empresa_nome, l.accepted_by_empresa_id) as empresa_nome,
		        coalesce(sum(os.valor_contratado),0)::numeric as contratado,
		        coalesce(sum(os.valor_aprovado),0)::numeric as aprovado,
		        count(*)::int as total_os
		   from mercado_lotes l
		   join mercado_lote_os os on os.lote_id = l.id
		  where l.accepted_by_empresa_id = $1
		    and l.status = 'APPROVED'
		    and to_char(coalesce(l.approved_at, now()), 'YYYY-MM') = $2
		  group by l.accepted_by_empresa_id, l.accepted_by_empresa_nome`,
		[empresaId, competencia],
	);
	const row = values.rows[0] || { empresa_id: empresaId, empresa_nome: empresaId, contratado: 0, aprovado: 0, total_os: 0 };
	const result = await db.query(
		`insert into mercado_financeiro_apuracoes (
			competencia, empresa_id, empresa_nome, status, total_contratado,
			total_aprovado, total_liberado, summary, created_by_uid, created_by_name
		) values ($1,$2,$3,'READY',$4,$5,$5,$6::jsonb,$7,$8)
		on conflict (competencia, empresa_id) do update set
			status = 'READY',
			empresa_nome = excluded.empresa_nome,
			total_contratado = excluded.total_contratado,
			total_aprovado = excluded.total_aprovado,
			total_liberado = excluded.total_liberado,
			summary = excluded.summary
		returning *`,
		[
			competencia,
			empresaId,
			row.empresa_nome,
			row.contratado,
			row.aprovado,
			JSON.stringify({ totalOs: row.total_os }),
			user.uid || null,
			userName(user),
		],
	);
	return { item: result.rows[0] };
}

async function historico(query = {}, user = {}) {
	const limit = positiveInteger(query.limit, 100, 500);
	const params = [];
	let where = "";
	if (!canManageMercado(user)) {
		const empresa = userEmpresa(user);
		params.push(empresa.id || "__no_company__");
		where = `where l.accepted_by_empresa_id = $1`;
	}
	const result = await db.query(
		`select e.*
		   from mercado_lote_eventos e
		   left join mercado_lotes l on l.id = e.lote_id
		  ${where}
		  order by e.created_at desc
		  limit $${params.length + 1}`,
		[...params, limit],
	);
	return { items: result.rows };
}

module.exports = {
	BACKOFFICE_MANAGE_PERMISSIONS,
	BACKOFFICE_VIEW_PERMISSIONS,
	CONFIG_MANAGE_PERMISSIONS,
	CONFIG_VIEW_PERMISSIONS,
	EXECUCAO_MANAGE_PERMISSIONS,
	EXECUCAO_VIEW_PERMISSIONS,
	FINANCEIRO_MANAGE_PERMISSIONS,
	FINANCEIRO_VIEW_PERMISSIONS,
	LOTES_ACCEPT_PERMISSIONS,
	LOTES_MANAGE_PERMISSIONS,
	LOTES_VIEW_PERMISSIONS,
	VIEW_PERMISSIONS,
	acceptLote,
	addAgendamento,
	addEvidencia,
	addTentativa,
	approveOs,
	createManualLote,
	dashboard,
	generateLots,
	gerarApuracao,
	getCurrentConfig,
	getLote,
	historico,
	listBackoffice,
	listEmpresas,
	listFinanceiro,
	listHabilitacoes,
	listLotes,
	saveConfig,
	saveHabilitacao,
	simulatePricing,
	updateOsExecution,
	withdrawLote,
};
