const db = require("./db");
const auditLog = require("./auditLog");
const normalizedDualWrite = require("./normalizedDualWrite");
const { broadcastRealtime } = require("./realtime");
const { invalidatePublicDashboardCache } = require("./publicDashboard");

const MAX_LIMIT = 1000;
const DOCUMENTS_READ_CACHE_TTL_MS = Math.max(
	Number(process.env.DOCUMENTS_READ_CACHE_TTL_MS || 5000),
	0,
);
const documentsReadCache = new Map();

function getDocumentsCacheEntry(key) {
	if (!DOCUMENTS_READ_CACHE_TTL_MS || !key) return null;
	const cached = documentsReadCache.get(key);
	if (!cached) return null;
	if (Date.now() - cached.createdAt > DOCUMENTS_READ_CACHE_TTL_MS) {
		documentsReadCache.delete(key);
		return null;
	}
	return cached.value;
}

async function getOrSetDocumentsCache(key, loader) {
	const cached = getDocumentsCacheEntry(key);
	if (cached) return cached;

	const pendingKey = `${key}:pending`;
	const pending = getDocumentsCacheEntry(pendingKey);
	if (pending) return pending;

	const promise = loader();
	if (DOCUMENTS_READ_CACHE_TTL_MS) {
		documentsReadCache.set(pendingKey, {
			createdAt: Date.now(),
			value: promise,
		});
	}

	try {
		const value = await promise;
		if (DOCUMENTS_READ_CACHE_TTL_MS) {
			documentsReadCache.set(key, { createdAt: Date.now(), value });
		}
		return value;
	} finally {
		documentsReadCache.delete(pendingKey);
		if (documentsReadCache.size > 500) {
			const firstKey = documentsReadCache.keys().next().value;
			if (firstKey) documentsReadCache.delete(firstKey);
		}
	}
}

function invalidateDocumentsCache({ collectionPath, documentPath } = {}) {
	const collection = String(collectionPath || "").trim();
	const path = String(documentPath || "").trim();
	if (collection) {
		documentsReadCache.clear();
		return;
	}
	for (const key of documentsReadCache.keys()) {
		if (path && key.includes(`:${path}`)) {
			documentsReadCache.delete(key);
		}
	}
}

function normalizeLimit(value) {
	const parsed = Number(value || 50);
	if (!Number.isFinite(parsed)) return 50;
	return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

async function listDocuments({ collectionPath, limit, offset }) {
	const normalizedLimit = normalizeLimit(limit);
	const normalizedOffset = Math.max(Number(offset || 0), 0);
	return getOrSetDocumentsCache(
		`list:${collectionPath}:${normalizedLimit}:${normalizedOffset}`,
		async () => {
			const result = await db.query(
				`select path, collection_path as "collectionPath", document_id as "documentId",
                parent_path as "parentPath", data, exported_at as "exportedAt",
                imported_at as "importedAt", updated_at as "updatedAt"
           from app_documents
          where collection_path = $1
          order by document_id
          limit $2 offset $3`,
				[collectionPath, normalizedLimit, normalizedOffset],
			);
			return result.rows;
		},
	);
}

async function getDocument(documentPath) {
	return getOrSetDocumentsCache(`path:${documentPath}`, async () => {
		const result = await db.query(
			`select path, collection_path as "collectionPath", document_id as "documentId",
                parent_path as "parentPath", data, exported_at as "exportedAt",
                imported_at as "importedAt", updated_at as "updatedAt"
           from app_documents
          where path = $1`,
			[documentPath],
		);
		return result.rows[0] || null;
	});
}

async function getDocumentSnapshot(documentPath) {
	const result = await db.query(
		`select path, collection_path as "collectionPath", document_id as "documentId",
            parent_path as "parentPath", data, exported_at as "exportedAt",
            imported_at as "importedAt", updated_at as "updatedAt"
       from app_documents
      where path = $1`,
		[documentPath],
	);
	return result.rows[0] || null;
}

async function upsertDocument(record) {
	if (record.collectionPath === "regionais") {
		throw new Error("Colecao regionais migrada para tabelas normalizadas.");
	}
	const beforeRecord = await getDocumentSnapshot(record.path);
	invalidateDocumentsCache({
		collectionPath: record.collectionPath,
		documentPath: record.path,
	});
	await db.query(
		`insert into app_documents (path, collection_path, document_id, parent_path, data)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (path) do update set
       collection_path = excluded.collection_path,
       document_id = excluded.document_id,
       parent_path = excluded.parent_path,
       data = excluded.data`,
		[
			record.path,
			record.collectionPath,
			record.documentId,
			record.parentPath || null,
			JSON.stringify(record.data || {}),
		],
	);
	await normalizedDualWrite.upsert(record);
	broadcastDocumentChange("upsert", record);
	auditLog.recordDocumentAuditLog({
		action: beforeRecord ? "update" : "create",
		beforeRecord,
		record,
	});
}

async function deleteDocument(path) {
	const beforeRecord = await getDocumentSnapshot(path);
	if (beforeRecord?.collectionPath === "regionais") {
		throw new Error("Colecao regionais migrada para tabelas normalizadas.");
	}
	await db.query(`delete from app_documents where path = $1`, [path]);
	const parts = String(path || "")
		.split("/")
		.filter(Boolean);
	await normalizedDualWrite.remove({
		path,
		collectionPath: parts.slice(0, -1).join("/"),
		documentId: parts.at(-1),
	});
	invalidateDocumentsCache({
		collectionPath: parts.slice(0, -1).join("/"),
		documentPath: path,
	});
	broadcastDocumentChange("delete", {
		path,
		collectionPath: parts.slice(0, -1).join("/"),
		documentId: parts.at(-1),
	});
	auditLog.recordDocumentAuditLog({
		action: "delete",
		beforeRecord,
		record: {
			path,
			collectionPath: parts.slice(0, -1).join("/"),
			documentId: parts.at(-1),
		},
	});
}

async function deleteDocumentsByCollectionAndSources(
	collectionPath,
	sources = [],
) {
	const normalizedSources = sources
		.map((source) => String(source || "").trim())
		.filter(Boolean);
	if (!normalizedSources.length) return 0;

	const result = await db.query(
		`delete from app_documents
      where collection_path = $1
        and coalesce(data->>'fonte', data->>'empresa', '') = any($2::text[])`,
		[collectionPath, normalizedSources],
	);
	invalidateDocumentsCache({ collectionPath });
	auditLog.recordAuditLog({
		action: "delete",
		module: String(collectionPath || "").split("/").filter(Boolean)[0] || "documentos",
		entity: collectionPath,
		recordId: "bulk",
		beforeData: { sources: normalizedSources, deletedCount: result.rowCount || 0 },
		afterData: null,
		changedFields: ["deletedCount", "sources"],
	});

	return result.rowCount || 0;
}

async function listAllDocuments(collectionPath) {
	const result = await db.query(
		`select path, collection_path as "collectionPath", document_id as "documentId",
            parent_path as "parentPath", data, exported_at as "exportedAt",
            imported_at as "importedAt", updated_at as "updatedAt"
       from app_documents
      where collection_path = $1
      order by document_id`,
		[collectionPath],
	);
	return result.rows;
}

module.exports = {
	deleteDocument,
	deleteDocumentsByCollectionAndSources,
	getDocument,
	listAllDocuments,
	listDocuments,
	upsertDocument,
};

function topicsForDocument(record = {}) {
	const collection = String(record.collectionPath || "");
	const path = String(record.path || "");
	const topics = new Set(["documents"]);

	if (
		["acompanhamento_diario", "acompanhamento_diario_logs"].includes(collection)
	) {
		topics.add("diario");
		topics.add("acompanhamento");
	}

	if (
		[
			"agenda",
			"agendamentos",
			"agendamentos_logs",
			"agendamento_esteira_blocos",
			"agendamento_esteira_catalogo",
			"agendamento_esteira_metricas",
			"agendamento_esteira_logs",
		].includes(collection) ||
		path.startsWith("acompanhamento_config/") ||
		path === "config/acompanhamento_atualizacoes"
	) {
		topics.add("acompanhamento");
	}

	if (collection === "metas" || path === "config/metas") {
		topics.add("metas");
		topics.add("dashboard");
		topics.add("acompanhamento");
	}

	if (
		collection === "ordens_abertas" ||
		collection === "mapa_meta" ||
		path === "public_dashboard/mapa_os"
	) {
		topics.add("mapa");
		topics.add("dashboard");
		topics.add("acompanhamento");
	}

	if (
		collection === "match_os_abertas" ||
		collection === "match_os_meta" ||
		path === "public_dashboard/match_os" ||
		path === "public_dashboard/agentes_match_os" ||
		path === "config/match_os"
	) {
		topics.add("match");
		topics.add("dashboard");
		topics.add("acompanhamento");
	}

	if (collection === "public_dashboard") {
		topics.add("dashboard");
		topics.add("acompanhamento");
	}

	if (
		collection === "estoque_equipamentos" ||
		collection === "estoque_equipamentos_logs" ||
		collection === "estoque_equipamentos_tratativas" ||
		collection === "acerto_estoque_acertos" ||
		collection === "empresas_tecnicos"
	) {
		topics.add("estoque");
		topics.add("mapa");
		topics.add("empresas");
	}

	return [...topics];
}

function shouldInvalidatePublicDashboard(record = {}) {
	const collection = String(record.collectionPath || "");
	const path = String(record.path || "");
	return (
		[
			"dashboard",
			"dashboardagentes",
			"feriados",
			"metas",
			"ordens_abertas",
			"mapa_meta",
			"match_os_abertas",
			"match_os_meta",
			"public_dashboard",
		].includes(collection) ||
		path === "config/metas" ||
		path === "public_dashboard/mapa_os" ||
		path === "public_dashboard/match_os" ||
		path === "public_dashboard/agentes_match_os"
	);
}

function broadcastDocumentChange(action, record) {
	const payload = {
		action,
		path: record.path,
		collectionPath: record.collectionPath,
		documentId: record.documentId,
	};

	if (record.collectionPath === "agendamentos" && action === "upsert") {
		payload.data = record.data || {};
		payload.eventType = "agendamento_upsert";
	}

	topicsForDocument(record).forEach((topic) => {
		broadcastRealtime(topic, payload);
	});

	if (shouldInvalidatePublicDashboard(record)) {
		invalidatePublicDashboardCache();
	}
}
