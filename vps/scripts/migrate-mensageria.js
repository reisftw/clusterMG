const crypto = require("node:crypto");
const { Pool } = require("pg");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const writeJson = args.has("--json");

const COLLECTIONS = [
	"mensageria_fila",
	"mensageria_historico",
	"mensageria_callbacks",
	"mensageria_agendamento_conversas",
	"mensageria_templates",
	"mensageria_config",
];

const TARGET_TABLES = {
	mensageria_fila: "mensageria_fila",
	mensageria_historico: "mensageria_historico",
	mensageria_callbacks: "mensageria_callbacks",
	mensageria_agendamento_conversas: "mensageria_agendamento_conversas",
	mensageria_templates: "mensageria_templates",
	mensageria_config: "mensageria_config",
};

const CLOSED_QUEUE_STATUSES = new Set([
	"enviado",
	"agendado",
	"cancelado",
	"concluido",
	"concluído",
	"descartado",
	"ignorado",
]);

function buildPoolConfig() {
	if (process.env.DATABASE_URL) {
		return {
			connectionString: process.env.DATABASE_URL,
			ssl:
				process.env.PGSSLMODE === "require"
					? { rejectUnauthorized: false }
					: false,
		};
	}

	return {
		host: process.env.PGHOST || "127.0.0.1",
		port: Number(process.env.PGPORT || 5432),
		user: process.env.PGUSER || "retorninho",
		password: process.env.PGPASSWORD,
		database: process.env.PGDATABASE || "retiradas",
		ssl:
			process.env.PGSSLMODE === "require"
				? { rejectUnauthorized: false }
				: false,
	};
}

function text(value) {
	return String(value ?? "").trim();
}

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function bool(value) {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "1", "sim", "yes"].includes(normalized)) return true;
		if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
	}
	return null;
}

function intValue(value, fallback = 0) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return timestampValue(value.value);
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateValue(value) {
	const timestamp = timestampValue(value);
	return timestamp ? timestamp.slice(0, 10) : null;
}

function digits(value) {
	const normalized = text(value).replace(/\D/g, "");
	return normalized || null;
}

function stableId(row) {
	const data = row.data || {};
	return (
		nullableText(data.id) ||
		nullableText(row.document_id) ||
		crypto.createHash("sha256").update(String(row.path)).digest("hex").slice(0, 32)
	);
}

function normalizeBase(row) {
	const data = row.data || {};
	const createdAt =
		timestampValue(data.criadoEm) ||
		timestampValue(data.criado_em) ||
		timestampValue(data.createdAt) ||
		timestampValue(row.imported_at) ||
		new Date().toISOString();
	const updatedAt =
		timestampValue(data.atualizadoEm) ||
		timestampValue(data.atualizado_em) ||
		timestampValue(data.updatedAt) ||
		timestampValue(row.updated_at) ||
		createdAt;

	return {
		id: stableId(row),
		legacyPath: row.path,
		legacyDocumentId: row.document_id,
		createdAt,
		updatedAt,
		sourcePayload: data,
	};
}

function normalizeTemplate(row) {
	const data = row.data || {};
	return {
		...normalizeBase(row),
		nome: nullableText(data.nome || data.name),
		conteudo: nullableText(data.conteudo || data.content || data.mensagem),
		situacao: nullableText(data.situacao || data.status),
		requiredCentralButton: bool(data.requiredCentralButton) === true,
	};
}

function normalizeQueue(row) {
	const data = row.data || {};
	const base = normalizeBase(row);
	const telefone = nullableText(data.telefone || data.phone);
	return {
		...base,
		codigoCliente: nullableText(data.codigo_cliente || data.codigoCliente),
		cliente: nullableText(data.cliente),
		telefone,
		telefoneDigits: nullableText(data.telefone_digits) || digits(telefone),
		os: nullableText(data.os),
		contrato: nullableText(data.contrato),
		cidade: nullableText(data.cidade),
		regional: nullableText(data.regional),
		endereco: nullableText(data.endereco),
		status: nullableText(data.status),
		templateId: nullableText(data.templateId || data.template_id),
		origem: nullableText(data.origem),
		origemTipo: nullableText(data.origemTipo || data.origem_tipo),
		statusOs: nullableText(data.statusOS || data.statusOs || data.status_os),
		tentativas: intValue(data.tentativas, 0),
		ultimoErro: nullableText(data.ultimoErro || data.ultimo_erro),
		ultimoEnvioEm: timestampValue(data.ultimoEnvioEm || data.ultimo_envio_em),
		prioridadeEm: timestampValue(data.prioridadeEm || data.prioridade_em),
		envioLockId: nullableText(data.envioLockId || data.envio_lock_id),
		envioLockEm: timestampValue(data.envioLockEm || data.envio_lock_em),
		criadoPor: nullableText(data.criadoPor || data.criado_por),
		criadoEm: timestampValue(data.criadoEm || data.criado_em) || base.createdAt,
		atualizadoEm:
			timestampValue(data.atualizadoEm || data.atualizado_em) || base.updatedAt,
	};
}

function normalizeHistory(row) {
	const data = row.data || {};
	const base = normalizeBase(row);
	return {
		...base,
		filaId: nullableText(data.filaId || data.fila_id),
		codigoCliente: nullableText(data.codigo_cliente || data.codigoCliente),
		cliente: nullableText(data.cliente),
		telefone: nullableText(data.telefone),
		cidade: nullableText(data.cidade),
		os: nullableText(data.os),
		direction: nullableText(data.direction || data.direcao),
		mensagem: nullableText(data.mensagem || data.message),
		provider: nullableText(data.provider || data.origem),
		providerStatus: nullableText(
			data.provider_status ||
				data.providerStatus ||
				data.evolutionResponse?.status ||
				data.evolutionResponse?.message,
		),
		status: nullableText(data.status),
		erro: nullableText(data.erro || data.error),
		payload: data.payload || data.evolutionResponse || null,
		criadoEm: timestampValue(data.criadoEm || data.criado_em) || base.createdAt,
	};
}

function normalizeCallback(row) {
	const data = row.data || {};
	const base = normalizeBase(row);
	return {
		...base,
		agendamentoId: nullableText(data.agendamento_id || data.agendamentoId),
		codigoCliente: nullableText(data.codigo_cliente || data.codigoCliente),
		cliente: nullableText(data.cliente),
		telefone: nullableText(data.telefone),
		os: nullableText(data.os),
		mensagem: nullableText(data.mensagem || data.message),
		motivo: nullableText(data.motivo || data.status),
		agendado: bool(data.agendado),
		respostaAutomatica: nullableText(
			data.resposta_automatica || data.respostaAutomatica,
		),
		payload: data.payload || data.schedule || null,
		recebidoEm:
			timestampValue(data.recebido_em || data.recebidoEm) || base.createdAt,
		criadoEm: timestampValue(data.criado_em || data.criadoEm) || base.createdAt,
	};
}

function normalizeConversation(row) {
	const data = row.data || {};
	const item = data.item || {};
	const schedule = data.schedule || {};
	const base = normalizeBase(row);
	const telefone = nullableText(data.telefone || item.telefone);
	return {
		...base,
		telefone,
		telefoneDigits: digits(telefone),
		codigoCliente: nullableText(item.codigo_cliente || item.codigoCliente),
		cliente: nullableText(item.cliente),
		os: nullableText(item.os),
		contrato: nullableText(item.contrato),
		cidade: nullableText(item.cidade),
		regional: nullableText(item.regional),
		stage: nullableText(data.stage),
		agendamentoId: nullableText(data.agendamentoId || data.agendamento_id),
		selectedDate: dateValue(data.selectedDate),
		selectedTime: nullableText(data.selectedTime),
		startedAt: timestampValue(data.startedAt),
		completedAt: timestampValue(data.completedAt),
		lastMessageAt: timestampValue(data.lastMessageAt),
		atualizadoEm: timestampValue(data.atualizado_em || data.atualizadoEm),
		itemPayload: item,
		schedulePayload: schedule,
		dateOptions: data.dateOptions || null,
	};
}

function normalizeConfig(row) {
	const data = row.data || {};
	return {
		...normalizeBase(row),
		id: "global",
		data,
		updatedAt:
			timestampValue(data.updatedAt || data.atualizado_em) ||
			timestampValue(row.updated_at) ||
			new Date().toISOString(),
	};
}

const NORMALIZERS = {
	mensageria_fila: normalizeQueue,
	mensageria_historico: normalizeHistory,
	mensageria_callbacks: normalizeCallback,
	mensageria_agendamento_conversas: normalizeConversation,
	mensageria_templates: normalizeTemplate,
	mensageria_config: normalizeConfig,
};

async function tableExists(client, tableName) {
	const result = await client.query("select to_regclass($1) as table_name", [
		`public.${tableName}`,
	]);
	return Boolean(result.rows[0]?.table_name);
}

async function fetchDocuments(client, collectionPath) {
	const result = await client.query(
		`select path, collection_path, document_id, data, imported_at, updated_at
		   from app_documents
		  where collection_path = $1
		  order by path`,
		[collectionPath],
	);
	return result.rows;
}

async function fetchSourceCounts(client) {
	const result = await client.query(
		`select
		     collection_path,
		     count(*)::int as total,
		     count(distinct path)::int as distinct_legacy_paths
		   from app_documents
		  where collection_path = any($1)
		  group by collection_path
		  order by collection_path`,
		[COLLECTIONS],
	);
	return Object.fromEntries(
		result.rows.map((row) => [
			row.collection_path,
			{
				rows: row.total,
				distinctLegacyPaths: row.distinct_legacy_paths,
			},
		]),
	);
}

async function fetchTargetStats(client) {
	const stats = {};
	for (const collection of COLLECTIONS) {
		const table = TARGET_TABLES[collection];
		if (!(await tableExists(client, table))) {
			stats[collection] = { exists: false, rows: null, distinctLegacyPaths: null };
			continue;
		}
		const result = await client.query(
			`select count(*)::int as rows,
			        count(distinct legacy_path)::int as distinct_legacy_paths
			   from ${table}`,
		);
		stats[collection] = {
			exists: true,
			rows: result.rows[0]?.rows || 0,
			distinctLegacyPaths: result.rows[0]?.distinct_legacy_paths || 0,
		};
	}
	return stats;
}

function getStatus(collection, item) {
	if (collection === "mensageria_callbacks") return item.motivo || "sem_status";
	if (collection === "mensageria_agendamento_conversas") {
		return item.stage || "sem_status";
	}
	return item.status || item.situacao || "sem_status";
}

function buildSamplesByStatus(normalizedByCollection) {
	const samples = {};
	for (const [collection, rows] of Object.entries(normalizedByCollection)) {
		samples[collection] = {};
		for (const row of rows) {
			const status = getStatus(collection, row);
			if (!samples[collection][status]) samples[collection][status] = [];
			if (samples[collection][status].length >= 20) continue;
			samples[collection][status].push({
				id: row.id,
				legacy_path: row.legacyPath,
				codigo_cliente: row.codigoCliente || null,
				cliente: row.cliente || row.nome || null,
				telefone_digits: row.telefoneDigits || null,
				os: row.os || null,
				template_id: row.templateId || null,
				criado_em: row.criadoEm || row.createdAt || null,
			});
		}
	}
	return samples;
}

function buildOpenQueueConstraintReport(queueRows) {
	const groups = new Map();
	for (const row of queueRows) {
		const status = text(row.status).toLowerCase();
		if (!row.telefoneDigits || !row.os || CLOSED_QUEUE_STATUSES.has(status)) {
			continue;
		}
		const key = [
			row.telefoneDigits,
			row.os,
			row.templateId || "",
			status,
		].join("|");
		const current = groups.get(key) || [];
		current.push({
			id: row.id,
			legacy_path: row.legacyPath,
			cliente: row.cliente,
			status: row.status,
			telefone_digits: row.telefoneDigits,
			os: row.os,
			template_id: row.templateId,
			criado_em: row.criadoEm,
		});
		groups.set(key, current);
	}

	const violatingGroups = [...groups.entries()]
		.filter(([, rows]) => rows.length > 1)
		.map(([key, rows]) => ({ key, total: rows.length, rows }));

	return {
		groups: violatingGroups.length,
		rows: violatingGroups.reduce((total, group) => total + group.total, 0),
		extraRowsToResolve: violatingGroups.reduce(
			(total, group) => total + group.total - 1,
			0,
		),
		sample: violatingGroups.slice(0, 20),
	};
}

function buildMissingReferenceReport(normalizedByCollection) {
	const templateIds = new Set(
		(normalizedByCollection.mensageria_templates || [])
			.map((template) => template.id)
			.filter(Boolean),
	);
	const queueIds = new Set(
		(normalizedByCollection.mensageria_fila || [])
			.map((queue) => queue.id)
			.filter(Boolean),
	);
	const queueMissingTemplates = (normalizedByCollection.mensageria_fila || [])
		.filter((queue) => queue.templateId && !templateIds.has(queue.templateId))
		.map((queue) => ({
			id: queue.id,
			legacy_path: queue.legacyPath,
			template_id: queue.templateId,
			status: queue.status,
		}));
	const historyMissingQueue = (normalizedByCollection.mensageria_historico || [])
		.filter((history) => history.filaId && !queueIds.has(history.filaId))
		.map((history) => ({
			id: history.id,
			legacy_path: history.legacyPath,
			fila_id: history.filaId,
			status: history.status,
		}));

	return {
		queueRowsWithTemplateIdNotInTemplates: queueMissingTemplates.length,
		queueMissingTemplatesSample: queueMissingTemplates.slice(0, 20),
		historyRowsWithFilaIdNotInQueue: historyMissingQueue.length,
		historyMissingQueueSample: historyMissingQueue.slice(0, 20),
	};
}

async function loadNormalized(client) {
	const normalizedByCollection = {};
	for (const collection of COLLECTIONS) {
		const documents = await fetchDocuments(client, collection);
		normalizedByCollection[collection] = documents.map(NORMALIZERS[collection]);
	}
	return normalizedByCollection;
}

async function buildReport(client, normalizedByCollection) {
	const normalizedCounts = {};
	const statusCounts = {};
	for (const [collection, rows] of Object.entries(normalizedByCollection)) {
		normalizedCounts[collection] = rows.length;
		statusCounts[collection] = rows.reduce((acc, row) => {
			const status = getStatus(collection, row);
			acc[status] = (acc[status] || 0) + 1;
			return acc;
		}, {});
	}

	return {
		mode: apply ? "apply" : "dry-run",
		sourceCounts: await fetchSourceCounts(client),
		targetStats: await fetchTargetStats(client),
		normalizedCounts,
		statusCounts,
		possibleOpenQueueConstraintViolations: buildOpenQueueConstraintReport(
			normalizedByCollection.mensageria_fila || [],
		),
		referenceRisks: buildMissingReferenceReport(normalizedByCollection),
		samplesByStatus: buildSamplesByStatus(normalizedByCollection),
	};
}

async function upsertRows(client, collection, rows, references = {}) {
	if (collection === "mensageria_templates") {
		for (const row of rows) {
			await client.query(
				`insert into mensageria_templates
				 (id, nome, conteudo, situacao, required_central_button, legacy_path,
				  legacy_document_id, created_at, updated_at, source_payload)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
				 on conflict (id) do update set
				   nome = excluded.nome,
				   conteudo = excluded.conteudo,
				   situacao = excluded.situacao,
				   required_central_button = excluded.required_central_button,
				   legacy_path = excluded.legacy_path,
				   legacy_document_id = excluded.legacy_document_id,
				   source_payload = excluded.source_payload`,
				[
					row.id,
					row.nome,
					row.conteudo,
					row.situacao,
					row.requiredCentralButton,
					row.legacyPath,
					row.legacyDocumentId,
					row.createdAt,
					row.updatedAt,
					JSON.stringify(row.sourcePayload || {}),
				],
			);
		}
		return;
	}

	if (collection === "mensageria_config") {
		for (const row of rows) {
			await client.query(
				`insert into mensageria_config
				 (id, data, updated_at, legacy_path, legacy_document_id, created_at, source_payload)
				 values ($1,$2::jsonb,$3,$4,$5,$6,$7::jsonb)
				 on conflict (id) do update set
				   data = excluded.data,
				   updated_at = excluded.updated_at,
				   legacy_path = excluded.legacy_path,
				   legacy_document_id = excluded.legacy_document_id,
				   source_payload = excluded.source_payload`,
				[
					row.id,
					JSON.stringify(row.data || {}),
					row.updatedAt,
					row.legacyPath,
					row.legacyDocumentId,
					row.createdAt,
					JSON.stringify(row.sourcePayload || {}),
				],
			);
		}
		return;
	}

	if (collection === "mensageria_fila") {
		for (const row of rows) {
			const templateId =
				row.templateId && references.templateIds?.has(row.templateId)
					? row.templateId
					: null;
			await client.query(
				`insert into mensageria_fila
				 (id, codigo_cliente, cliente, telefone, telefone_digits, os, contrato,
				  cidade, regional, endereco, status, template_id, origem, origem_tipo,
				  status_os, tentativas, ultimo_erro, ultimo_envio_em, prioridade_em,
				  envio_lock_id, envio_lock_em, criado_por, criado_em, atualizado_em,
				  legacy_path, legacy_document_id, created_at, updated_at, source_payload)
				 values
				 ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
				  $20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb)
				 on conflict (id) do update set
				   codigo_cliente = excluded.codigo_cliente,
				   cliente = excluded.cliente,
				   telefone = excluded.telefone,
				   telefone_digits = excluded.telefone_digits,
				   os = excluded.os,
				   contrato = excluded.contrato,
				   cidade = excluded.cidade,
				   regional = excluded.regional,
				   endereco = excluded.endereco,
				   status = excluded.status,
				   template_id = excluded.template_id,
				   origem = excluded.origem,
				   origem_tipo = excluded.origem_tipo,
				   status_os = excluded.status_os,
				   tentativas = excluded.tentativas,
				   ultimo_erro = excluded.ultimo_erro,
				   ultimo_envio_em = excluded.ultimo_envio_em,
				   prioridade_em = excluded.prioridade_em,
				   envio_lock_id = excluded.envio_lock_id,
				   envio_lock_em = excluded.envio_lock_em,
				   criado_por = excluded.criado_por,
				   criado_em = excluded.criado_em,
				   atualizado_em = excluded.atualizado_em,
				   legacy_path = excluded.legacy_path,
				   legacy_document_id = excluded.legacy_document_id,
				   source_payload = excluded.source_payload`,
				[
					row.id,
					row.codigoCliente,
					row.cliente,
					row.telefone,
					row.telefoneDigits,
					row.os,
					row.contrato,
					row.cidade,
					row.regional,
					row.endereco,
					row.status,
					templateId,
					row.origem,
					row.origemTipo,
					row.statusOs,
					row.tentativas,
					row.ultimoErro,
					row.ultimoEnvioEm,
					row.prioridadeEm,
					row.envioLockId,
					row.envioLockEm,
					row.criadoPor,
					row.criadoEm,
					row.atualizadoEm,
					row.legacyPath,
					row.legacyDocumentId,
					row.createdAt,
					row.updatedAt,
					JSON.stringify(row.sourcePayload || {}),
				],
			);
		}
		return;
	}

	if (collection === "mensageria_historico") {
		for (const row of rows) {
			const filaId =
				row.filaId && references.queueIds?.has(row.filaId) ? row.filaId : null;
			await client.query(
				`insert into mensageria_historico
				 (id, fila_id, codigo_cliente, cliente, telefone, cidade, os, direction,
				  mensagem, provider, provider_status, status, erro, payload, criado_em,
				  legacy_path, legacy_document_id, created_at, updated_at, source_payload)
				 values
				 ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20::jsonb)
				 on conflict (id) do update set
				   fila_id = excluded.fila_id,
				   codigo_cliente = excluded.codigo_cliente,
				   cliente = excluded.cliente,
				   telefone = excluded.telefone,
				   cidade = excluded.cidade,
				   os = excluded.os,
				   direction = excluded.direction,
				   mensagem = excluded.mensagem,
				   provider = excluded.provider,
				   provider_status = excluded.provider_status,
				   status = excluded.status,
				   erro = excluded.erro,
				   payload = excluded.payload,
				   criado_em = excluded.criado_em,
				   legacy_path = excluded.legacy_path,
				   legacy_document_id = excluded.legacy_document_id,
				   source_payload = excluded.source_payload`,
				[
					row.id,
					filaId,
					row.codigoCliente,
					row.cliente,
					row.telefone,
					row.cidade,
					row.os,
					row.direction,
					row.mensagem,
					row.provider,
					row.providerStatus,
					row.status,
					row.erro,
					JSON.stringify(row.payload || null),
					row.criadoEm,
					row.legacyPath,
					row.legacyDocumentId,
					row.createdAt,
					row.updatedAt,
					JSON.stringify(row.sourcePayload || {}),
				],
			);
		}
		return;
	}

	if (collection === "mensageria_callbacks") {
		for (const row of rows) {
			await client.query(
				`insert into mensageria_callbacks
				 (id, agendamento_id, codigo_cliente, cliente, telefone, os, mensagem,
				  motivo, agendado, resposta_automatica, payload, recebido_em, criado_em,
				  legacy_path, legacy_document_id, created_at, updated_at, source_payload)
				 values
				 ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18::jsonb)
				 on conflict (id) do update set
				   agendamento_id = excluded.agendamento_id,
				   codigo_cliente = excluded.codigo_cliente,
				   cliente = excluded.cliente,
				   telefone = excluded.telefone,
				   os = excluded.os,
				   mensagem = excluded.mensagem,
				   motivo = excluded.motivo,
				   agendado = excluded.agendado,
				   resposta_automatica = excluded.resposta_automatica,
				   payload = excluded.payload,
				   recebido_em = excluded.recebido_em,
				   criado_em = excluded.criado_em,
				   legacy_path = excluded.legacy_path,
				   legacy_document_id = excluded.legacy_document_id,
				   source_payload = excluded.source_payload`,
				[
					row.id,
					row.agendamentoId,
					row.codigoCliente,
					row.cliente,
					row.telefone,
					row.os,
					row.mensagem,
					row.motivo,
					row.agendado,
					row.respostaAutomatica,
					JSON.stringify(row.payload || null),
					row.recebidoEm,
					row.criadoEm,
					row.legacyPath,
					row.legacyDocumentId,
					row.createdAt,
					row.updatedAt,
					JSON.stringify(row.sourcePayload || {}),
				],
			);
		}
		return;
	}

	if (collection === "mensageria_agendamento_conversas") {
		for (const row of rows) {
			await client.query(
				`insert into mensageria_agendamento_conversas
				 (id, telefone, telefone_digits, codigo_cliente, cliente, os, contrato,
				  cidade, regional, stage, agendamento_id, selected_date, selected_time,
				  started_at, completed_at, last_message_at, atualizado_em, item_payload,
				  schedule_payload, date_options, legacy_path, legacy_document_id,
				  created_at, updated_at, source_payload)
				 values
				 ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,
				  $19::jsonb,$20::jsonb,$21,$22,$23,$24,$25::jsonb)
				 on conflict (id) do update set
				   telefone = excluded.telefone,
				   telefone_digits = excluded.telefone_digits,
				   codigo_cliente = excluded.codigo_cliente,
				   cliente = excluded.cliente,
				   os = excluded.os,
				   contrato = excluded.contrato,
				   cidade = excluded.cidade,
				   regional = excluded.regional,
				   stage = excluded.stage,
				   agendamento_id = excluded.agendamento_id,
				   selected_date = excluded.selected_date,
				   selected_time = excluded.selected_time,
				   started_at = excluded.started_at,
				   completed_at = excluded.completed_at,
				   last_message_at = excluded.last_message_at,
				   atualizado_em = excluded.atualizado_em,
				   item_payload = excluded.item_payload,
				   schedule_payload = excluded.schedule_payload,
				   date_options = excluded.date_options,
				   legacy_path = excluded.legacy_path,
				   legacy_document_id = excluded.legacy_document_id,
				   source_payload = excluded.source_payload`,
				[
					row.id,
					row.telefone,
					row.telefoneDigits,
					row.codigoCliente,
					row.cliente,
					row.os,
					row.contrato,
					row.cidade,
					row.regional,
					row.stage,
					row.agendamentoId,
					row.selectedDate,
					row.selectedTime,
					row.startedAt,
					row.completedAt,
					row.lastMessageAt,
					row.atualizadoEm,
					JSON.stringify(row.itemPayload || null),
					JSON.stringify(row.schedulePayload || null),
					JSON.stringify(row.dateOptions || null),
					row.legacyPath,
					row.legacyDocumentId,
					row.createdAt,
					row.updatedAt,
					JSON.stringify(row.sourcePayload || {}),
				],
			);
		}
	}
}

async function applyMigration(client, normalizedByCollection) {
	const templateIds = new Set(
		(normalizedByCollection.mensageria_templates || [])
			.map((template) => template.id)
			.filter(Boolean),
	);
	const queueIds = new Set(
		(normalizedByCollection.mensageria_fila || [])
			.map((queue) => queue.id)
			.filter(Boolean),
	);
	const references = { templateIds, queueIds };

	await client.query("begin");
	try {
		await upsertRows(
			client,
			"mensageria_templates",
			normalizedByCollection.mensageria_templates || [],
			references,
		);
		await upsertRows(
			client,
			"mensageria_fila",
			normalizedByCollection.mensageria_fila || [],
			references,
		);
		await upsertRows(
			client,
			"mensageria_historico",
			normalizedByCollection.mensageria_historico || [],
			references,
		);
		await upsertRows(
			client,
			"mensageria_callbacks",
			normalizedByCollection.mensageria_callbacks || [],
			references,
		);
		await upsertRows(
			client,
			"mensageria_agendamento_conversas",
			normalizedByCollection.mensageria_agendamento_conversas || [],
			references,
		);
		await upsertRows(
			client,
			"mensageria_config",
			normalizedByCollection.mensageria_config || [],
			references,
		);
		await client.query("commit");
		return {
			applied: true,
			insertedOrUpdated: Object.fromEntries(
				Object.entries(normalizedByCollection).map(([collection, rows]) => [
					collection,
					rows.length,
				]),
			),
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	}
}

async function main() {
	const pool = new Pool(buildPoolConfig());
	try {
		const client = await pool.connect();
		try {
			const normalizedByCollection = await loadNormalized(client);
			const report = await buildReport(client, normalizedByCollection);
			if (apply) {
				report.applyResult = await applyMigration(client, normalizedByCollection);
			}

			const output = JSON.stringify(report, null, 2);
			if (writeJson) {
				process.stdout.write(`${output}\n`);
				return;
			}
			console.log("Migração Mensageria");
			console.log(output);
		} finally {
			client.release();
		}
	} finally {
		await pool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
