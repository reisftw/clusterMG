const DEFAULT_BASE_URL = "https://playground.sempre.net.br/api";
const DEFAULT_TIMEOUT_MS = 15000;
const SEMPRE_INTEGRATION_ID = "sempre-playground-api";
const EQUIPMENT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAP_EQUIPMENT_SNAPSHOT_PATH = "estoque_equipamentos/mapa";
const MAP_EQUIPMENT_STATUS_PATH = "estoque_equipamentos/status";
const MAP_EQUIPMENT_SNAPSHOT_COLLECTION = "estoque_equipamentos";
const MAP_EQUIPMENT_SNAPSHOT_ID = "mapa";
const MAP_EQUIPMENT_STATUS_ID = "status";
const MAP_EQUIPMENT_LOG_COLLECTION = "estoque_equipamentos_logs";
const MAP_EQUIPMENT_TREATMENT_COLLECTION = "estoque_equipamentos_tratativas";
const RETIRADA_EQUIPMENT_TYPES = [
  "retirada ftth",
  "cancelamento ftth",
  "cancelamento loja",
  "retirada e cancelamento segunda tentativa",
];
const documents = require("./documents");
const equipmentLookupCache = new Map();
let mapEquipmentRefreshPromise = null;

function normalizeMac(value) {
  return String(value || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .toUpperCase();
}

function isValidEquipmentMac(value) {
  const mac = normalizeMac(value);
  return mac.length === 12 && mac !== "FFFFFFFFFFFF";
}

async function findSempreIntegration() {
  const direct = await documents.getDocument(`integracoes_api/${SEMPRE_INTEGRATION_ID}`);
  if (direct?.data) return direct.data;

  const integrations = await documents.listAllDocuments("integracoes_api");
  const found = integrations.find((item) => {
    const data = item.data || {};
    const haystack = `${data.name || ""} ${data.provider || ""} ${data.baseUrl || ""}`.toLowerCase();
    return haystack.includes("sempre") || haystack.includes("playground.sempre.net.br");
  });
  return found?.data || null;
}

function decodeJwtPayload(token) {
  const raw = String(token || "").replace(/^Bearer\s+/i, "");
  const [, payload] = raw.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function isTokenValid(token, skewSeconds = 120) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return Boolean(token);
  return Number(payload.exp) * 1000 > Date.now() + skewSeconds * 1000;
}

function normalizeBearer(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
}

async function getSempreConfig() {
  const integration = await findSempreIntegration();
  const token = String(integration?.secretValue || "").trim();
  return {
    active: integration?.active !== false,
    baseUrl: String(integration?.baseUrl || process.env.SEMPRE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    token,
    refreshToken: String(integration?.refreshToken || "").trim(),
    loginEmail: String(integration?.loginEmail || "").trim(),
    loginPassword: String(integration?.loginPassword || "").trim(),
    sistemaId: Number(integration?.sistemaId || process.env.SEMPRE_API_SISTEMA_ID || 6),
    timeoutMs: Number(integration?.timeoutMs || process.env.SEMPRE_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function requireSempreToken(config) {
  if (!config.active) {
    const error = new Error("Integracao Sempre esta desativada.");
    error.statusCode = 503;
    throw error;
  }
  if (!config.token) {
    const error = new Error("Token da API Sempre nao configurado na Central de Integracoes.");
    error.statusCode = 503;
    throw error;
  }
}

async function rawSempreRequest(config, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(config.token ? { authorization: normalizeBearer(config.token) } : {}),
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `Erro Sempre HTTP ${response.status}.`);
      error.statusCode = response.status;
      error.details = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Tempo esgotado ao consultar API Sempre.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function updateSempreIntegrationToken(data = {}) {
  const current = await findSempreIntegration();
  const accessToken = data.access_token || data.token || "";
  const refreshToken = data.refresh_token || "";
  if (!accessToken) return null;

  const payload = {
    ...(current || {}),
    name: current?.name || "API Sempre Playground",
    provider: current?.provider || "Sempre / Playground",
    baseUrl: current?.baseUrl || DEFAULT_BASE_URL,
    environment: current?.environment || "production",
    active: current?.active !== false,
    authType: "bearer",
    authLocation: "header",
    credentialRef: current?.credentialRef || "Token atualizado automaticamente",
    secretValue: accessToken,
    refreshToken: refreshToken || current?.refreshToken || "",
    tokenUpdatedAt: new Date().toISOString(),
    tokenExpiresAt: decodeJwtPayload(accessToken)?.exp
      ? new Date(Number(decodeJwtPayload(accessToken).exp) * 1000).toISOString()
      : null,
    updatedAt: new Date().toISOString(),
  };

  await documents.upsertDocument({
    path: `integracoes_api/${SEMPRE_INTEGRATION_ID}`,
    collectionPath: "integracoes_api",
    documentId: SEMPRE_INTEGRATION_ID,
    parentPath: null,
    data: payload,
  });
  return accessToken;
}

async function refreshSempreToken(config) {
  if (!config.refreshToken) return "";
  try {
    const data = await rawSempreRequest(config, "/auth", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: normalizeBearer(config.refreshToken),
      },
      body: "{}",
    });
    return await updateSempreIntegrationToken(data);
  } catch {
    return "";
  }
}

async function loginSempre(config) {
  if (!config.loginEmail || !config.loginPassword) return "";
  const data = await rawSempreRequest(config, "/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: config.loginEmail,
      senha: config.loginPassword,
    }),
  });
  return await updateSempreIntegrationToken(data);
}

async function ensureSempreToken(config) {
  requireSempreToken({ ...config, token: config.token || config.refreshToken || config.loginPassword });
  if (isTokenValid(config.token)) return config.token;

  const refreshed = await refreshSempreToken(config);
  if (refreshed) return refreshed;

  const logged = await loginSempre(config);
  if (logged) return logged;

  const error = new Error("Token da API Sempre expirado. Cadastre novo token ou e-mail/senha na Central de Integracoes.");
  error.statusCode = 401;
  throw error;
}

async function requestSempre(path, options = {}) {
  const config = await getSempreConfig();
  const token = await ensureSempreToken(config);
  const requestOptions = (nextToken) => ({
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: normalizeBearer(nextToken),
    },
  });

  try {
    return await rawSempreRequest({ ...config, token }, path, requestOptions(token));
  } catch (error) {
    if (error?.statusCode !== 401) throw error;
    const refreshed = await refreshSempreToken(config);
    const nextToken = refreshed || (await loginSempre(config));
    if (!nextToken) throw error;
    return rawSempreRequest({ ...config, token: nextToken }, path, requestOptions(nextToken));
  }
}

function sanitizeCpfCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function slug(value) {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 80) || "sem-id";
}

function textIncludes(value, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return normalizeText(value).includes(normalizedQuery);
}

function isSamePersonName(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function hasEmailLikeValue(value) {
  return /@/.test(String(value || ""));
}

function pickFirst(data = {}, keys = []) {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function buildMacCandidatesFromOrder(data = {}) {
  const values = [
    data.mac_addr,
    data.phy_addr,
    ...(Array.isArray(data.macs_equipamento) ? data.macs_equipamento : []),
  ];
  return [...new Set(values.map(normalizeMac).filter(isValidEquipmentMac))];
}

function normalizeDisplayMac(value) {
  const mac = normalizeMac(value);
  return isValidEquipmentMac(mac) ? mac : "";
}

function isRetiradaEquipmentType(value) {
  const text = normalizeText(value);
  return RETIRADA_EQUIPMENT_TYPES.some((type) => text.includes(type));
}

function classifyEquipmentLink({ order = {}, lookup = {} }) {
  if (lookup.error) {
    return {
      status: "erro_consulta",
      label: "Erro na consulta",
      tone: "red",
      responsibleName: "",
      responsibleKind: "",
      reason: lookup.error,
    };
  }

  if (!lookup.found || !lookup.primary) {
    return {
      status: "nao_encontrado",
      label: "Nao encontrado",
      tone: "orange",
      responsibleName: "",
      responsibleKind: "",
      reason: "A API Sempre nao retornou vinculo para este MAC.",
    };
  }

  const primary = lookup.primary || {};
  const stockLocal = lookup.stockLocal || {};
  const clientName = normalizeText(order.nomeCliente);
  const linkedName = primary.vinculadoEm || primary.origemStatus || stockLocal.display || stockLocal.descricao || "";
  const linkedText = normalizeText(linkedName);
  const stockText = normalizeText(`${primary.estoqueLocal || ""} ${stockLocal.descricao || ""} ${stockLocal.prefixo || ""} ${stockLocal.display || ""}`);
  const statusText = normalizeText(`${primary.status || ""} ${primary.vinculadoTipo || ""} ${primary.origemStatus || ""}`);

  if (clientName && linkedText && (linkedText.includes(clientName) || clientName.includes(linkedText))) {
    return {
      status: "com_cliente",
      label: "Com cliente",
      tone: "green",
      responsibleName: linkedName,
      responsibleKind: "cliente",
      reason: "O nome vinculado na Sempre bate com o cliente do mapa.",
    };
  }

  if (stockText.includes("estoque") || statusText.includes("estoque")) {
    return {
      status: "em_estoque",
      label: "Em estoque",
      tone: "blue",
      responsibleName: stockLocal.display || stockLocal.descricao || primary.estoqueLocal || "",
      responsibleKind: "estoque",
      reason: "O equipamento esta apontando para estoque/local.",
    };
  }

  if (linkedName) {
    return {
      status: "outro_vinculo",
      label: "Outro vinculo",
      tone: "red",
      responsibleName: linkedName,
      responsibleKind: hasEmailLikeValue(linkedName) || !isSamePersonName(linkedName, order.nomeCliente)
        ? "tecnico"
        : "cliente",
      reason: "O equipamento esta vinculado a outro nome/local.",
    };
  }

  return {
    status: "indefinido",
    label: "Sem confirmacao",
    tone: "orange",
    responsibleName: "",
    responsibleKind: "",
    reason: "A API retornou equipamento, mas sem nome/local suficiente para confirmar.",
  };
}

function chooseWorstClassification(results = []) {
  const priority = {
    erro_consulta: 6,
    outro_vinculo: 5,
    em_estoque: 4,
    nao_encontrado: 3,
    indefinido: 2,
    com_cliente: 1,
  };
  return results.reduce((best, item) => {
    const current = item.classification || {};
    if (!best) return current;
    return (priority[current.status] || 0) > (priority[best.status] || 0) ? current : best;
  }, null) || {
    status: "indefinido",
    label: "Sem confirmacao",
    tone: "orange",
    responsibleName: "",
    reason: "",
  };
}

function buildTreatmentId(item = {}) {
  const base = item.documentId || item.numero || item.path || "ordem";
  const macs = Array.isArray(item.macs) ? item.macs.join("-") : "";
  return `${slug(base)}_${slug(macs || "sem-mac")}`.slice(0, 150);
}

async function consultEquipmentCached(mac) {
  const cached = equipmentLookupCache.get(mac);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await consultEquipment(mac);
  equipmentLookupCache.set(mac, {
    value,
    expiresAt: Date.now() + EQUIPMENT_CACHE_TTL_MS,
  });
  return value;
}

function simplifyEquipmentResult(item = {}) {
  return {
    estoqueLocalId: item.estoque_local_id || "",
    estoqueLocal: item.estoque_local || "",
    serie: item.serie || "",
    origemStatus: item.origem_status || "",
    produtoNome: item.produto_nome || "",
    produtoId: item.produto_id || "",
    vinculadoTipo: item.vinculado_tipo || "",
    vinculadoId: item.vinculado_id || null,
    status: item.status || "",
    vinculadoEm: item.vinculado_em || "",
    recondicionado: item.recondicionado === true,
    cpfCnpjMascarado: sanitizeCpfCnpj(item.cpf_cnpj),
    sistema: item.sistema || "",
  };
}

function simplifyStockLocal(item = {}) {
  return {
    id: item.id || null,
    descricao: item.descricao || "",
    externoId: item.externo_id || "",
    seniorId: item.senior_id || "",
    prefixo: item.prefixo || "",
    empresa: item.empresa
      ? {
          id: item.empresa.id || null,
          nome: item.empresa.nome_razaosocial || "",
          cidade: item.empresa.cidade || "",
          uf: item.empresa.uf || "",
        }
      : null,
    display: item.display || "",
  };
}

function simplifyNote(item = {}, mac) {
  const itens = Array.isArray(item.itens) ? item.itens : [];
  const matchedItems = itens
    .filter((noteItem) => normalizeMac(noteItem?.serie) === mac)
    .map((noteItem) => ({
      id: noteItem.id || null,
      serie: noteItem.serie || "",
      quantidade: noteItem.quantidade ?? null,
      valorUnitario: noteItem.valor_unitario ?? null,
      valorTotal: noteItem.valor_total ?? null,
      produto: noteItem.produto
        ? {
            id: noteItem.produto.id || null,
            descricao: noteItem.produto.descricao || "",
            controladoPorSerie: noteItem.produto.controlado_por_serie === true,
          }
        : null,
      estoqueOrigem: noteItem.estoque_local_origem
        ? {
            id: noteItem.estoque_local_origem.id || null,
            descricao: noteItem.estoque_local_origem.descricao || "",
            seniorId: noteItem.estoque_local_origem.senior_id || "",
            prefixo: noteItem.estoque_local_origem.prefixo || "",
            display: noteItem.estoque_local_origem.display || "",
          }
        : null,
      estoqueDestino: noteItem.estoque_local_destino
        ? {
            id: noteItem.estoque_local_destino.id || null,
            descricao: noteItem.estoque_local_destino.descricao || "",
            seniorId: noteItem.estoque_local_destino.senior_id || "",
            prefixo: noteItem.estoque_local_destino.prefixo || "",
            display: noteItem.estoque_local_destino.display || "",
          }
        : null,
    }));

  return {
    id: item.id || null,
    numero: item.numero || "",
    situacao: item.situacao || "",
    status: item.status || "",
    criadoEm: item.criado_em || null,
    atualizadoEm: item.atualizado_em || null,
    emitidoEm: item.emitido_em || null,
    observacao: item.observacao || "",
    tipoOperacao: item.tipo_operacao
      ? {
          id: item.tipo_operacao.id || null,
          descricao: item.tipo_operacao.descricao || "",
        }
      : null,
    empresa: item.empresa
      ? {
          id: item.empresa.id || null,
          nome: item.empresa.nome_razaosocial || "",
          cidade: item.empresa.cidade || "",
          uf: item.empresa.uf || "",
        }
      : null,
    parceiro: item.parceiro
      ? {
          id: item.parceiro.id || null,
          nome: item.parceiro.nome_razaosocial || item.parceiro.nome || "",
        }
      : null,
    sistemaOrigem: item.sistema_origem
      ? {
          id: item.sistema_origem.id || null,
          nome: item.sistema_origem.nome || "",
          prefixo: item.sistema_origem.prefixo || "",
        }
      : null,
    itens: matchedItems,
  };
}

async function consultEquipment(macRaw) {
  const mac = normalizeMac(macRaw);
  if (!isValidEquipmentMac(mac)) {
    const error = new Error("MAC invalido. Informe 12 caracteres hexadecimais.");
    error.statusCode = 400;
    throw error;
  }

  const config = await getSempreConfig();
  const data = await requestSempre("/nota/consulta/serie", {
    method: "POST",
    body: JSON.stringify({
      series: [mac],
      sistema_id: config.sistemaId,
    }),
  });
  const equipment = Array.isArray(data) ? data.map(simplifyEquipmentResult) : [];
  const primary = equipment[0] || null;
  let stockLocal = null;

  if (primary?.estoqueLocalId) {
    const params = new URLSearchParams({
      page: "1",
      limit: "1",
    });
    params.append("filter.senior_id", `$eq:${primary.estoqueLocalId}`);
    const stockData = await requestSempre(`/estoque_local?${params.toString()}`);
    stockLocal = Array.isArray(stockData?.data) && stockData.data[0]
      ? simplifyStockLocal(stockData.data[0])
      : null;
  }

  return {
    ok: true,
    mac,
    found: equipment.length > 0,
    equipment,
    primary,
    stockLocal,
  };
}

async function consultHistory(macRaw, { limit = 20, page = 1 } = {}) {
  const mac = normalizeMac(macRaw);
  if (!isValidEquipmentMac(mac)) {
    const error = new Error("MAC invalido. Informe 12 caracteres hexadecimais.");
    error.statusCode = 400;
    throw error;
  }

  const params = new URLSearchParams({
    page: String(Math.max(1, Number(page) || 1)),
    limit: String(Math.min(50, Math.max(1, Number(limit) || 20))),
  });
  params.append("filter.itens.serie", `$eq:${mac}`);

  const data = await requestSempre(`/nota?${params.toString()}`);
  const notes = Array.isArray(data?.data)
    ? data.data.map((item) => simplifyNote(item, mac))
    : [];

  return {
    ok: true,
    mac,
    notes,
    meta: data?.meta || null,
  };
}

function paginate(items = [], { page = 1, limit = 20 } = {}) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const offset = (normalizedPage - 1) * normalizedLimit;
  return {
    page: normalizedPage,
    limit: normalizedLimit,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / normalizedLimit)),
    items: items.slice(offset, offset + normalizedLimit),
  };
}

async function runLimited(items, limit, task, onProgress = null) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await task(items[currentIndex], currentIndex);
      if (onProgress) await onProgress(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function saveMapEquipmentStatus(status = {}) {
  const data = {
    updatedAt: new Date().toISOString(),
    ...status,
  };
  await documents.upsertDocument({
    path: MAP_EQUIPMENT_STATUS_PATH,
    collectionPath: MAP_EQUIPMENT_SNAPSHOT_COLLECTION,
    documentId: MAP_EQUIPMENT_STATUS_ID,
    parentPath: null,
    data,
  });
  return data;
}

async function getMapEquipmentStatus() {
  const doc = await documents.getDocument(MAP_EQUIPMENT_STATUS_PATH);
  return doc?.data || null;
}

function buildPreviousLookupMap(snapshot = {}) {
  const lookup = new Map();
  for (const item of snapshot.items || []) {
    for (const result of item.results || []) {
      if (!isValidEquipmentMac(result.mac)) continue;
      lookup.set(result.mac, {
        ok: !result.error,
        mac: result.mac,
        found: result.found === true,
        primary: result.primary || null,
        stockLocal: result.stockLocal || null,
        error: result.error || "",
        cachedFromSnapshot: true,
      });
    }
  }
  return lookup;
}

function buildReturnedLogs({ previousSnapshot = {}, currentMacs = new Set(), generatedAt }) {
  const logs = [];
  const seen = new Set();
  for (const item of previousSnapshot.items || []) {
    if (!item.responsibleName) continue;
    for (const mac of item.macs || []) {
      if (!isValidEquipmentMac(mac) || currentMacs.has(mac) || seen.has(mac)) continue;
      seen.add(mac);
      logs.push({
        id: `devolucao_${mac}`,
        tipo: "devolucao_estoque",
        mac,
        responsavelAnterior: item.responsibleName,
        clienteAnterior: item.nomeCliente || "",
        osAnterior: item.numero || "",
        cidadeAnterior: item.cidade || "",
        tipoOsAnterior: item.tipo || "",
        message: `MAC ${mac} saiu da bolsa de ${item.responsibleName} e foi considerado devolvido ao estoque.`,
        createdAt: generatedAt,
      });
    }
  }
  return logs;
}

async function saveReturnedLogs(logs = []) {
  for (const log of logs) {
    await documents.upsertDocument({
      path: `${MAP_EQUIPMENT_LOG_COLLECTION}/${log.id}`,
      collectionPath: MAP_EQUIPMENT_LOG_COLLECTION,
      documentId: log.id,
      parentPath: null,
      data: log,
    });
  }
}

async function listTreatmentMap() {
  const docs = await documents.listAllDocuments(MAP_EQUIPMENT_TREATMENT_COLLECTION);
  const map = new Map();
  for (const doc of docs) {
    const data = doc.data || {};
    map.set(data.id || doc.documentId, {
      id: data.id || doc.documentId,
      status: data.status || "pendente",
      observacao: data.observacao || "",
      responsavel: data.responsavel || "",
      resolvidoEm: data.resolvidoEm || null,
      updatedAt: data.updatedAt || doc.updatedAt || null,
      updatedByName: data.updatedByName || "",
    });
  }
  return map;
}

async function buildAcertoIndex() {
  const docs = await documents.listAllDocuments("acerto_estoque_acertos");
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const byName = new Map();
  for (const doc of docs) {
    const data = doc.data || {};
    const createdAt = new Date(data.createdAt || data.dataAcerto || 0).getTime();
    if (Number.isFinite(createdAt) && createdAt > 0 && createdAt < cutoff) continue;
    const names = [
      ...(Array.isArray(data.tecnicoNomes) ? data.tecnicoNomes : []),
      data.tecnicoNome,
      ...(Array.isArray(data.tecnicoLancamentos)
        ? data.tecnicoLancamentos.map((item) => item?.tecnicoNome)
        : []),
    ].filter(Boolean);
    for (const name of names) {
      const key = normalizeText(name);
      if (!key) continue;
      const current = byName.get(key) || [];
      current.push({
        id: data.id || doc.documentId,
        codigo: data.codigo || doc.documentId,
        dataAcerto: data.dataAcerto || data.createdAt || "",
        cidade: data.cidade || "",
        turno: data.turno || "",
      });
      byName.set(key, current.slice(0, 5));
    }
  }
  return byName;
}

function buildTreatmentSummary(items = []) {
  return items.reduce((acc, item) => {
    const status = item.tratativa?.status || "pendente";
    acc[status] = (acc[status] || 0) + 1;
    acc.total += 1;
    if (status === "resolvido") acc.resolvidos += 1;
    if (item.classificationStatus !== "com_cliente" && status !== "resolvido" && status !== "ignorado") {
      acc.abertos += 1;
    }
    return acc;
  }, {
    total: 0,
    abertos: 0,
    resolvidos: 0,
    pendente: 0,
    em_analise: 0,
    cobrado_tecnico: 0,
    resolvido: 0,
    ignorado: 0,
  });
}

function itemMatchesFilters(item = {}, filters = {}) {
  const status = String(filters.status || "").trim();
  if (status && status !== "todos" && item.classificationStatus !== status) return false;
  if (filters.cidade && !textIncludes(item.cidade, filters.cidade)) return false;
  if (filters.tecnico && !textIncludes(`${item.tecnico || ""} ${item.responsibleName || ""}`, filters.tecnico)) return false;
  if (filters.estoque) {
    const haystack = (item.results || [])
      .map((result) => `${result.stockLocal?.descricao || ""} ${result.stockLocal?.display || ""} ${result.primary?.estoqueLocal || ""}`)
      .join(" ");
    if (!textIncludes(haystack, filters.estoque)) return false;
  }
  if (filters.empresa) {
    const haystack = (item.results || [])
      .map((result) => `${result.stockLocal?.empresa?.nome || ""} ${result.primary?.sistema || ""}`)
      .join(" ");
    if (!textIncludes(haystack, filters.empresa)) return false;
  }
  if (filters.query) {
    const haystack = [
      item.numero,
      item.nomeCliente,
      item.cidade,
      item.regional,
      item.tecnico,
      item.responsibleName,
      ...(item.macs || []),
    ].join(" ");
    if (!textIncludes(haystack, filters.query)) return false;
  }
  return true;
}

function isRealResponsibleForBag(item = {}) {
  if (!item.responsibleName) return false;
  if (item.classificationStatus === "nao_encontrado") return false;
  if (item.classificationStatus === "com_cliente") return false;
  if (isSamePersonName(item.responsibleName, item.nomeCliente)) return false;
  return true;
}

function buildFilterOptions(items = []) {
  const collect = (getter) => [...new Set(items.map(getter).map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {
    cidades: collect((item) => item.cidade),
    tecnicos: collect((item) => item.tecnico),
    vinculos: collect((item) => item.responsibleName),
    estoques: collect((item) => {
      const result = item.results?.[0] || {};
      return result.stockLocal?.descricao || result.stockLocal?.display || result.primary?.estoqueLocal || "";
    }),
    empresas: collect((item) => {
      const result = item.results?.[0] || {};
      return result.stockLocal?.empresa?.nome || result.primary?.sistema || "";
    }),
  };
}

function buildTecnicoGroups(items = []) {
  const grouped = new Map();
  for (const item of items.filter((entry) => entry.classificationStatus !== "com_cliente" && entry.classificationStatus !== "nao_encontrado")) {
    const key = item.tecnico || "Sem tecnico";
    if (!grouped.has(key)) grouped.set(key, { tecnico: key, total: 0, items: [] });
    const group = grouped.get(key);
    group.total += 1;
    group.items.push(item);
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function buildBagGroups(items = []) {
  const holders = new Map();
  const holdersByType = new Map();
  for (const item of items.filter(isRealResponsibleForBag)) {
    const key = item.responsibleName || "Sem responsavel";
    if (!holders.has(key)) {
      holders.set(key, {
        nome: key,
        totalEquipamentos: 0,
        totalOrdens: 0,
        status: {},
        items: [],
      });
    }
    const holder = holders.get(key);
    holder.totalOrdens += 1;
    holder.totalEquipamentos += item.macs?.length || 0;
    holder.status[item.classificationStatus] = (holder.status[item.classificationStatus] || 0) + 1;
    holder.items.push(item);

    const typeKey = item.tipo || "Sem tipo";
    if (!holdersByType.has(typeKey)) {
      holdersByType.set(typeKey, {
        tipo: typeKey,
        totalOrdens: 0,
        totalEquipamentos: 0,
        responsaveis: new Map(),
      });
    }
    const typeGroup = holdersByType.get(typeKey);
    typeGroup.totalOrdens += 1;
    typeGroup.totalEquipamentos += item.macs?.length || 0;
    if (!typeGroup.responsaveis.has(key)) {
      typeGroup.responsaveis.set(key, {
        nome: key,
        totalOrdens: 0,
        totalEquipamentos: 0,
        items: [],
      });
    }
    const typeHolder = typeGroup.responsaveis.get(key);
    typeHolder.totalOrdens += 1;
    typeHolder.totalEquipamentos += item.macs?.length || 0;
    typeHolder.items.push(item);
  }

  return {
    equipamentosPorResponsavel: [...holders.values()].sort((a, b) => b.totalEquipamentos - a.totalEquipamentos),
    bolsaPorTipo: [...holdersByType.values()]
      .map((group) => ({
        ...group,
        responsaveis: [...group.responsaveis.values()].sort((a, b) => b.totalEquipamentos - a.totalEquipamentos),
      }))
      .sort((a, b) => b.totalEquipamentos - a.totalEquipamentos),
  };
}

async function enrichSnapshotForResponse(snapshot = {}) {
  const treatmentMap = await listTreatmentMap();
  const acertoIndex = await buildAcertoIndex();
  const items = (snapshot.items || []).map((item) => {
    const treatmentId = item.treatmentId || buildTreatmentId(item);
    const acertosResponsavel = acertoIndex.get(normalizeText(item.responsibleName)) || [];
    const tratativa = treatmentMap.get(treatmentId) || {
      id: treatmentId,
      status: item.classificationStatus === "com_cliente" ? "resolvido" : "pendente",
      observacao: "",
      responsavel: "",
      updatedAt: null,
      updatedByName: "",
    };
    return {
      ...item,
      treatmentId,
      tratativa,
      acertoProgramado: acertosResponsavel[0] || null,
      acertosResponsavel,
    };
  });
  const itemByTreatmentId = new Map(items.map((item) => [item.treatmentId, item]));
  const enrichItemList = (list = []) =>
    list.map((item) => itemByTreatmentId.get(item.treatmentId || buildTreatmentId(item)) || item);
  const gruposTecnicos = (snapshot.gruposTecnicos || []).map((group) => ({
    ...group,
    items: enrichItemList(group.items || []),
  }));
  const equipamentosPorResponsavel = (snapshot.equipamentosPorResponsavel || []).map((holder) => ({
    ...holder,
    items: enrichItemList(holder.items || []),
  }));
  const bolsaPorTipo = (snapshot.bolsaPorTipo || []).map((group) => ({
    ...group,
    responsaveis: (group.responsaveis || []).map((holder) => ({
      ...holder,
      items: enrichItemList(holder.items || []),
    })),
  }));

  const openDivergences = items.filter((item) =>
    item.classificationStatus !== "com_cliente" &&
    !["resolvido", "ignorado"].includes(item.tratativa?.status),
  );
  const repeatedMacs = new Map();
  for (const item of items) {
    for (const mac of item.macs || []) {
      const list = repeatedMacs.get(mac) || [];
      list.push(item);
      repeatedMacs.set(mac, list);
    }
  }
  const duplicateMacs = [...repeatedMacs.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([mac, list]) => ({
      mac,
      total: list.length,
      ordens: list.map((item) => ({
        numero: item.numero,
        cliente: item.nomeCliente,
        cidade: item.cidade,
      })),
    }));

  return {
    ...snapshot,
    items,
    gruposTecnicos,
    equipamentosPorResponsavel,
    bolsaPorTipo,
    treatmentSummary: buildTreatmentSummary(items),
    alertas: {
      divergenciasAbertas: openDivergences.length,
      macsDuplicados: duplicateMacs.length,
      naoEncontrados: openDivergences.filter((item) => item.classificationStatus === "nao_encontrado").length,
      outroVinculo: openDivergences.filter((item) => item.classificationStatus === "outro_vinculo").length,
      emEstoque: openDivergences.filter((item) => item.classificationStatus === "em_estoque").length,
      acertoProgramado: items.filter((item) => item.acertoProgramado).length,
      duplicateMacs: duplicateMacs.slice(0, 50),
    },
  };
}

async function buildMapEquipmentsSnapshot({ trigger = "manual", forceFull = false } = {}) {
  const startedAt = new Date().toISOString();
  await saveMapEquipmentStatus({
    running: true,
    stage: "Lendo ordens do mapa",
    trigger,
    startedAt,
    finishedAt: null,
    processedMacs: 0,
    totalMacs: 0,
    remainingMacs: 0,
    percent: 0,
    error: "",
  });

  const previousSnapshotDoc = await documents.getDocument(MAP_EQUIPMENT_SNAPSHOT_PATH);
  const previousSnapshot = previousSnapshotDoc?.data || {};
  const previousLookupByMac = forceFull ? new Map() : buildPreviousLookupMap(previousSnapshot);
  const orders = await documents.listAllDocuments("ordens_abertas");
  const eligibleOrders = orders
    .map((item) => ({ item, data: item.data || {} }))
    .filter(({ data }) => isRetiradaEquipmentType(pickFirst(data, ["tipo", "servico_tipo", "servico", "tipo_os"])));

  const withMac = eligibleOrders
    .map(({ item, data }) => {
      const macs = buildMacCandidatesFromOrder(data);
      const order = {
        path: item.path,
        documentId: item.documentId,
        numero: pickFirst(data, ["num_os", "numero_os", "os", "numero", "id_os"]) || item.documentId,
        codigoCliente: pickFirst(data, ["codigo_cliente", "cod_cliente", "cliente_id", "contrato"]),
        nomeCliente: pickFirst(data, ["nome_cliente", "cliente", "assinante", "nome", "razao_social"]),
        cidade: pickFirst(data, ["cidade", "municipio"]),
        regional: pickFirst(data, ["regional", "regional_nome"]),
        tecnico: pickFirst(data, ["tecnico", "tecnico_nome", "agente_nome", "responsavel", "equipe"]) || "Sem tecnico",
        statusOs: pickFirst(data, ["status", "situacao"]),
        tipo: pickFirst(data, ["tipo", "servico_tipo", "servico", "tipo_os"]),
        endereco: pickFirst(data, ["endereco", "logradouro"]),
        macAddr: normalizeDisplayMac(data.mac_addr),
        phyAddr: normalizeDisplayMac(data.phy_addr),
        macs,
      };
      return { order, macs };
    })
    .filter((item) => item.macs.length);

  const lookupByMac = new Map();
  const uniqueMacs = [...new Set(withMac.flatMap((item) => item.macs))];
  const currentMacSet = new Set(uniqueMacs);
  const macsToConsult = uniqueMacs.filter((mac) => !previousLookupByMac.has(mac));
  let processedMacs = uniqueMacs.length - macsToConsult.length;

  const updateProgress = async (stage, force = false) => {
    if (!force && processedMacs % 5 !== 0 && processedMacs < uniqueMacs.length) return;
    const percent = uniqueMacs.length
      ? Math.round((processedMacs / uniqueMacs.length) * 100)
      : 100;
    await saveMapEquipmentStatus({
      running: true,
      stage,
      trigger,
      startedAt,
      finishedAt: null,
      totalMacs: uniqueMacs.length,
      processedMacs,
      remainingMacs: Math.max(uniqueMacs.length - processedMacs, 0),
      percent,
      totalOrdensMapa: orders.length,
      totalOrdensElegiveis: eligibleOrders.length,
      totalOrdensComMac: withMac.length,
      totalMacsNovos: macsToConsult.length,
      totalMacsReaproveitados: uniqueMacs.length - macsToConsult.length,
      error: "",
    });
  };

  for (const mac of uniqueMacs) {
    if (previousLookupByMac.has(mac)) lookupByMac.set(mac, previousLookupByMac.get(mac));
  }

  await updateProgress("Consultando MACs novos na API Sempre", true);

  await runLimited(macsToConsult, 4, async (mac) => {
    try {
      lookupByMac.set(mac, await consultEquipmentCached(mac));
    } catch (error) {
      lookupByMac.set(mac, {
        ok: false,
        mac,
        found: false,
        primary: null,
        stockLocal: null,
        error: error?.message || "Falha ao consultar API Sempre.",
      });
    }
  }, async () => {
    processedMacs += 1;
    await updateProgress("Consultando MACs novos na API Sempre");
  });

  processedMacs = uniqueMacs.length;
  await updateProgress("Montando resumo e logs", true);

  const items = withMac.map(({ order, macs }) => {
    const results = macs.map((mac) => {
      const lookup = lookupByMac.get(mac) || {};
      const classification = classifyEquipmentLink({ order, lookup });
      return {
        mac,
        found: lookup.found === true,
        primary: lookup.primary || null,
        stockLocal: lookup.stockLocal || null,
        error: lookup.error || "",
        classification,
      };
    });
    const classification = chooseWorstClassification(results);
    const responsibleIsClient = isSamePersonName(classification.responsibleName, order.nomeCliente);
    return {
      ...order,
      treatmentId: buildTreatmentId(order),
      results,
      classification,
      classificationStatus: classification.status,
      classificationLabel: classification.label,
      responsibleName: classification.responsibleName || "",
      responsibleKind: responsibleIsClient ? "cliente" : classification.responsibleKind || "",
      responsibleIsClient,
    };
  });

  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    acc[item.classificationStatus] = (acc[item.classificationStatus] || 0) + 1;
    if (item.classificationStatus !== "com_cliente") acc.divergentes += 1;
    return acc;
  }, {
    total: 0,
    com_cliente: 0,
    em_estoque: 0,
    outro_vinculo: 0,
    nao_encontrado: 0,
    indefinido: 0,
    erro_consulta: 0,
    divergentes: 0,
  });

  const grouped = new Map();
  for (const item of items.filter((entry) => entry.classificationStatus !== "com_cliente" && entry.classificationStatus !== "nao_encontrado")) {
    const key = item.tecnico || "Sem tecnico";
    if (!grouped.has(key)) grouped.set(key, { tecnico: key, total: 0, items: [] });
    const group = grouped.get(key);
    group.total += 1;
    group.items.push(item);
  }

  const holders = new Map();
  const holdersByType = new Map();
  for (const item of items.filter(isRealResponsibleForBag)) {
    const key = item.responsibleName || "Sem responsavel";
    if (!holders.has(key)) {
      holders.set(key, {
        nome: key,
        totalEquipamentos: 0,
        totalOrdens: 0,
        status: {},
        items: [],
      });
    }
    const holder = holders.get(key);
    holder.totalOrdens += 1;
    holder.totalEquipamentos += item.macs?.length || 0;
    holder.status[item.classificationStatus] = (holder.status[item.classificationStatus] || 0) + 1;
    holder.items.push(item);

    const typeKey = item.tipo || "Sem tipo";
    if (!holdersByType.has(typeKey)) {
      holdersByType.set(typeKey, {
        tipo: typeKey,
        totalOrdens: 0,
        totalEquipamentos: 0,
        responsaveis: new Map(),
      });
    }
    const typeGroup = holdersByType.get(typeKey);
    typeGroup.totalOrdens += 1;
    typeGroup.totalEquipamentos += item.macs?.length || 0;
    if (!typeGroup.responsaveis.has(key)) {
      typeGroup.responsaveis.set(key, {
        nome: key,
        totalOrdens: 0,
        totalEquipamentos: 0,
        items: [],
      });
    }
    const typeHolder = typeGroup.responsaveis.get(key);
    typeHolder.totalOrdens += 1;
    typeHolder.totalEquipamentos += item.macs?.length || 0;
    typeHolder.items.push(item);
  }

  const bolsaPorTipo = [...holdersByType.values()]
    .map((group) => ({
      ...group,
      responsaveis: [...group.responsaveis.values()].sort((a, b) => b.totalEquipamentos - a.totalEquipamentos),
    }))
    .sort((a, b) => b.totalEquipamentos - a.totalEquipamentos);

  const generatedAt = new Date().toISOString();
  const returnedLogs = buildReturnedLogs({ previousSnapshot, currentMacs: currentMacSet, generatedAt });
  await saveReturnedLogs(returnedLogs);
  const previousLogs = Array.isArray(previousSnapshot.logsRecent) ? previousSnapshot.logsRecent : [];
  const logsById = new Map(
    [...returnedLogs, ...previousLogs]
      .slice(0, 100)
      .map((log) => [log.id || `${log.tipo}_${log.mac}_${log.createdAt}`, log]),
  );

  const finalStatus = await saveMapEquipmentStatus({
    running: false,
    stage: "Concluido",
    trigger,
    startedAt,
    finishedAt: generatedAt,
    totalMacs: uniqueMacs.length,
    processedMacs: uniqueMacs.length,
    remainingMacs: 0,
    percent: 100,
    totalOrdensMapa: orders.length,
    totalOrdensElegiveis: eligibleOrders.length,
    totalOrdensComMac: withMac.length,
    totalMacsNovos: macsToConsult.length,
    totalMacsReaproveitados: uniqueMacs.length - macsToConsult.length,
    error: "",
  });

  return {
    ok: true,
    generatedAt,
    trigger,
    incremental: !forceFull,
    totalOrdensMapa: orders.length,
    totalOrdensElegiveis: eligibleOrders.length,
    totalOrdensComMac: withMac.length,
    totalConsultadas: items.length,
    totalMacsUnicos: uniqueMacs.length,
    totalMacsNovosConsultados: macsToConsult.length,
    totalMacsReaproveitados: uniqueMacs.length - macsToConsult.length,
    statusLeitura: finalStatus,
    summary,
    gruposTecnicos: [...grouped.values()].sort((a, b) => b.total - a.total),
    equipamentosPorResponsavel: [...holders.values()].sort((a, b) => b.totalEquipamentos - a.totalEquipamentos),
    bolsaPorTipo,
    logsRecent: [...logsById.values()]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 50),
    tiposConsiderados: RETIRADA_EQUIPMENT_TYPES,
    items,
  };
}

async function refreshMapEquipmentsSnapshot({ trigger = "manual" } = {}) {
  if (mapEquipmentRefreshPromise) return mapEquipmentRefreshPromise;

  mapEquipmentRefreshPromise = (async () => {
    try {
      const snapshot = await buildMapEquipmentsSnapshot({ trigger });
      await documents.upsertDocument({
        path: MAP_EQUIPMENT_SNAPSHOT_PATH,
        collectionPath: MAP_EQUIPMENT_SNAPSHOT_COLLECTION,
        documentId: MAP_EQUIPMENT_SNAPSHOT_ID,
        parentPath: null,
        data: snapshot,
      });
      return snapshot;
    } catch (error) {
      await saveMapEquipmentStatus({
        running: false,
        stage: "Erro",
        trigger,
        finishedAt: new Date().toISOString(),
        error: error?.message || "Falha ao processar equipamentos.",
      });
      throw error;
    }
  })();

  try {
    return await mapEquipmentRefreshPromise;
  } finally {
    mapEquipmentRefreshPromise = null;
  }
}

async function listMapEquipments({ limit = 20, page = 1, refresh = false, filters = {} } = {}) {
  const snapshotDoc = await documents.getDocument(MAP_EQUIPMENT_SNAPSHOT_PATH);
  const currentStatus = await getMapEquipmentStatus();

  if (refresh && !mapEquipmentRefreshPromise) {
    refreshMapEquipmentsSnapshot({ trigger: "manual-refresh" })
      .catch((error) => console.error("[sempreIntegration] Falha ao atualizar equipamentos do mapa:", error));
  }

  if (!snapshotDoc?.data) {
    if (!mapEquipmentRefreshPromise) {
      refreshMapEquipmentsSnapshot({ trigger: "first-load" })
        .catch((error) => console.error("[sempreIntegration] Falha ao gerar primeiro snapshot de equipamentos:", error));
    }
    const emptyPage = paginate([], { page, limit });
    return {
      ok: true,
      generatedAt: null,
      trigger: "first-load",
      totalOrdensMapa: 0,
      totalOrdensElegiveis: 0,
      totalOrdensComMac: 0,
      totalConsultadas: 0,
      totalMacsUnicos: 0,
      summary: {
        total: 0,
        com_cliente: 0,
        em_estoque: 0,
        outro_vinculo: 0,
        nao_encontrado: 0,
        indefinido: 0,
        erro_consulta: 0,
        divergentes: 0,
      },
      gruposTecnicos: [],
      equipamentosPorResponsavel: [],
      bolsaPorTipo: [],
      logsRecent: [],
      statusLeitura: currentStatus,
      tiposConsiderados: RETIRADA_EQUIPMENT_TYPES,
      page: emptyPage.page,
      limit: emptyPage.limit,
      totalPages: emptyPage.totalPages,
      totalItems: 0,
      showing: 0,
      items: [],
      refreshing: true,
      message: "Leitura dos equipamentos iniciada em segundo plano.",
    };
  }

  const snapshot = snapshotDoc.data;
  const enrichedSnapshot = await enrichSnapshotForResponse(snapshot);
  const allItems = enrichedSnapshot.items || [];
  const filterOptions = buildFilterOptions(allItems);
  let filteredItems = allItems.filter((item) => itemMatchesFilters(item, filters));
  if (String(filters.view || "") === "bolsa") {
    filteredItems = filteredItems.filter(isRealResponsibleForBag);
  }
  const tecnicoGroups = buildTecnicoGroups(filteredItems);
  const bagGroups = buildBagGroups(filteredItems);
  const notLocatedItems = filteredItems.filter((item) => item.classificationStatus === "nao_encontrado");
  const paginatedItems = paginate(filteredItems, { page, limit });
  const paginatedNotLocated = paginate(notLocatedItems, { page, limit });
  const paginatedGroups = tecnicoGroups.map((group) => ({
    ...group,
    page: paginatedItems.page,
    limit: paginatedItems.limit,
    items: (group.items || []).slice(0, paginatedItems.limit),
  }));
  const paginatedHolders = bagGroups.equipamentosPorResponsavel.map((holder) => ({
    ...holder,
    page: paginatedItems.page,
    limit: paginatedItems.limit,
    items: (holder.items || []).slice(0, paginatedItems.limit),
  }));
  const paginatedBolsaPorTipo = bagGroups.bolsaPorTipo.map((group) => ({
    ...group,
    responsaveis: (group.responsaveis || []).map((holder) => ({
      ...holder,
      items: (holder.items || []).slice(0, paginatedItems.limit),
    })),
  }));

  return {
    ...enrichedSnapshot,
    statusLeitura: currentStatus || snapshot.statusLeitura || null,
    page: paginatedItems.page,
    limit: paginatedItems.limit,
    totalPages: paginatedItems.totalPages,
    totalItems: paginatedItems.total,
    totalFiltered: filteredItems.length,
    filterOptions,
    filters,
    showing: paginatedItems.items.length,
    gruposTecnicos: paginatedGroups,
    equipamentosPorResponsavel: paginatedHolders,
    bolsaPorTipo: paginatedBolsaPorTipo,
    equipamentosNaoLocalizados: {
      total: notLocatedItems.length,
      page: paginatedNotLocated.page,
      limit: paginatedNotLocated.limit,
      totalPages: paginatedNotLocated.totalPages,
      items: paginatedNotLocated.items,
    },
    items: paginatedItems.items,
    refreshing: Boolean(mapEquipmentRefreshPromise) || currentStatus?.running === true,
  };
}

async function saveEquipmentTreatment(payload = {}, user = {}) {
  const id = String(payload.id || "").trim();
  if (!id) {
    const error = new Error("ID da tratativa obrigatorio.");
    error.statusCode = 400;
    throw error;
  }

  const allowedStatuses = new Set(["pendente", "em_analise", "cobrado_tecnico", "resolvido", "ignorado"]);
  const status = String(payload.status || "pendente").trim();
  if (!allowedStatuses.has(status)) {
    const error = new Error("Status de tratativa invalido.");
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const data = {
    id,
    status,
    observacao: String(payload.observacao || "").trim().slice(0, 2000),
    responsavel: String(payload.responsavel || user?.profile?.nome || user?.nome || "").trim(),
    item: payload.item || null,
    macs: Array.isArray(payload.macs) ? payload.macs.map(normalizeMac).filter(isValidEquipmentMac) : [],
    updatedAt: now,
    updatedBy: user?.uid || "",
    updatedByName: user?.profile?.nome || user?.nome || "",
    resolvidoEm: status === "resolvido" ? now : payload.resolvidoEm || null,
  };

  await documents.upsertDocument({
    path: `${MAP_EQUIPMENT_TREATMENT_COLLECTION}/${id}`,
    collectionPath: MAP_EQUIPMENT_TREATMENT_COLLECTION,
    documentId: id,
    parentPath: null,
    data,
  });

  return { ok: true, treatment: data };
}

async function listEquipmentTreatments() {
  const docs = await documents.listAllDocuments(MAP_EQUIPMENT_TREATMENT_COLLECTION);
  return {
    ok: true,
    items: docs.map((doc) => ({ id: doc.documentId, ...(doc.data || {}) })),
  };
}

async function checkStatus() {
  const data = await requestSempre("/auth/me");
  return {
    endpoint: "/auth/me",
    userId: data?.user?.id || null,
    userName: data?.user?.nome || "",
    roles: Array.isArray(data?.roles) ? data.roles.length : 0,
  };
}

module.exports = {
  checkStatus,
  consultEquipment,
  consultHistory,
  listEquipmentTreatments,
  listMapEquipments,
  refreshMapEquipmentsSnapshot,
  saveEquipmentTreatment,
  normalizeMac,
};
