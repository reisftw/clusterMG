const db = require("./db");

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function rowsToDocumentMap(rows = []) {
  const map = rows.reduce((acc, row) => {
    acc[row.documentId] = row.data || {};
    return acc;
  }, {});
  if (map.Marco && !map.Março) {
    map.Março = { ...map.Marco, mes: "Março", month: "Março" };
  }
  if (map.Março && !map.Marco) {
    map.Marco = { ...map.Março, mes: "Marco", month: "Marco" };
  }
  return map;
}

async function getDocumentData(path) {
  const result = await db.query(
    `select data
       from app_documents
      where path = $1`,
    [path],
  );
  return result.rows[0]?.data || null;
}

async function listCollectionData(collectionPath, { limit = 10000 } = {}) {
  const result = await db.query(
    `select document_id as "documentId", data
       from app_documents
      where collection_path = $1
      order by document_id
      limit $2`,
    [collectionPath, limit],
  );
  return result.rows;
}

function normalizeHoliday(item = {}) {
  return {
    ...item,
    date: item.date || item.data || "",
    name: item.name || item.nome || item.descricao || "",
  };
}

async function buildMetasSlice() {
  const [metasRows, config, feriadosRows, auditoriaRows] = await Promise.all([
    listCollectionData("metas", { limit: 36 }),
    getDocumentData("config/metas"),
    listCollectionData("feriados", { limit: 300 }),
    Promise.resolve(null),
  ]);

  return {
    all: rowsToDocumentMap(metasRows),
    lastUpdate: config?.lastUpdate || null,
    forcaTarefa: config?.forcaTarefa || null,
    baseConfig: config?.baseConfig || null,
    feriados: feriadosRows
      .map((row) => normalizeHoliday(row.data))
      .map((item) => item.date)
      .filter(Boolean)
      .map((date) => {
        const parts = String(date).split("-");
        return parts.length === 3 ? `${parts[1]}-${parts[2]}` : null;
      })
      .filter(Boolean),
    auditoriaAgentes: auditoriaRows,
  };
}

async function buildDashboardDomain() {
  const [dashboardRows, feriadosRows, feriasRows, colaboradoresRows, metas] = await Promise.all([
    listCollectionData("dashboard", { limit: 36 }),
    listCollectionData("feriados", { limit: 300 }),
    listCollectionData("ferias", { limit: 2000 }),
    listCollectionData("colaboradores", { limit: 2000 }),
    buildMetasSlice(),
  ]);

  return {
    domain: "dashboard",
    generatedAt: new Date().toISOString(),
    dashboard: {
      data: {
        feriados: feriadosRows.map((row) => normalizeHoliday(row.data)),
        ferias: feriasRows.map((row) => ({ id: row.documentId, ...row.data })),
        colaboradores: colaboradoresRows.map((row) => ({ id: row.documentId, ...row.data })),
      },
    },
    metas,
    painel: {
      retiradas: {
        result: rowsToDocumentMap(dashboardRows),
        meta: { generatedAt: new Date().toISOString() },
        baseConfig: metas.baseConfig || null,
        feriados: feriadosRows.map((row) => normalizeHoliday(row.data)),
      },
      forcaTarefa: metas.forcaTarefa,
    },
  };
}

async function buildRhDomain() {
  const [colaboradoresRows, feriasRows] = await Promise.all([
    listCollectionData("colaboradores", { limit: 2000 }),
    listCollectionData("ferias", { limit: 2000 }),
  ]);

  return {
    domain: "rh",
    generatedAt: new Date().toISOString(),
    colaboradores: {
      items: colaboradoresRows.map((row) => ({ id: row.documentId, ...row.data })),
    },
    ferias: feriasRows.map((row) => ({ id: row.documentId, ...row.data })),
  };
}

async function buildOperationalDomain() {
  const [mapa, matchOS, agentesMatchOS] = await Promise.all([
    getDocumentData("public_dashboard/mapa_os"),
    getDocumentData("public_dashboard/match_os"),
    getDocumentData("public_dashboard/agentes_match_os"),
  ]);

  return {
    domain: "operacional",
    generatedAt: new Date().toISOString(),
    mapa,
    matchOS,
    agentesMatchOS,
  };
}

async function buildPublicDashboard() {
  const [dashboardRows, agentesRows, feriadosRows, config, mapa, matchOS, agentesMatchOS] =
    await Promise.all([
      listCollectionData("dashboard", { limit: 36 }),
      listCollectionData("dashboardagentes", { limit: 36 }),
      listCollectionData("feriados", { limit: 300 }),
      getDocumentData("config/metas"),
      getDocumentData("public_dashboard/mapa_os"),
      getDocumentData("public_dashboard/match_os"),
      getDocumentData("public_dashboard/agentes_match_os"),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    mapa,
    matchOS,
    agentesMatchOS,
    painel: {
      retiradas: {
        result: rowsToDocumentMap(dashboardRows),
        meta: { generatedAt: new Date().toISOString() },
        feriados: feriadosRows.map((row) => normalizeHoliday(row.data)),
      },
      agentes: {
        result: rowsToDocumentMap(agentesRows),
        meta: { generatedAt: new Date().toISOString() },
      },
      forcaTarefa: config?.forcaTarefa || null,
    },
    months: MONTHS,
  };
}

async function buildSnapshotDomain(domain) {
  if (domain === "dashboard") return buildDashboardDomain();
  if (domain === "rh") return buildRhDomain();
  if (domain === "operacional") return buildOperationalDomain();
  if (domain === "financeiro") {
    return {
      domain: "financeiro",
      generatedAt: new Date().toISOString(),
    };
  }
  return null;
}

module.exports = {
  buildPublicDashboard,
  buildSnapshotDomain,
};
