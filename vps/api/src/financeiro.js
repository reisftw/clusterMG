const documents = require("./documents");
const { google } = require("googleapis");
const crypto = require("crypto");
const fs = require("fs");

const DASHBOARD_PATH = "financeiro_config/dashboard";
const SHEETS_CONFIG_PATH = "financeiro_config/google_sheets";
const SHEETS_LOG_COLLECTION = "financeiro_import_logs";
const MOCK_SOURCE = "mockup";
const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const SHEET_TYPES = [
  { id: "contas_pagar", label: "Contas a pagar", defaultRange: "A:Z" },
  { id: "contas_receber", label: "Contas a receber", defaultRange: "A:Z" },
  { id: "faturamento", label: "Faturamento", defaultRange: "A:Z" },
  { id: "notas", label: "Notas", defaultRange: "A:Z" },
];

let sheetsClient = null;
let workerTimer = null;
let workerRunning = false;
let serviceAccountInfoCache = null;

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function currency(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function getReferenceDate() {
  const date = new Date();
  date.setHours(8, 0, 0, 0);
  return date;
}

function previousTrend(value, previous, inverse = false) {
  const current = toNumber(value);
  const old = toNumber(previous);
  const percent = old ? ((current - old) / old) * 100 : 0;
  const improved = inverse ? percent <= 0 : percent >= 0;
  return {
    percent: Math.abs(percent),
    direction: percent >= 0 ? "up" : "down",
    status: improved ? "positive" : "negative",
  };
}

function buildMockDashboard() {
  const updatedAt = getReferenceDate().toISOString();
  const lastBillings = [
    { label: "02/08", value: 198200, previous: 184000 },
    { label: "09/08", value: 217600, previous: 198200 },
    { label: "16/08", value: 229400, previous: 217600 },
    { label: "23/08", value: 245800, previous: 229400 },
    { label: "30/08", value: 271300, previous: 245800 },
  ];
  const receivables = [
    { label: "Seg", previsto: 550000, recebido: 420000 },
    { label: "Ter", previsto: 620000, recebido: 470000 },
    { label: "Qua", previsto: 480000, recebido: 455000 },
    { label: "Qui", previsto: 510000, recebido: 495000 },
    { label: "Sex", previsto: 590000, recebido: 530000 },
  ];
  const paymentMethods = [
    { label: "Boleto", value: 786000, count: 1320 },
    { label: "PIX", value: 561000, count: 940 },
    { label: "Cartão", value: 336000, count: 410 },
    { label: "Débito automático", value: 191552.3, count: 260 },
  ];
  const revenueEvolution = [
    { label: "01/08", value: 92000 },
    { label: "05/08", value: 344000 },
    { label: "10/08", value: 694000 },
    { label: "15/08", value: 1048000 },
    { label: "20/08", value: 1399000 },
    { label: "25/08", value: 1650000 },
    { label: "30/08", value: 1874552.3 },
  ];
  const citiesRanking = [
    { label: "Belo Horizonte", value: 612450.3 },
    { label: "Contagem", value: 375820.1 },
    { label: "Ribeirão das Neves", value: 268430.6 },
    { label: "Betim", value: 198560.4 },
    { label: "Ibirité", value: 156320.2 },
  ];
  const upcomingAccounts = [
    { id: "cp-001", vencimento: "Hoje", nome: "Grupo Energia Minas", categoria: "Energia", valor: 42800.2, dias: 0, status: "Hoje" },
    { id: "cp-002", vencimento: "Amanhã", nome: "Link dedicado backbone", categoria: "Operacional", valor: 82400, dias: 1, status: "Amanhã" },
    { id: "cp-003", vencimento: "Em 2 dias", nome: "Fornecedor de equipamentos", categoria: "Estoque", valor: 156300.5, dias: 2, status: "Em 2 dias" },
    { id: "cp-004", vencimento: "Vencido", nome: "Manutenção predial", categoria: "Administrativo", valor: 11200, dias: -1, status: "Vencido" },
  ];
  const kpis = [
    { id: "notas", title: "Notas lançadas", value: 128, type: "number", icon: "FileText", trend: previousTrend(128, 114), trendLabel: "vs ontem" },
    { id: "faturamento", title: "Faturamento atual", value: currency(245830.4), type: "currency", icon: "Wallet", trend: previousTrend(245830.4, 228100), trendLabel: "vs ontem" },
    { id: "tickets", title: "Tickets encerrados no mês", value: 342, type: "number", icon: "ClipboardCheck", trend: previousTrend(342, 318), trendLabel: "vs mês passado" },
    { id: "pagamentos_dia", title: "Pagamentos efetuados no dia", value: currency(87642.2), type: "currency", icon: "BadgeDollarSign", trend: previousTrend(87642.2, 80100), trendLabel: "vs ontem" },
    { id: "receber_hoje", title: "Contas a receber hoje", value: currency(132410.75), type: "currency", icon: "Landmark", trend: previousTrend(132410.75, 141900, true), trendLabel: "vs ontem" },
    { id: "recebido_mes", title: "Valor recebido no mês", value: currency(1874552.3), type: "currency", icon: "CircleDollarSign", trend: previousTrend(1874552.3, 1711000), trendLabel: "vs mês passado" },
    { id: "inadimplencia", title: "Inadimplência atual", value: 4.82, type: "percent", icon: "AlertTriangle", trend: previousTrend(4.82, 4.1, true), trendLabel: "p.p. vs mês passado" },
    { id: "boletos_vencidos", title: "Boletos vencidos", value: 512, type: "number", helper: "R$ 132.410,75 em aberto", icon: "ReceiptText", trend: previousTrend(512, 488, true), trendLabel: "vs ontem" },
    { id: "mrr", title: "Receita recorrente mensal - MRR", value: currency(2984320), type: "currency", icon: "Repeat2", trend: previousTrend(2984320, 2890000), trendLabel: "vs mês passado" },
    { id: "previsao_semana", title: "Previsão de recebimento da semana", value: currency(623450), type: "currency", icon: "CalendarClock", trend: previousTrend(623450, 611000), trendLabel: "vs semana passada" },
  ];

  return {
    source: MOCK_SOURCE,
    updatedAt,
    kpis,
    lastBillings,
    receivables,
    paymentMethods,
    revenueEvolution,
    citiesRanking,
    alerts: [
      { id: "vencidos", severity: "critical", title: "Boletos vencidos", description: "512 boletos vencidos somam R$ 132.410,75 em aberto." },
      { id: "inadimplencia", severity: "warning", title: "Inadimplência acima do ideal", description: "Índice atual em 4,82%, acima da meta de 4,00%." },
      { id: "conciliacao", severity: "info", title: "Pagamentos pendentes de conciliação", description: "18 lançamentos aguardam revisão operacional." },
    ],
    operationalSummary: {
      notasLancadas: 128,
      pagamentosConciliados: 87,
      valorConciliado: 87642.2,
      ticketsResolvidos: 24,
      pendenciasAbertas: 36,
    },
    upcomingAccounts,
    extras: {
      arpu: 92.4,
      churnFinanceiro: 28400,
      receitaRecuperada: 69200,
      clientesInadimplentes: 1286,
      ticketMedio: 118.7,
      taxaRecebimento: 92.4,
    },
  };
}

function emptyDashboard() {
  return {
    source: "empty",
    updatedAt: "",
    kpis: [],
    lastBillings: [],
    receivables: [],
    paymentMethods: [],
    revenueEvolution: [],
    citiesRanking: [],
    alerts: [],
    operationalSummary: {},
    upcomingAccounts: [],
    extras: {},
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function toBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeSpreadsheetId(value) {
  const text = cleanText(value);
  if (!text) return "";
  const sheetsMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetsMatch?.[1]) return sheetsMatch[1];
  const idQueryMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch?.[1]) return idQueryMatch[1];
  return text;
}

function getSheetsServiceAccountInfo() {
  const keyFile = cleanText(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!keyFile) {
    return {
      configured: false,
      email: "",
      projectId: "",
      error: "GOOGLE_APPLICATION_CREDENTIALS não configurado.",
    };
  }

  if (serviceAccountInfoCache?.keyFile === keyFile) {
    return serviceAccountInfoCache.info;
  }

  try {
    const keyData = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    const info = {
      configured: Boolean(keyData.client_email),
      email: cleanText(keyData.client_email),
      projectId: cleanText(keyData.project_id),
      error: keyData.client_email ? "" : "JSON da Service Account sem client_email.",
    };
    serviceAccountInfoCache = { keyFile, info };
    return info;
  } catch (error) {
    const info = {
      configured: false,
      email: "",
      projectId: "",
      error: `Não foi possível ler o JSON da Service Account: ${error.message}`,
    };
    serviceAccountInfoCache = { keyFile, info };
    return info;
  }
}

function getDefaultSheetsConfig() {
  const serviceAccount = getSheetsServiceAccountInfo();
  return {
    enabled: false,
    intervalMinutes: 30,
    serviceAccountConfigured: serviceAccount.configured,
    serviceAccountEmail: serviceAccount.email,
    serviceAccountProjectId: serviceAccount.projectId,
    serviceAccountError: serviceAccount.error,
    lastRunAt: "",
    lastRunStatus: "",
    lastRunMessage: "",
    nextRunAt: "",
    sources: SHEET_TYPES.map((item) => ({
      id: item.id,
      label: item.label,
      enabled: false,
      spreadsheetId: "",
      spreadsheetUrl: "",
      sheetName: "",
      range: item.defaultRange,
      headerRow: 1,
      lastReadAt: "",
      lastStatus: "",
      lastMessage: "",
      lastRows: 0,
      lastColumns: 0,
    })),
  };
}

function mergeSheetsConfig(data = {}) {
  const defaults = getDefaultSheetsConfig();
  const incomingSources = Array.isArray(data.sources) ? data.sources : [];
  const sources = defaults.sources.map((source) => {
    const incoming = incomingSources.find((item) => item?.id === source.id) || {};
    return {
      ...source,
      ...incoming,
      enabled: toBool(incoming.enabled),
      spreadsheetId: normalizeSpreadsheetId(incoming.spreadsheetUrl || incoming.spreadsheetId),
      spreadsheetUrl: cleanText(incoming.spreadsheetUrl),
      sheetName: cleanText(incoming.sheetName),
      range: cleanText(incoming.range) || source.range,
      headerRow: Math.max(1, Number(incoming.headerRow || source.headerRow || 1)),
    };
  });

  const intervalMinutes = Math.max(5, Math.min(24 * 60, Number(data.intervalMinutes || defaults.intervalMinutes)));
  const serviceAccount = getSheetsServiceAccountInfo();
  const {
    serviceAccountConfigured: _incomingServiceAccountConfigured,
    serviceAccountEmail: _incomingServiceAccountEmail,
    serviceAccountProjectId: _incomingServiceAccountProjectId,
    serviceAccountError: _incomingServiceAccountError,
    ...persistedData
  } = data;
  return {
    ...defaults,
    ...persistedData,
    enabled: toBool(data.enabled),
    intervalMinutes,
    serviceAccountConfigured: serviceAccount.configured,
    serviceAccountEmail: serviceAccount.email,
    serviceAccountProjectId: serviceAccount.projectId,
    serviceAccountError: serviceAccount.error,
    sources,
  };
}

async function getSheetsConfig() {
  const doc = await documents.getDocument(SHEETS_CONFIG_PATH).catch(() => null);
  return mergeSheetsConfig(doc?.data || {});
}

async function saveSheetsConfig(payload = {}, user = {}) {
  const current = await getSheetsConfig();
  const next = mergeSheetsConfig({
    ...current,
    ...payload,
    sources: Array.isArray(payload.sources) ? payload.sources : current.sources,
    updatedAt: nowIso(),
    updatedBy: user?.uid || user?.email || "",
    updatedByName: user?.profile?.nome || user?.nome || user?.email || "",
  });

  await documents.upsertDocument({
    path: SHEETS_CONFIG_PATH,
    collectionPath: "financeiro_config",
    documentId: "google_sheets",
    parentPath: null,
    data: next,
  });
  return { ok: true, config: next };
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const keyFile = cleanText(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!keyFile) throw new Error("GOOGLE_APPLICATION_CREDENTIALS não configurado.");
  const auth = new google.auth.GoogleAuth({ keyFile, scopes: SHEETS_SCOPES });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

function buildSheetRange(source = {}) {
  const sheetName = cleanText(source.sheetName);
  const range = cleanText(source.range) || "A:Z";
  if (!sheetName) return range;
  const safeSheetName = sheetName.includes("'") ? sheetName.replace(/'/g, "''") : sheetName;
  return `'${safeSheetName}'!${range}`;
}

function normalizeGoogleSheetsError(error, source = {}) {
  const googleStatus = Number(error?.code || error?.status || error?.response?.status || 0);
  const googleMessage = cleanText(error?.response?.data?.error?.message || error?.errors?.[0]?.message || error?.message);
  const sourceLabel = cleanText(source.label) || "planilha";
  const friendly = new Error();

  if (googleStatus === 401 || /invalid_grant|unauthorized/i.test(googleMessage)) {
    friendly.statusCode = 400;
    friendly.message = "A credencial da Service Account está inválida, expirada ou revogada. Gere/instale um novo JSON e tente novamente.";
    return friendly;
  }

  if (googleStatus === 403 || /permission|forbidden/i.test(googleMessage)) {
    friendly.statusCode = 403;
    friendly.message = `A Service Account não tem acesso à origem "${sourceLabel}". Compartilhe a Google Planilha com o e-mail exibido em Financeiro > Configurações como Leitor.`;
    return friendly;
  }

  if (googleStatus === 404 || /not found/i.test(googleMessage)) {
    friendly.statusCode = 404;
    friendly.message = `Google Planilha não encontrada para "${sourceLabel}". Confira se o ID/link está correto e se a planilha foi compartilhada com a Service Account.`;
    return friendly;
  }

  if (googleStatus === 400 || /Unable to parse range|range|Invalid/i.test(googleMessage)) {
    friendly.statusCode = 400;
    friendly.message = `Aba ou range inválido em "${sourceLabel}". Confira o nome da aba, o intervalo e a linha do cabeçalho.`;
    return friendly;
  }

  friendly.statusCode = googleStatus >= 500 ? 502 : 400;
  friendly.message = `Falha ao ler a Google Planilha "${sourceLabel}": ${googleMessage || "erro não informado pela Google API."}`;
  return friendly;
}

async function readSheetSource(source = {}) {
  const spreadsheetId = normalizeSpreadsheetId(source.spreadsheetUrl || source.spreadsheetId);
  if (!spreadsheetId) {
    const error = new Error("Informe o ID ou link da Google Planilha.");
    error.statusCode = 400;
    throw error;
  }
  const sheets = await getSheetsClient();
  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: buildSheetRange(source),
      majorDimension: "ROWS",
    });
  } catch (error) {
    throw normalizeGoogleSheetsError(error, source);
  }
  const values = response.data.values || [];
  const headerRow = Math.max(1, Number(source.headerRow || 1));
  const rows = values.slice(headerRow).filter((row) => row.some((cell) => cleanText(cell)));
  return {
    ok: true,
    spreadsheetId,
    range: response.data.range,
    totalRows: rows.length,
    totalColumns: values.reduce((max, row) => Math.max(max, row.length), 0),
    sample: rows.slice(0, 3),
  };
}

async function appendImportLog(data = {}) {
  const id = `fin_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  await documents.upsertDocument({
    path: `${SHEETS_LOG_COLLECTION}/${id}`,
    collectionPath: SHEETS_LOG_COLLECTION,
    documentId: id,
    parentPath: null,
    data: {
      ...data,
      createdAt: nowIso(),
    },
  });
  return id;
}

async function listImportLogs(limit = 20) {
  const result = await documents.listDocuments({
    collectionPath: SHEETS_LOG_COLLECTION,
    limit: Math.max(1, Math.min(100, Number(limit || 20))),
    offset: 0,
  });
  return {
    ok: true,
    items: (result.items || [])
      .map((item) => ({ id: item.documentId, ...(item.data || {}) }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
  };
}

async function testSheetSource(sourceId) {
  const config = await getSheetsConfig();
  const source = config.sources.find((item) => item.id === sourceId);
  if (!source) {
    const error = new Error("Origem financeira não encontrada.");
    error.statusCode = 404;
    throw error;
  }
  const result = await readSheetSource(source);
  return { ok: true, sourceId, result };
}

function resolveNextRunAt(config = {}) {
  if (!config.enabled || !config.lastRunAt) return "";
  const date = new Date(config.lastRunAt);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() + Number(config.intervalMinutes || 30));
  return date.toISOString();
}

async function runSheetsImport(user = {}, options = {}) {
  const startedAt = nowIso();
  const config = await getSheetsConfig();
  const enabledSources = config.sources.filter((source) => source.enabled);
  const results = [];
  let status = "ok";
  let message = "Leitura concluída.";

  for (const source of enabledSources) {
    try {
      const result = await readSheetSource(source);
      results.push({ sourceId: source.id, label: source.label, status: "ok", ...result });
    } catch (error) {
      status = "erro";
      results.push({ sourceId: source.id, label: source.label, status: "erro", message: error?.message || "Falha na leitura." });
    }
  }

  if (!enabledSources.length) {
    status = "sem_origem";
    message = "Nenhuma planilha financeira está ativa para leitura.";
  } else if (status === "erro") {
    message = "Uma ou mais planilhas falharam na leitura.";
  }

  const sources = config.sources.map((source) => {
    const result = results.find((item) => item.sourceId === source.id);
    if (!result) return source;
    return {
      ...source,
      lastReadAt: startedAt,
      lastStatus: result.status,
      lastMessage: result.status === "ok" ? `${result.totalRows} linha(s) lida(s).` : result.message,
      lastRows: result.totalRows || 0,
      lastColumns: result.totalColumns || 0,
    };
  });

  const nextConfig = mergeSheetsConfig({
    ...config,
    sources,
    lastRunAt: startedAt,
    lastRunStatus: status,
    lastRunMessage: message,
    lastRunBy: user?.uid || user?.email || "worker",
    lastRunByName: user?.profile?.nome || user?.nome || user?.email || "Rotina automática",
  });
  nextConfig.nextRunAt = resolveNextRunAt(nextConfig);
  await saveSheetsConfig(nextConfig, user);
  await appendImportLog({ status, message, startedAt, manual: Boolean(options.manual), results });

  return { ok: status !== "erro", status, message, results, config: nextConfig };
}

async function runSheetsImportIfDue() {
  if (workerRunning) return null;
  const config = await getSheetsConfig();
  if (!config.enabled) return null;
  const nextRunAt = resolveNextRunAt(config);
  if (nextRunAt && new Date(nextRunAt).getTime() > Date.now()) return null;
  workerRunning = true;
  try {
    return await runSheetsImport({ uid: "financeiro-worker", email: "worker" });
  } finally {
    workerRunning = false;
  }
}

function startWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    runSheetsImportIfDue().catch((error) => {
      console.error("[financeiro] falha no worker de planilhas:", error?.message || error);
    });
  }, 60 * 1000);
  workerTimer.unref?.();
}

function stopWorker() {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}

async function getDashboard() {
  const doc = await documents.getDocument(DASHBOARD_PATH);
  return { ok: true, data: doc?.data || emptyDashboard() };
}

async function seedMockup(user = {}) {
  const data = {
    ...buildMockDashboard(),
    mockupEnabled: true,
    mockupGeneratedAt: nowIso(),
    mockupGeneratedBy: user?.uid || "",
    mockupGeneratedByName: user?.profile?.nome || user?.nome || user?.email || "",
  };
  await documents.upsertDocument({
    path: DASHBOARD_PATH,
    collectionPath: "financeiro_config",
    documentId: "dashboard",
    parentPath: null,
    data,
  });
  return { ok: true, data };
}

async function clearMockup() {
  await documents.upsertDocument({
    path: DASHBOARD_PATH,
    collectionPath: "financeiro_config",
    documentId: "dashboard",
    parentPath: null,
    data: emptyDashboard(),
  });
  return { ok: true, data: emptyDashboard() };
}

module.exports = {
  clearMockup,
  getDashboard,
  getSheetsConfig,
  listImportLogs,
  runSheetsImport,
  saveSheetsConfig,
  seedMockup,
  startWorker,
  stopWorker,
  testSheetSource,
};
