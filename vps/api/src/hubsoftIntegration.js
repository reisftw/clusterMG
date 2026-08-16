const documents = require("./documents");
const operationalImports = require("./operationalImports");

const CONFIG_PATH = "hubsoft_config/global";
const SYNC_JOB_COLLECTION = "hubsoft_sync_jobs";
const SYNC_RUN_COLLECTION = "hubsoft_sync_runs";
const DEFAULT_BASE_URL = "https://api.hubsoft.com.br";
const TOKEN_REFRESH_SAFETY_MS = 5 * 60 * 1000;
const syncJobPromises = new Map();

const DEFAULT_CONFIG = {
  enabled: false,
  useHubsoftAsSource: false,
  baseUrl: "",
  clientId: "",
  clientSecret: "",
  username: "",
  password: "",
  grantType: "password",
  accessToken: "",
  tokenType: "Bearer",
  tokenExpiresAt: "",
  tokenUpdatedAt: "",
  lastValidatedAt: "",
  lastError: "",
  associationStartedAt: "",
  associationStartedBy: "",
  syncMode: "preview",
  syncBusca: "numero_ordem_servico",
  syncTermos: [],
  syncStatuses: ["pendente", "aguardando_agendamento"],
  syncFontes: ["sempre", "onnet"],
  syncLimit: 50,
  syncMatchEnabled: true,
  lastSyncAt: "",
  lastSyncStatus: "",
  lastSyncMessage: "",
};

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(value) {
  const baseUrl = cleanText(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!baseUrl) return "";
  if (!/^https?:\/\//i.test(baseUrl)) return `https://${baseUrl}`;
  return baseUrl;
}

function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    enabled: config.enabled === true,
    useHubsoftAsSource: config.useHubsoftAsSource === true,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    clientId: cleanText(config.clientId),
    clientSecret: cleanText(config.clientSecret),
    username: cleanText(config.username),
    password: cleanText(config.password),
    grantType: cleanText(config.grantType || "password"),
    accessToken: cleanText(config.accessToken),
    tokenType: cleanText(config.tokenType || "Bearer"),
    syncMode: cleanText(config.syncMode || "preview") === "production" ? "production" : "preview",
    syncBusca: cleanText(config.syncBusca || "numero_ordem_servico"),
    syncTermos: Array.isArray(config.syncTermos)
      ? config.syncTermos.map(cleanText).filter(Boolean)
      : String(config.syncTermos || "").split(/[\n,;]+/).map(cleanText).filter(Boolean),
    syncStatuses: Array.isArray(config.syncStatuses)
      ? config.syncStatuses.map(cleanText).filter(Boolean)
      : ["pendente", "aguardando_agendamento"],
    syncFontes: Array.isArray(config.syncFontes)
      ? config.syncFontes.map(cleanText).filter((item) => ["sempre", "onnet"].includes(item))
      : ["sempre", "onnet"],
    syncLimit: Math.min(Math.max(Number(config.syncLimit || 50), 1), 50),
    syncMatchEnabled: config.syncMatchEnabled !== false,
  };
}

function sanitizeConfig(config = {}) {
  const normalized = normalizeConfig(config);
  const {
    clientSecret,
    password,
    accessToken,
    ...safe
  } = normalized;
  return {
    ...safe,
    clientSecret: "",
    password: "",
    accessToken: "",
    clientSecretConfigured: Boolean(clientSecret),
    passwordConfigured: Boolean(password),
    accessTokenConfigured: Boolean(accessToken),
  };
}

async function readConfig({ sanitized = true } = {}) {
  const item = await documents.getDocument(CONFIG_PATH).catch(() => null);
  const config = normalizeConfig(item?.data || {});
  return sanitized ? sanitizeConfig(config) : config;
}

function mergeSecretField(payload, current, field) {
  if (Object.prototype.hasOwnProperty.call(payload, field)) {
    const value = cleanText(payload[field]);
    if (value) return value;
  }
  return cleanText(current[field]);
}

async function saveConfig(payload = {}, user = {}) {
  const current = await readConfig({ sanitized: false });
  const next = normalizeConfig({
    ...current,
    ...payload,
    clientSecret: mergeSecretField(payload, current, "clientSecret"),
    password: mergeSecretField(payload, current, "password"),
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: user?.nome || user?.email || user?.uid || "",
  });

  if (payload.clearToken) {
    next.accessToken = "";
    next.tokenExpiresAt = "";
    next.tokenUpdatedAt = "";
  }

  await documents.upsertDocument({
    path: CONFIG_PATH,
    collectionPath: "hubsoft_config",
    documentId: "global",
    parentPath: null,
    data: next,
  });
  return sanitizeConfig(next);
}

function assertAuthConfig(config = {}) {
  const missing = [];
  if (!config.baseUrl) missing.push("Base URL");
  if (!config.clientId) missing.push("Client ID");
  if (!config.clientSecret) missing.push("Client Secret");
  if (!config.username) missing.push("Usuário");
  if (!config.password) missing.push("Senha");
  if (!config.grantType) missing.push("Grant type");
  if (missing.length) {
    const error = new Error(`Configure Hubsoft antes de validar: ${missing.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }
}

function shouldRefreshToken(config = {}) {
  if (!config.accessToken || !config.tokenExpiresAt) return true;
  const expiresAt = new Date(config.tokenExpiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt - TOKEN_REFRESH_SAFETY_MS <= Date.now();
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function buildHubsoftError(prefix, response, payload) {
  const detail = payload?.message || payload?.error || payload?.raw || "";
  const error = new Error(`${prefix}: Hubsoft HTTP ${response.status}${detail ? ` - ${detail}` : ""}`);
  error.statusCode = response.status >= 500 ? 502 : 400;
  throw error;
}

async function authenticate({ force = false } = {}) {
  const config = await readConfig({ sanitized: false });
  assertAuthConfig(config);
  if (!force && !shouldRefreshToken(config)) {
    return {
      config,
      auth: {
        reused: true,
        tokenExpiresAt: config.tokenExpiresAt,
        tokenUpdatedAt: config.tokenUpdatedAt,
      },
    };
  }

  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.username,
      password: config.password,
      grant_type: config.grantType,
    }),
  });
  const payload = await parseResponse(response);
  if (!response.ok || !payload?.access_token) {
    await saveConfig({
      ...config,
      lastError: payload?.message || payload?.error || `Hubsoft HTTP ${response.status}`,
    });
    buildHubsoftError("Falha ao autenticar", response, payload);
  }

  const now = new Date();
  const expiresInSeconds = Number(payload.expires_in || 0);
  const tokenExpiresAt = expiresInSeconds > 0
    ? new Date(now.getTime() + expiresInSeconds * 1000).toISOString()
    : "";
  const next = normalizeConfig({
    ...config,
    accessToken: payload.access_token,
    tokenType: payload.token_type || "Bearer",
    tokenExpiresAt,
    tokenUpdatedAt: now.toISOString(),
    lastValidatedAt: now.toISOString(),
    lastError: "",
  });

  await saveConfig(next);
  return {
    config: next,
    auth: {
      reused: false,
      tokenExpiresAt: next.tokenExpiresAt,
      tokenUpdatedAt: next.tokenUpdatedAt,
      expiresIn: payload.expires_in || null,
    },
  };
}

async function hubsoftRequest(path, { method = "GET", query = {}, body = null, retry = true } = {}) {
  const { config } = await authenticate();
  const url = new URL(`${config.baseUrl}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `${config.tokenType || "Bearer"} ${config.accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await parseResponse(response);
  if (response.status === 401 && retry) {
    await authenticate({ force: true });
    return hubsoftRequest(path, { method, query, body, retry: false });
  }
  if (!response.ok) {
    buildHubsoftError("Falha ao consultar", response, payload);
  }
  return payload;
}

async function testConnection() {
  const result = await authenticate({ force: true });
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    tokenExpiresAt: result.auth.tokenExpiresAt,
    tokenUpdatedAt: result.auth.tokenUpdatedAt,
    reused: result.auth.reused,
  };
}

async function searchOrdensServico(params = {}) {
  const busca = cleanText(params.busca || "codigo_cliente");
  const termoBusca = cleanText(params.termo_busca || params.termoBusca || params.termo);
  if (!termoBusca && params.allowEmptyTerm !== true) {
    const error = new Error("Informe o termo de busca para consultar O.S. no Hubsoft.");
    error.statusCode = 400;
    throw error;
  }
  return hubsoftRequest("/api/v1/integracao/cliente/ordem_servico", {
    query: {
      busca,
      termo_busca: termoBusca,
      limit: Math.min(Math.max(Number(params.limit || 20), 1), 50),
      status: cleanText(params.status),
      order_by: cleanText(params.order_by || "data_cadastro"),
      order_type: cleanText(params.order_type || "desc"),
      exibir_atendimento: params.exibir_atendimento === true ? "true" : "",
      relacoes: cleanText(params.relacoes),
    },
  });
}

function readPath(source, paths = []) {
  for (const path of paths) {
    const parts = String(path).split(".");
    let current = source;
    for (const part of parts) {
      if (current === undefined || current === null) break;
      current = current[part];
    }
    if (current !== undefined && current !== null && String(current).trim?.() !== "") return current;
  }
  return "";
}

function collectArrays(source, arrays = []) {
  if (!source || typeof source !== "object") return arrays;
  if (Array.isArray(source)) {
    if (source.length && source.some((item) => item && typeof item === "object")) arrays.push(source);
    source.forEach((item) => collectArrays(item, arrays));
    return arrays;
  }
  Object.values(source).forEach((value) => collectArrays(value, arrays));
  return arrays;
}

function extractHubsoftOrders(payload) {
  const preferred = [
    payload?.ordens_servico,
    payload?.ordem_servico,
    payload?.data?.ordens_servico,
    payload?.data?.ordem_servico,
    payload?.data?.data,
    payload?.data,
    payload?.results,
  ].filter(Array.isArray);
  if (preferred.length) return preferred.flat();
  const arrays = collectArrays(payload).sort((a, b) => b.length - a.length);
  return arrays[0] || [];
}

function normalizeHubsoftStatus(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return "Pendente";
  if (raw.includes("aguardando") && raw.includes("agendamento")) return "Aguardando Agendamento";
  if (raw.includes("pendente")) return "Pendente";
  if (raw.includes("finaliz")) return "Finalizado";
  return value;
}

function parseHubsoftLabeledText(value) {
  const text = cleanText(value);
  const match = text.match(/^\(([^)]+)\)\s*(.+)$/);
  if (!match) return { id: "", label: text };
  return {
    id: cleanText(match[1]),
    label: cleanText(match[2]),
  };
}

function parseHubsoftAddress(value) {
  const text = cleanText(value);
  const cityMatch = text.match(/,\s*([^,|/]+)\/MG/i);
  const beforeCity = cityMatch ? text.slice(0, cityMatch.index) : text;
  const parts = beforeCity.split(" - ");
  const streetPart = cleanText(parts[0]);
  const bairro = cleanText(parts[1]);
  const streetPieces = streetPart.split(",").map(cleanText).filter(Boolean);
  const numero = streetPieces.length > 1 ? streetPieces.at(-1) : "";
  const endereco = streetPieces.length > 1 ? streetPieces.slice(0, -1).join(", ") : streetPart;
  return {
    raw: text,
    cidade: cleanText(cityMatch?.[1]),
    bairro,
    endereco,
    numero,
  };
}

function normalizeHubsoftOrderRow(order = {}) {
  const cliente = order.cliente || order.cliente_servico?.cliente || order.atendimento?.cliente || {};
  const servico = order.cliente_servico || order.servico || {};
  const endereco = order.endereco || order.endereco_instalacao || servico.endereco || cliente.endereco || {};
  const clienteText = typeof cliente === "string" ? parseHubsoftLabeledText(cliente) : { id: "", label: "" };
  const servicoText = typeof servico === "string" ? parseHubsoftLabeledText(servico) : { id: "", label: "" };
  const enderecoText = typeof endereco === "string" ? parseHubsoftAddress(endereco) : null;
  const cidade = readPath(order, ["cidade", "cidade.nome", "endereco.cidade", "endereco_instalacao.cidade"]) ||
    readPath(servico, ["cidade", "cidade.nome"]) ||
    readPath(cliente, ["cidade", "cidade.nome"]) ||
    enderecoText?.cidade;
  const telefone = readPath(order, ["telefone", "telefone_primario", "celular"]) ||
    readPath(cliente, ["telefone", "telefone_primario", "celular", "fone"]);
  const numeroOs = readPath(order, [
    "numero_ordem_servico",
    "num_os",
    "numero_os",
    "numero",
    "id_ordem_servico",
    "id",
  ]);
  const tipo = readPath(order, [
    "tipo_ordem_servico",
    "tipo",
    "tipo_ordem_servico.descricao",
    "ordem_servico_tipo.descricao",
    "servico_tipo",
  ]);
  const logradouro = typeof endereco === "string"
    ? enderecoText?.endereco || endereco
    : [
        endereco.logradouro || endereco.endereco || endereco.rua,
        endereco.numero,
        endereco.bairro,
      ].filter(Boolean).join(", ");

  return {
    numero_ordem_servico: numeroOs,
    tipo_ordem_servico: tipo || "RETIRADA FTTH",
    status: normalizeHubsoftStatus(readPath(order, ["status", "status.descricao", "ordem_servico_status.descricao"])),
    cidade,
    regional: readPath(order, ["regional", "regional.nome", "regiao", "regiao.nome"]),
    codigo_cliente: readPath(order, ["codigo_cliente"]) || readPath(cliente, ["codigo_cliente", "codigo", "id_cliente", "id"]) || clienteText.id,
    nome_razaosocial: readPath(order, ["nome_razaosocial", "cliente_nome"]) || readPath(cliente, ["nome_razaosocial", "nome", "razao_social"]) || clienteText.label,
    id_cliente_servico: readPath(order, ["id_cliente_servico"]) || readPath(servico, ["id_cliente_servico", "id"]) || servicoText.id,
    servico: readPath(order, ["plano", "plano.descricao"]) || readPath(servico, ["servico", "plano", "plano.descricao", "descricao"]) || servicoText.label,
    data_cadastro: readPath(order, ["data_cadastro", "data_abertura", "data_inicio_programado"]),
    telefone,
    telefone_primario: telefone,
    telefone_secundario: readPath(cliente, ["telefone_secundario", "telefone2"]),
    telefone_terciario: readPath(cliente, ["telefone_terciario", "telefone3"]),
    mac_addr: readPath(order, ["mac_addr", "mac", "mac_address"]) || readPath(servico, ["mac_addr", "mac", "mac_address"]),
    phy_addr: readPath(order, ["phy_addr", "phy", "phy_address"]) || readPath(servico, ["phy_addr", "phy", "phy_address"]),
    tecnico: readPath(order, ["tecnico", "tecnico.nome", "usuario.nome", "responsavel.nome"]),
    endereco: logradouro,
    numero: typeof endereco === "object" ? endereco.numero || "" : enderecoText?.numero || "",
    bairro: typeof endereco === "object" ? endereco.bairro || "" : enderecoText?.bairro || "",
    coordenadas: readPath(order, ["coordenadas"]) || (
      readPath(endereco, ["latitude"]) && readPath(endereco, ["longitude"])
        ? `${readPath(endereco, ["latitude"])},${readPath(endereco, ["longitude"])}`
        : ""
    ),
  };
}

function dedupeRows(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = cleanText(row.numero_ordem_servico);
    if (!key) return;
    map.set(key, row);
  });
  return [...map.values()];
}

async function fetchSyncRows(config, jobId) {
  const statuses = config.syncStatuses.length ? config.syncStatuses : ["pendente", "aguardando_agendamento"];
  const terms = config.syncTermos.length ? config.syncTermos : [""];
  const rows = [];
  let calls = 0;
  const totalCalls = Math.max(1, statuses.length * terms.length);

  for (const status of statuses) {
    for (const term of terms) {
      calls += 1;
      await updateSyncJob(jobId, {
        stage: `Consultando Hubsoft (${calls}/${totalCalls})`,
        percent: Math.min(45, 8 + Math.round((calls / totalCalls) * 35)),
        details: { status, termo: term || "sem termo", rows: rows.length },
      });
      const payload = await searchOrdensServico({
        busca: config.syncBusca,
        termo_busca: term,
        status,
        limit: config.syncLimit,
        allowEmptyTerm: true,
        order_by: "data_cadastro",
        order_type: "desc",
      });
      rows.push(...extractHubsoftOrders(payload).map(normalizeHubsoftOrderRow));
    }
  }
  return dedupeRows(rows);
}

async function saveSyncRun(data = {}) {
  const id = data.id || `hubsoft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await documents.upsertDocument({
    path: `${SYNC_RUN_COLLECTION}/${id}`,
    collectionPath: SYNC_RUN_COLLECTION,
    documentId: id,
    parentPath: null,
    data: { id, ...data },
  });
  return id;
}

async function saveSyncJob(job = {}) {
  await documents.upsertDocument({
    path: `${SYNC_JOB_COLLECTION}/${job.id}`,
    collectionPath: SYNC_JOB_COLLECTION,
    documentId: job.id,
    parentPath: null,
    data: job,
  });
  return job;
}

async function getSyncJob(jobId) {
  const doc = await documents.getDocument(`${SYNC_JOB_COLLECTION}/${cleanText(jobId)}`);
  return doc?.data || null;
}

async function updateSyncJob(jobId, patch = {}) {
  const current = (await getSyncJob(jobId)) || { id: jobId };
  return saveSyncJob({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

async function listSyncRuns({ limit = 10 } = {}) {
  const rows = await documents.listDocuments({
    collectionPath: SYNC_RUN_COLLECTION,
    limit: Math.min(Math.max(Number(limit || 10), 1), 50),
    offset: 0,
  });
  return rows.map((row) => row.data || {}).sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
}

async function startSyncJob(options = {}, user = {}) {
  const id = `hubsoft_sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const job = {
    id,
    type: "hubsoft_sync",
    status: "queued",
    stage: "Aguardando sincronização",
    percent: 0,
    mode: cleanText(options.mode || ""),
    result: null,
    error: "",
    details: {},
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    createdBy: user?.uid || null,
    createdByName: user?.profile?.nome || user?.nome || "",
  };
  await saveSyncJob(job);
  setImmediate(() => {
    const promise = runSyncJob(id, options, user)
      .catch((error) => console.error(`[hubsoftIntegration] Falha no job ${id}:`, error))
      .finally(() => syncJobPromises.delete(id));
    syncJobPromises.set(id, promise);
  });
  return { accepted: true, jobId: id, status: job.status, stage: job.stage, percent: job.percent };
}

async function runSyncJob(jobId, options = {}, user = {}) {
  await updateSyncJob(jobId, {
    status: "running",
    stage: "Iniciando leitura Hubsoft",
    percent: 2,
    startedAt: new Date().toISOString(),
    error: "",
  });
  try {
    const config = await readConfig({ sanitized: false });
    const mode = cleanText(options.mode || config.syncMode || "preview") === "production" ? "production" : "preview";
    const rows = await fetchSyncRows(config, jobId);
    await updateSyncJob(jobId, {
      stage: mode === "production" ? "Preparando persistência do mapa" : "Prévia gerada",
      percent: mode === "production" ? 55 : 95,
      details: { rows: rows.length, mode },
    });

    let mapa = null;
    let match = null;
    if (mode === "production") {
      const payload = {
        rows,
        periodo: options.periodo || {},
        fontes: config.syncFontes.length ? config.syncFontes : ["sempre", "onnet"],
      };
      mapa = await operationalImports.persistMapaImport(payload, user, {
        update: (patch) => updateSyncJob(jobId, {
          ...patch,
          stage: `Mapa: ${patch.stage || "processando"}`,
          percent: Math.min(85, Math.max(55, Number(patch.percent || 55))),
        }),
      });
      if (config.syncMatchEnabled !== false) {
        match = await operationalImports.persistMatchImport(payload, user, {
          update: (patch) => updateSyncJob(jobId, {
            ...patch,
            stage: `Match: ${patch.stage || "processando"}`,
            percent: Math.min(96, Math.max(85, Number(patch.percent || 85))),
          }),
        });
      }
    }

    const result = {
      ok: true,
      mode,
      totalRows: rows.length,
      sample: rows.slice(0, 5),
      mapa,
      match,
      finishedAt: new Date().toISOString(),
    };
    await saveSyncRun({
      id: jobId,
      createdAt: result.finishedAt,
      createdBy: user?.uid || null,
      createdByName: user?.profile?.nome || user?.nome || "",
      status: "completed",
      mode,
      totalRows: rows.length,
      mapaTotal: mapa?.totalGeral || 0,
      matchTotal: match?.totalGeral || 0,
      error: "",
    });
    await updateSyncJob(jobId, {
      status: "completed",
      stage: "Sincronização concluída",
      percent: 100,
      result,
      finishedAt: result.finishedAt,
    });
    await saveConfig({
      lastSyncAt: result.finishedAt,
      lastSyncStatus: "completed",
      lastSyncMessage: `${rows.length} O.S. lidas do Hubsoft.`,
    }, user);
    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await saveSyncRun({
      id: jobId,
      createdAt: finishedAt,
      createdBy: user?.uid || null,
      createdByName: user?.profile?.nome || user?.nome || "",
      status: "failed",
      mode: options.mode || "",
      totalRows: 0,
      error: error?.message || "Falha ao sincronizar Hubsoft.",
    });
    await updateSyncJob(jobId, {
      status: "failed",
      stage: "Erro",
      percent: 100,
      error: error?.message || "Falha ao sincronizar Hubsoft.",
      finishedAt,
    });
    await saveConfig({
      lastSyncAt: finishedAt,
      lastSyncStatus: "failed",
      lastSyncMessage: error?.message || "Falha ao sincronizar Hubsoft.",
    }, user).catch(() => {});
    throw error;
  }
}

async function associateHubsoft(user = {}) {
  const current = await readConfig({ sanitized: false });
  if (shouldRefreshToken(current)) {
    await testConnection();
  }
  return saveConfig({
    enabled: true,
    useHubsoftAsSource: true,
    associationStartedAt: new Date().toISOString(),
    associationStartedBy: user?.nome || user?.email || user?.uid || "",
  }, user);
}

async function checkStatus() {
  const config = await readConfig({ sanitized: false });
  if (!config.enabled && !config.useHubsoftAsSource) {
    throw new Error("Hubsoft ainda nao associado ao sistema.");
  }
  const result = await authenticate();
  return {
    baseUrl: config.baseUrl,
    enabled: Boolean(config.enabled),
    useHubsoftAsSource: Boolean(config.useHubsoftAsSource),
    tokenExpiresAt: result.auth.tokenExpiresAt,
    tokenUpdatedAt: result.auth.tokenUpdatedAt,
    reusedToken: result.auth.reused,
  };
}

module.exports = {
  associateHubsoft,
  checkStatus,
  readConfig,
  saveConfig,
  searchOrdensServico,
  getSyncJob,
  listSyncRuns,
  testConnection,
  startSyncJob,
};
