const db = require("./db");
const { broadcastRealtime } = require("./realtime");

const MAX_LIMIT = 1000;

function normalizeLimit(value) {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

async function listDocuments({ collectionPath, limit, offset }) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedOffset = Math.max(Number(offset || 0), 0);
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
}

async function getDocument(documentPath) {
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
  broadcastDocumentChange("upsert", record);
}

async function deleteDocument(path) {
  await db.query(`delete from app_documents where path = $1`, [path]);
  const parts = String(path || "").split("/").filter(Boolean);
  broadcastDocumentChange("delete", {
    path,
    collectionPath: parts.slice(0, -1).join("/"),
    documentId: parts.at(-1),
  });
}

async function deleteDocumentsByCollectionAndSources(collectionPath, sources = []) {
  const normalizedSources = sources.map((source) => String(source || "").trim()).filter(Boolean);
  if (!normalizedSources.length) return 0;

  const result = await db.query(
    `delete from app_documents
      where collection_path = $1
        and coalesce(data->>'fonte', data->>'empresa', '') = any($2::text[])`,
    [collectionPath, normalizedSources],
  );

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

  if (["acompanhamento_diario", "acompanhamento_diario_logs"].includes(collection)) {
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

  if (collection === "ordens_abertas" || collection === "mapa_meta" || path === "public_dashboard/mapa_os") {
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
}
