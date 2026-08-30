const crypto = require("node:crypto");
const db = require("./db");

const COLLECTIONS = Object.freeze({
	ordens: "ordens_abertas",
	match: "match_os_abertas",
	legadas: "ordens_legadas",
	acumuladas: "os_acumuladas",
	mapaMeta: "mapa_meta",
	matchMeta: "match_os_meta",
	publicDashboard: "public_dashboard",
});

const ORDER_COLLECTIONS = new Set([
	COLLECTIONS.ordens,
	COLLECTIONS.match,
	COLLECTIONS.legadas,
	COLLECTIONS.acumuladas,
]);
const META_COLLECTIONS = new Set([
	COLLECTIONS.mapaMeta,
	COLLECTIONS.matchMeta,
	COLLECTIONS.publicDashboard,
]);
const COLLECTION_SET = new Set([...ORDER_COLLECTIONS, ...META_COLLECTIONS]);

function isOrdersCollection(collectionPath) {
	return COLLECTION_SET.has(String(collectionPath || "").trim());
}

function text(value) {
	return String(value ?? "").trim();
}

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function numberValue(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const parsed = Number(text(value).replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
}

function intValue(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(value) {
	if (typeof value === "boolean") return value;
	const normalized = text(value).toLowerCase();
	if (["true", "1", "sim", "s"].includes(normalized)) return true;
	if (["false", "0", "nao", "não"].includes(normalized)) return false;
	return false;
}

function normalizeSource(value, collectionPath = "") {
	const normalized = text(value).toLowerCase();
	if (normalized.includes("onnet")) return "onnet";
	if (normalized.includes("sempre")) return "sempre";
	if (collectionPath === COLLECTIONS.legadas) return "legado";
	if (collectionPath === COLLECTIONS.match) return "match";
	return normalized || collectionPath;
}

function parseDate(value) {
	if (!value) return null;
	const raw = text(value);
	if (!raw) return null;
	const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
	if (br) {
		const [, day, month, year, hour = "00", minute = "00", second = "00"] = br;
		const date = new Date(
			Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
		);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value) {
	const parsed = parseDate(value);
	return parsed ? parsed.slice(0, 10) : null;
}

function nowIso() {
	return new Date().toISOString();
}

function hashPath(path) {
	return crypto.createHash("sha256").update(String(path)).digest("hex").slice(0, 32);
}

function collectionFromPath(documentPath) {
	const parts = String(documentPath || "").split("/").filter(Boolean);
	return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function documentIdFromPath(documentPath) {
	return String(documentPath || "").split("/").filter(Boolean).at(-1) || "";
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

function orderNum(data = {}, row = {}) {
	return text(data.num_os || data.num_o_s || data.os || data.numero_os || row.legacy_document_id || row.document_id);
}

function orderIdFromRecord(record = {}) {
	const data = record.data || {};
	const numOs = orderNum(data, { legacy_document_id: record.documentId });
	const source = normalizeSource(data.fonte || data.empresa, record.collectionPath);
	if (numOs) return `${record.collectionPath}:${source}:${numOs}`;
	return `${record.collectionPath}:path:${hashPath(record.path)}`;
}

function normalizePhones(data = {}) {
	const phones = [
		data.telefone,
		data.telefone_primario,
		data.telefone_secundario,
		data.telefone_terciario,
		...(Array.isArray(data.telefones) ? data.telefones : []),
	]
		.map(text)
		.filter(Boolean);
	return [...new Set(phones)];
}

function normalizeMacs(data = {}) {
	const macs = Array.isArray(data.macs_equipamento)
		? data.macs_equipamento
		: [data.mac_addr, data.phy_addr];
	return macs.map(text).filter(Boolean);
}

function sourcePayload(row = {}, fallback = {}) {
	return { ...(row.source_payload || {}), ...fallback };
}

function documentBase(collectionPath, row = {}, data = {}) {
	const documentId =
		row.legacy_document_id ||
		row.document_id_original ||
		row.num_os ||
		documentIdFromPath(row.legacy_path);
	return {
		path: row.legacy_path || `${collectionPath}/${documentId}`,
		collectionPath,
		documentId,
		parentPath: null,
		data: { id: documentId, ...sourcePayload(row), ...data },
		exportedAt: null,
		importedAt: null,
		updatedAt: row.updated_at || null,
	};
}

function mapOrder(row = {}) {
	return documentBase(row.source_collection, row, {
		num_os: row.num_os || "",
		codigo_cliente: row.codigo_cliente || "",
		nome_cliente: row.nome_cliente || "",
		telefone: row.telefone || "",
		telefones: row.telefones || [],
		empresa: row.empresa || "",
		fonte: row.source || "",
		tipo: row.tipo || "",
		status: row.status || "",
		servico: row.servico || "",
		tecnico: row.tecnico || "",
		cidade: row.cidade || "",
		regional: row.regional || "",
		endereco: row.endereco || "",
		endereco_resumo: row.endereco_resumo || "",
		bairro: row.bairro || "",
		numero: row.numero || "",
		latitude: row.latitude === null ? undefined : Number(row.latitude),
		longitude: row.longitude === null ? undefined : Number(row.longitude),
		coordenadas: row.coordenadas || "",
		data_abertura_os: row.data_abertura || "",
		data_cadastro: row.data_cadastro || "",
		mac_addr: row.mac_addr || "",
		phy_addr: row.phy_addr || "",
		macs_equipamento: row.macs_equipamento || [],
		agente: row.agente === true,
	});
}

function mapImportRun(row = {}) {
	return documentBase(row.source_collection, row, row.payload || {});
}

function normalizeOrderRecord(record = {}) {
	const data = record.data || {};
	const phones = normalizePhones(data);
	return {
		id: orderIdFromRecord(record),
		source_collection: record.collectionPath,
		source: normalizeSource(data.fonte || data.empresa, record.collectionPath),
		num_os: nullableText(orderNum(data, { legacy_document_id: record.documentId })),
		codigo_cliente: nullableText(data.codigo_cliente || data.codigo || data.cod_cliente),
		nome_cliente: nullableText(data.nome_cliente || data.cliente || data.nome_razaosocial),
		telefone: nullableText(data.telefone || phones[0]),
		telefones: phones,
		empresa: nullableText(data.empresa || data.fonte),
		tipo: nullableText(data.tipo || data.servico_tipo),
		status: nullableText(data.status || data.servico_status),
		servico: nullableText(data.servico || data.descricao_servico),
		tecnico: nullableText(data.tecnico || data.tecnicos),
		cidade: nullableText(data.cidade || data.pop),
		regional: nullableText(data.regional),
		endereco: nullableText(data.endereco || data.endereco_instalacao),
		endereco_resumo: nullableText(data.endereco_resumo || data.endereco_instalacao),
		bairro: nullableText(data.bairro),
		numero: nullableText(data.numero),
		latitude: numberValue(data.latitude),
		longitude: numberValue(data.longitude),
		coordenadas: nullableText(data.coordenadas),
		data_abertura: parseDate(data.data_abertura_os || data.dataAberturaSort || data.data_inicio_programado),
		data_cadastro: parseDate(data.data_cadastro || data.savedAt),
		mac_addr: nullableText(data.mac_addr),
		phy_addr: nullableText(data.phy_addr),
		macs_equipamento: normalizeMacs(data),
		agente: boolValue(data.agente),
		legacy_path: record.path,
		legacy_document_id: record.documentId,
		created_at: parseDate(data.createdAt || data.savedAt) || nowIso(),
		updated_at: parseDate(data.updatedAt || data.atualizadoEm) || nowIso(),
		source_payload: data,
	};
}

function normalizeImportRunRecord(record = {}) {
	const data = record.data || {};
	const documentId = text(record.documentId) || documentIdFromPath(record.path);
	return {
		id: `${record.collectionPath}:${documentId}`,
		tipo: record.collectionPath === COLLECTIONS.matchMeta || record.path.includes("match_os") ? "match" : "mapa",
		fonte: normalizeSource(data.fonteAtualizada || data.source || data.fonte, record.collectionPath),
		source_collection: record.collectionPath,
		periodo_inicio: dateOnly(data.periodoInicio),
		periodo_fim: dateOnly(data.periodoFim),
		total_os: intValue(data.totalOS || data.total || data.totalGeral),
		removidas: intValue(data.removidas),
		ignoradas: intValue(data.ignoradas || data.ignoradasSemRegional || data.ignoradasPorTipo),
		legacy_path: record.path,
		legacy_document_id: documentId,
		created_at: parseDate(data.data || data.generatedAt) || nowIso(),
		updated_at: parseDate(data.updatedAt || data.data) || nowIso(),
		payload: data,
		source_payload: data,
	};
}

async function listDocuments({ collectionPath, limit, offset }) {
	const rows = await listAllDocuments(collectionPath);
	const normalizedLimit = normalizeLimit(limit);
	const normalizedOffset = normalizeOffset(offset);
	return rows.slice(normalizedOffset, normalizedOffset + normalizedLimit);
}

async function getCollectionLatestUpdatedAt(collectionPath) {
	if (!ORDER_COLLECTIONS.has(collectionPath)) return null;
	const result = await db.query(
		"select max(updated_at) as latest from ordens_servico where source_collection = $1",
		[collectionPath],
	);
	return result.rows[0]?.latest || null;
}

async function listAllDocuments(collectionPath) {
	if (ORDER_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			"select * from ordens_servico where source_collection = $1 order by legacy_document_id",
			[collectionPath],
		);
		return result.rows.map(mapOrder);
	}
	if (META_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			"select * from ordens_import_runs where source_collection = $1 order by legacy_document_id",
			[collectionPath],
		);
		return result.rows.map(mapImportRun);
	}
	return [];
}

async function getDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const documentId = documentIdFromPath(documentPath);
	if (ORDER_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			`select * from ordens_servico
			  where source_collection = $1
			    and (legacy_path = $2 or legacy_document_id = $3 or num_os = $3)
			  order by legacy_path = $2 desc
			  limit 1`,
			[collectionPath, documentPath, documentId],
		);
		return result.rows[0] ? mapOrder(result.rows[0]) : null;
	}
	if (META_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			`select * from ordens_import_runs
			  where source_collection = $1
			    and (legacy_path = $2 or legacy_document_id = $3)
			  limit 1`,
			[collectionPath, documentPath, documentId],
		);
		return result.rows[0] ? mapImportRun(result.rows[0]) : null;
	}
	return null;
}

async function upsertDocument(record = {}) {
	if (ORDER_COLLECTIONS.has(record.collectionPath)) return upsertOrder(record);
	if (META_COLLECTIONS.has(record.collectionPath)) return upsertImportRun(record);
	return null;
}

async function upsertOrder(record) {
	const row = normalizeOrderRecord(record);
	await db.query(
		`insert into ordens_servico
		 (id, source_collection, source, num_os, codigo_cliente, nome_cliente,
		  telefone, telefones, empresa, tipo, status, servico, tecnico, cidade,
		  regional, endereco, endereco_resumo, bairro, numero, latitude, longitude,
		  coordenadas, data_abertura, data_cadastro, mac_addr, phy_addr,
		  macs_equipamento, agente, legacy_path, legacy_document_id, created_at,
		  updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,$28,$29,$30,$31,$32,$33::jsonb)
		 on conflict (id) do update set
		   source_collection = excluded.source_collection,
		   source = excluded.source,
		   num_os = excluded.num_os,
		   codigo_cliente = excluded.codigo_cliente,
		   nome_cliente = excluded.nome_cliente,
		   telefone = excluded.telefone,
		   telefones = excluded.telefones,
		   empresa = excluded.empresa,
		   tipo = excluded.tipo,
		   status = excluded.status,
		   servico = excluded.servico,
		   tecnico = excluded.tecnico,
		   cidade = excluded.cidade,
		   regional = excluded.regional,
		   endereco = excluded.endereco,
		   endereco_resumo = excluded.endereco_resumo,
		   bairro = excluded.bairro,
		   numero = excluded.numero,
		   latitude = excluded.latitude,
		   longitude = excluded.longitude,
		   coordenadas = excluded.coordenadas,
		   data_abertura = excluded.data_abertura,
		   data_cadastro = excluded.data_cadastro,
		   mac_addr = excluded.mac_addr,
		   phy_addr = excluded.phy_addr,
		   macs_equipamento = excluded.macs_equipamento,
		   agente = excluded.agente,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   updated_at = excluded.updated_at,
		   source_payload = excluded.source_payload`,
		[
			row.id,
			row.source_collection,
			row.source,
			row.num_os,
			row.codigo_cliente,
			row.nome_cliente,
			row.telefone,
			row.telefones,
			row.empresa,
			row.tipo,
			row.status,
			row.servico,
			row.tecnico,
			row.cidade,
			row.regional,
			row.endereco,
			row.endereco_resumo,
			row.bairro,
			row.numero,
			row.latitude,
			row.longitude,
			row.coordenadas,
			row.data_abertura,
			row.data_cadastro,
			row.mac_addr,
			row.phy_addr,
			JSON.stringify(row.macs_equipamento),
			row.agente,
			row.legacy_path,
			row.legacy_document_id,
			row.created_at,
			row.updated_at,
			JSON.stringify(row.source_payload),
		],
	);
	return getDocument(row.legacy_path);
}

async function upsertImportRun(record) {
	const row = normalizeImportRunRecord(record);
	await db.query(
		`insert into ordens_import_runs
		 (id, tipo, fonte, source_collection, periodo_inicio, periodo_fim, total_os,
		  removidas, ignoradas, legacy_path, legacy_document_id, created_at,
		  updated_at, payload, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb)
		 on conflict (id) do update set
		   tipo = excluded.tipo,
		   fonte = excluded.fonte,
		   source_collection = excluded.source_collection,
		   periodo_inicio = excluded.periodo_inicio,
		   periodo_fim = excluded.periodo_fim,
		   total_os = excluded.total_os,
		   removidas = excluded.removidas,
		   ignoradas = excluded.ignoradas,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   updated_at = excluded.updated_at,
		   payload = excluded.payload,
		   source_payload = excluded.source_payload`,
		[
			row.id,
			row.tipo,
			row.fonte,
			row.source_collection,
			row.periodo_inicio,
			row.periodo_fim,
			row.total_os,
			row.removidas,
			row.ignoradas,
			row.legacy_path,
			row.legacy_document_id,
			row.created_at,
			row.updated_at,
			JSON.stringify(row.payload),
			JSON.stringify(row.source_payload),
		],
	);
	return getDocument(row.legacy_path);
}

async function deleteDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const documentId = documentIdFromPath(documentPath);
	if (ORDER_COLLECTIONS.has(collectionPath)) {
		await db.query(
			"delete from ordens_servico where source_collection = $1 and (legacy_path = $2 or legacy_document_id = $3 or num_os = $3)",
			[collectionPath, documentPath, documentId],
		);
		return;
	}
	if (META_COLLECTIONS.has(collectionPath)) {
		await db.query(
			"delete from ordens_import_runs where source_collection = $1 and (legacy_path = $2 or legacy_document_id = $3)",
			[collectionPath, documentPath, documentId],
		);
	}
}

async function deleteDocumentsByCollectionAndSources(collectionPath, sources = []) {
	if (!ORDER_COLLECTIONS.has(collectionPath)) return 0;
	const normalizedSources = sources.map((source) => normalizeSource(source)).filter(Boolean);
	if (!normalizedSources.length) return 0;
	const result = await db.query(
		"delete from ordens_servico where source_collection = $1 and source = any($2::text[])",
		[collectionPath, normalizedSources],
	);
	return result.rowCount || 0;
}

module.exports = {
	COLLECTIONS,
	deleteDocument,
	deleteDocumentsByCollectionAndSources,
	getDocument,
	getCollectionLatestUpdatedAt,
	isOrdersCollection,
	listAllDocuments,
	listDocuments,
	upsertDocument,
};
