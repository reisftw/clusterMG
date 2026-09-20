const crypto = require("node:crypto");
const db = require("./db");
const normalizedDualWrite = require("./normalizedDualWrite");

const COLLECTIONS = Object.freeze({
	config: "mensageria_config",
	templates: "mensageria_templates",
	fila: "mensageria_fila",
	historico: "mensageria_historico",
	callbacks: "mensageria_callbacks",
	conversas: "mensageria_agendamento_conversas",
});

const MESSAGING_COLLECTIONS = new Set(Object.values(COLLECTIONS));

function isMessagingCollection(collectionPath) {
	return MESSAGING_COLLECTIONS.has(String(collectionPath || "").trim());
}

function collectionFromPath(documentPath) {
	const parts = String(documentPath || "")
		.split("/")
		.filter(Boolean);
	return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function documentIdFromPath(documentPath) {
	const parts = String(documentPath || "")
		.split("/")
		.filter(Boolean);
	return parts.at(-1) || "";
}

function randomDocumentId(prefix = "msg") {
	return `${prefix}_${Date.now()}_${crypto.randomUUID()}`;
}

function normalizeLimit(value, fallback = 50) {
	const parsed = Number(value || fallback);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(Math.trunc(parsed), 1), 1000);
}

function normalizeOffset(value) {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(Math.trunc(parsed), 0);
}

function text(value) {
	return String(value || "").trim();
}

function timestampToIso(value) {
	if (!value) return "";
	if (value instanceof Date) return value.toISOString();
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function dateToYmd(value) {
	if (!value) return "";
	if (typeof value === "object" && value.value) return dateToYmd(value.value);
	if (value instanceof Date) {
		return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
			2,
			"0",
		)}-${String(value.getUTCDate()).padStart(2, "0")}`;
	}
	const normalized = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
	const date = new Date(normalized);
	return Number.isNaN(date.getTime()) ? normalized : date.toISOString().slice(0, 10);
}

function buildDocument(collectionPath, row = {}, data = {}) {
	const id = row.id || row.legacy_document_id || "";
	return {
		path: row.legacy_path || `${collectionPath}/${id}`,
		collectionPath,
		documentId: id,
		parentPath: null,
		data: { id, ...data },
		exportedAt: null,
		importedAt: null,
		updatedAt: row.updated_at || row.atualizado_em || null,
	};
}

function mergeSource(row = {}, canonical = {}) {
	return {
		...(row.source_payload || {}),
		...canonical,
	};
}

function mapConfig(row = {}) {
	return buildDocument(COLLECTIONS.config, row, row.data || row.source_payload || {});
}

function mapTemplate(row = {}) {
	return buildDocument(
		COLLECTIONS.templates,
		row,
		mergeSource(row, {
			nome: row.nome || "",
			conteudo: row.conteudo || "",
			situacao: row.situacao || "",
			requiredCentralButton: Boolean(row.required_central_button),
			required_central_button: Boolean(row.required_central_button),
		}),
	);
}

function mapQueue(row = {}) {
	return buildDocument(
		COLLECTIONS.fila,
		row,
		mergeSource(row, {
			codigo_cliente: row.codigo_cliente || "",
			codigoCliente: row.codigo_cliente || "",
			cliente: row.cliente || "",
			telefone: row.telefone || "",
			telefone_digits: row.telefone_digits || "",
			os: row.os || "",
			contrato: row.contrato || "",
			cidade: row.cidade || "",
			regional: row.regional || "",
			endereco: row.endereco || "",
			status: row.status || "",
			templateId: row.template_id || "",
			template_id: row.template_id || "",
			origem: row.origem || "",
			origemTipo: row.origem_tipo || "",
			origem_tipo: row.origem_tipo || "",
			statusOS: row.status_os || "",
			status_os: row.status_os || "",
			tentativas: Number(row.tentativas || 0),
			ultimoErro: row.ultimo_erro || "",
			ultimo_erro: row.ultimo_erro || "",
			ultimoEnvioEm: timestampToIso(row.ultimo_envio_em),
			ultimo_envio_em: timestampToIso(row.ultimo_envio_em),
			prioridadeEm: timestampToIso(row.prioridade_em),
			prioridade_em: timestampToIso(row.prioridade_em),
			envioLockId: row.envio_lock_id || "",
			envio_lock_id: row.envio_lock_id || "",
			envioLockEm: timestampToIso(row.envio_lock_em),
			envio_lock_em: timestampToIso(row.envio_lock_em),
			criadoPor: row.criado_por || "",
			criado_por: row.criado_por || "",
			criadoEm: timestampToIso(row.criado_em || row.created_at),
			criado_em: timestampToIso(row.criado_em || row.created_at),
			atualizadoEm: timestampToIso(row.atualizado_em || row.updated_at),
			atualizado_em: timestampToIso(row.atualizado_em || row.updated_at),
		}),
	);
}

function mapHistory(row = {}) {
	return buildDocument(
		COLLECTIONS.historico,
		row,
		mergeSource(row, {
			filaId: row.fila_id || "",
			fila_id: row.fila_id || "",
			codigo_cliente: row.codigo_cliente || "",
			codigoCliente: row.codigo_cliente || "",
			cliente: row.cliente || "",
			telefone: row.telefone || "",
			cidade: row.cidade || "",
			os: row.os || "",
			direction: row.direction || "",
			mensagem: row.mensagem || "",
			provider: row.provider || "",
			providerStatus: row.provider_status || "",
			provider_status: row.provider_status || "",
			status: row.status || "",
			erro: row.erro || "",
			payload: row.payload || null,
			criadoEm: timestampToIso(row.criado_em || row.created_at),
			criado_em: timestampToIso(row.criado_em || row.created_at),
		}),
	);
}

function mapCallback(row = {}) {
	return buildDocument(
		COLLECTIONS.callbacks,
		row,
		mergeSource(row, {
			agendamento_id: row.agendamento_id || "",
			agendamentoId: row.agendamento_id || "",
			codigo_cliente: row.codigo_cliente || "",
			codigoCliente: row.codigo_cliente || "",
			cliente: row.cliente || "",
			telefone: row.telefone || "",
			os: row.os || "",
			mensagem: row.mensagem || "",
			motivo: row.motivo || "",
			agendado: Boolean(row.agendado),
			resposta_automatica: row.resposta_automatica || "",
			respostaAutomatica: row.resposta_automatica || "",
			payload: row.payload || null,
			recebido_em: timestampToIso(row.recebido_em || row.created_at),
			recebidoEm: timestampToIso(row.recebido_em || row.created_at),
			criado_em: timestampToIso(row.criado_em || row.created_at),
			criadoEm: timestampToIso(row.criado_em || row.created_at),
		}),
	);
}

function mapConversation(row = {}) {
	return buildDocument(
		COLLECTIONS.conversas,
		row,
		mergeSource(row, {
			telefone: row.telefone || "",
			telefone_digits: row.telefone_digits || "",
			item: row.item_payload || {},
			schedule: row.schedule_payload || null,
			dateOptions: row.date_options || null,
			stage: row.stage || "",
			agendamentoId: row.agendamento_id || "",
			agendamento_id: row.agendamento_id || "",
			selectedDate: dateToYmd(row.selected_date),
			selectedTime: row.selected_time || "",
			startedAt: timestampToIso(row.started_at),
			completedAt: timestampToIso(row.completed_at),
			lastMessageAt: timestampToIso(row.last_message_at),
			atualizado_em: timestampToIso(row.atualizado_em || row.updated_at),
			atualizadoEm: timestampToIso(row.atualizado_em || row.updated_at),
		}),
	);
}

const TABLES = Object.freeze({
	[COLLECTIONS.config]: {
		table: "mensageria_config",
		orderBy: "updated_at desc",
		mapper: mapConfig,
	},
	[COLLECTIONS.templates]: {
		table: "mensageria_templates",
		orderBy: "id",
		mapper: mapTemplate,
	},
	[COLLECTIONS.fila]: {
		table: "mensageria_fila",
		orderBy: "coalesce(prioridade_em, criado_em, created_at) desc",
		mapper: mapQueue,
	},
	[COLLECTIONS.historico]: {
		table: "mensageria_historico",
		orderBy: "coalesce(criado_em, created_at) desc",
		mapper: mapHistory,
	},
	[COLLECTIONS.callbacks]: {
		table: "mensageria_callbacks",
		orderBy: "coalesce(recebido_em, criado_em, created_at) desc",
		mapper: mapCallback,
	},
	[COLLECTIONS.conversas]: {
		table: "mensageria_agendamento_conversas",
		orderBy: "coalesce(last_message_at, atualizado_em, updated_at) desc",
		mapper: mapConversation,
	},
});

function getTableConfig(collectionPath) {
	const config = TABLES[String(collectionPath || "").trim()];
	if (!config) {
		const error = new Error("Colecao de mensageria nao mapeada.");
		error.statusCode = 400;
		throw error;
	}
	return config;
}

async function listDocuments({ collectionPath, limit, offset } = {}) {
	const config = getTableConfig(collectionPath);
	const result = await db.query(
		`select *
		   from ${config.table}
		  order by ${config.orderBy}
		  limit $1 offset $2`,
		[normalizeLimit(limit), normalizeOffset(offset)],
	);
	return result.rows.map(config.mapper);
}

async function listAllDocuments(collectionPath) {
	const config = getTableConfig(collectionPath);
	const result = await db.query(
		`select *
		   from ${config.table}
		  order by ${config.orderBy}`,
	);
	return result.rows.map(config.mapper);
}

async function getDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const config = getTableConfig(collectionPath);
	const documentId = documentIdFromPath(documentPath);
	const result = await db.query(
		`select *
		   from ${config.table}
		  where legacy_path = $1 or id = $2
		  limit 1`,
		[String(documentPath || "").trim(), documentId],
	);
	const row = result.rows[0];
	return row ? config.mapper(row) : null;
}

async function upsertDocument(record = {}) {
	if (!isMessagingCollection(record.collectionPath)) {
		const error = new Error("Colecao de mensageria invalida.");
		error.statusCode = 400;
		throw error;
	}
	await normalizedDualWrite.upsert(record);
	return getDocument(record.path || `${record.collectionPath}/${record.documentId}`);
}

function dataFromDocument(document) {
	return document?.data ? { id: document.documentId, ...document.data } : null;
}

function dataListFromDocuments(documents = []) {
	return documents.map(dataFromDocument).filter(Boolean);
}

async function getMessagingConfig() {
	return dataFromDocument(await getDocument(`${COLLECTIONS.config}/global`)) || {};
}

async function saveMessagingConfigPatch(patch = {}) {
	const current = await getMessagingConfig();
	const next = { ...current, ...patch };
	await upsertDocument({
		path: `${COLLECTIONS.config}/global`,
		collectionPath: COLLECTIONS.config,
		documentId: "global",
		parentPath: null,
		data: next,
	});
	return next;
}

async function listMessageTemplates({ limit = 500, offset = 0 } = {}) {
	return dataListFromDocuments(
		await listDocuments({
			collectionPath: COLLECTIONS.templates,
			limit,
			offset,
		}),
	);
}

async function getMessageTemplate(id) {
	return dataFromDocument(await getDocument(`${COLLECTIONS.templates}/${text(id)}`));
}

async function saveMessageTemplate(template = {}) {
	const id = text(template.id) || randomDocumentId("template");
	const data = { ...template, id };
	await upsertDocument({
		path: `${COLLECTIONS.templates}/${id}`,
		collectionPath: COLLECTIONS.templates,
		documentId: id,
		parentPath: null,
		data,
	});
	return data;
}

async function listQueueMessages({ limit = 1000, offset = 0, status = "" } = {}) {
	const items = dataListFromDocuments(
		await listDocuments({
			collectionPath: COLLECTIONS.fila,
			limit,
			offset,
		}),
	);
	if (!status) return items;
	return items.filter((item) => String(item.status || "") === String(status));
}

async function listAllQueueMessages() {
	return dataListFromDocuments(await listAllDocuments(COLLECTIONS.fila));
}

async function getQueueMessage(id) {
	return dataFromDocument(await getDocument(`${COLLECTIONS.fila}/${text(id)}`));
}

async function saveQueueMessage(id, payload = {}) {
	const documentId = text(id || payload.id) || randomDocumentId("fila");
	const data = { ...payload, id: documentId };
	await upsertDocument({
		path: `${COLLECTIONS.fila}/${documentId}`,
		collectionPath: COLLECTIONS.fila,
		documentId,
		parentPath: null,
		data,
	});
	return data;
}

async function enqueueMessage(payload = {}, { id } = {}) {
	return saveQueueMessage(id, payload);
}

async function updateQueueMessage(id, updates = {}) {
	const current = (await getQueueMessage(id)) || {};
	return saveQueueMessage(id, { ...current, ...updates, id: text(id) });
}

async function listHistoryEntries({ limit = 1000, offset = 0 } = {}) {
	return dataListFromDocuments(
		await listDocuments({
			collectionPath: COLLECTIONS.historico,
			limit,
			offset,
		}),
	);
}

async function listAllHistoryEntries() {
	return dataListFromDocuments(await listAllDocuments(COLLECTIONS.historico));
}

async function createHistoryEntry(payload = {}, { id } = {}) {
	const documentId = text(id || payload.id) || randomDocumentId("evo");
	const data = { ...payload, id: documentId };
	await upsertDocument({
		path: `${COLLECTIONS.historico}/${documentId}`,
		collectionPath: COLLECTIONS.historico,
		documentId,
		parentPath: null,
		data,
	});
	return data;
}

async function listCallbacks({ limit = 500, offset = 0 } = {}) {
	return dataListFromDocuments(
		await listDocuments({
			collectionPath: COLLECTIONS.callbacks,
			limit,
			offset,
		}),
	);
}

async function listAllCallbacks() {
	return dataListFromDocuments(await listAllDocuments(COLLECTIONS.callbacks));
}

async function recordCallback(payload = {}, { id } = {}) {
	const documentId = text(id || payload.id) || randomDocumentId("callback");
	const data = { ...payload, id: documentId };
	await upsertDocument({
		path: `${COLLECTIONS.callbacks}/${documentId}`,
		collectionPath: COLLECTIONS.callbacks,
		documentId,
		parentPath: null,
		data,
	});
	return data;
}

async function getScheduleConversation(phone) {
	const id = text(phone);
	if (!id) return null;
	return dataFromDocument(await getDocument(`${COLLECTIONS.conversas}/${id}`));
}

async function upsertScheduleConversation(phone, payload = {}) {
	const id = text(phone || payload.id || payload.telefone);
	if (!id) return null;
	const current = (await getScheduleConversation(id)) || {};
	const data = { ...current, ...payload, id, telefone: id };
	await upsertDocument({
		path: `${COLLECTIONS.conversas}/${id}`,
		collectionPath: COLLECTIONS.conversas,
		documentId: id,
		parentPath: null,
		data,
	});
	return data;
}

async function completeScheduleConversation(phone, patch = {}) {
	const current = await getScheduleConversation(phone);
	if (!current) return null;
	return upsertScheduleConversation(phone, {
		...patch,
		stage: "completed",
		completedAt: new Date().toISOString(),
	});
}

async function deleteDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const config = getTableConfig(collectionPath);
	const documentId = documentIdFromPath(documentPath);
	const result = await db.query(
		`delete from ${config.table}
		  where legacy_path = $1 or id = $2`,
		[String(documentPath || "").trim(), documentId],
	);
	return result.rowCount || 0;
}

async function deleteDocumentsByCollectionAndSources(collectionPath, sources = []) {
	const config = getTableConfig(collectionPath);
	const normalizedSources = sources.map(text).filter(Boolean);
	if (!normalizedSources.length) return 0;
	const result = await db.query(
		`delete from ${config.table}
		  where coalesce(source_payload->>'fonte', source_payload->>'empresa', '') = any($1::text[])`,
		[normalizedSources],
	);
	return result.rowCount || 0;
}

async function acquireQueueItemLock(id, lockId, { ttlSeconds = 300 } = {}) {
	const result = await db.query(
		`update mensageria_fila
		    set envio_lock_id = $2,
		        envio_lock_em = now(),
		        atualizado_em = now()
		  where id = $1
		    and (
		      envio_lock_id is null
		      or envio_lock_id = ''
		      or envio_lock_id = $2
		      or envio_lock_em is null
		      or envio_lock_em < now() - ($3::int * interval '1 second')
		    )
		  returning *`,
		[String(id || "").trim(), String(lockId || "").trim(), Math.max(Number(ttlSeconds || 300), 30)],
	);
	const row = result.rows[0];
	return row ? mapQueue(row) : null;
}

async function releaseQueueItemLock(id, lockId) {
	await db.query(
		`update mensageria_fila
		    set envio_lock_id = null,
		        envio_lock_em = null,
		        atualizado_em = now()
		  where id = $1
		    and envio_lock_id = $2`,
		[String(id || "").trim(), String(lockId || "").trim()],
	);
}

module.exports = {
	COLLECTIONS,
	acquireQueueItemLock,
	completeScheduleConversation,
	createHistoryEntry,
	deleteDocument,
	deleteDocumentsByCollectionAndSources,
	getDocument,
	getMessageTemplate,
	getMessagingConfig,
	getQueueMessage,
	getScheduleConversation,
	isMessagingCollection,
	listAllCallbacks,
	listCallbacks,
	listAllHistoryEntries,
	listAllQueueMessages,
	listAllDocuments,
	listDocuments,
	listHistoryEntries,
	listMessageTemplates,
	listQueueMessages,
	recordCallback,
	releaseQueueItemLock,
	saveMessageTemplate,
	saveMessagingConfigPatch,
	saveQueueMessage,
	enqueueMessage,
	upsertDocument,
	updateQueueMessage,
	upsertScheduleConversation,
};
