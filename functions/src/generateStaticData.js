const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");

const BUCKET_NAME = "gestao-retirada.firebasestorage.app";
const PUBLIC_STATIC_PATH = "static/data.json";
const INTERNAL_STATIC_PATH = "static/internal/data.json";
const SECRET = process.env.STATIC_DATA_SECRET || null;
const ALLOWED_ROLES = new Set(["admin", "gestor"]);
const EXTRA_ALLOWED_CORS_ORIGINS = String(
  process.env.STATIC_DATA_ALLOWED_ORIGINS || "",
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_CORS_ORIGINS = [
  /^https:\/\/([a-z0-9-]+--)?gestao-retirada\.web\.app$/,
  /^https:\/\/([a-z0-9-]+--)?gestao-retirada\.firebaseapp\.com$/,
  ...EXTRA_ALLOWED_CORS_ORIGINS,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

const TECNICOS_LIMIT = 300;
const METAS_LIMIT = 24;
const FERIADOS_LIMIT = 100;
const SALDOS_LIMIT = 500;
const AUDITORIA_AGENTES_LIMIT = 300;

function getProvidedSecret(req) {
  const headerSecret = req.get("x-static-data-secret");
  if (headerSecret) return headerSecret;

  const querySecret = req.query?.secret;
  return typeof querySecret === "string" ? querySecret : null;
}

function normalizeRoles(role) {
  if (Array.isArray(role)) return role.map((item) => String(item || "").toLowerCase());
  if (role == null) return [];
  return [String(role).toLowerCase()];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMetadataConflictError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === 412 ||
    (
      message.includes("metadata for object") &&
      message.includes("edited during the operation")
    )
  );
}

async function saveStaticDataFile(filePath, jsonString) {
  const bucket = getStorage().bucket(BUCKET_NAME);
  const file = bucket.file(filePath);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await file.save(jsonString, {
        public: true,
        resumable: false,
        metadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=0, must-revalidate",
        },
      });
      return;
    } catch (error) {
      if (!isMetadataConflictError(error) || attempt === maxAttempts) {
        throw error;
      }

      console.warn(
        `[generateStaticData] Conflito ao salvar ${filePath} (tentativa ${attempt}/${maxAttempts}). Tentando novamente...`,
      );
      await sleep(attempt * 400);
    }
  }
}

async function loadStaticDataFile(filePath) {
  const bucket = getStorage().bucket(BUCKET_NAME);
  const file = bucket.file(filePath);

  try {
    const [buffer] = await file.download();
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    const message = String(error?.message || "");
    if (error?.code === 404 || message.includes("No such object")) {
      return null;
    }

    console.warn(
      `[generateStaticData] Nao foi possivel ler snapshot anterior ${filePath}:`,
      error?.message || error,
    );
    return null;
  }
}

function serializeForJson(value) {
  if (value == null) return value;

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? null : date.toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item));
  }

  if (typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      result[key] = serializeForJson(item);
    });
    return result;
  }

  return value;
}

function mapDoc(docSnap) {
  return { id: docSnap.id, ...docSnap.data() };
}

function parseDateValue(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? null : date;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object" && typeof value.seconds === "number") {
    const millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getCurrentMonthName() {
  return [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ][new Date().getMonth()];
}

function normalizeScope(options = {}) {
  const scope = String(options?.scope || options?.modo || "full").toLowerCase();
  return scope === "metas" ? "metas" : "full";
}

function canReusePreviousMapa(publicPayload, previousInternalPayload) {
  const previousMapa = previousInternalPayload?.mapa;
  const previousOrdens = previousMapa?.ordens;

  if (!Array.isArray(previousOrdens)) return false;

  const totalMeta = Number(publicPayload?.mapa?.meta?.totalOS || 0);
  if (totalMeta > 0 && totalMeta !== previousOrdens.length) return false;

  const previousGeneratedAt = parseDateValue(previousInternalPayload?.generatedAt);
  const mapaUpdatedAt = parseDateValue(publicPayload?.mapa?.meta?.data);

  if (previousGeneratedAt && mapaUpdatedAt && mapaUpdatedAt > previousGeneratedAt) {
    return false;
  }

  return true;
}

async function assertCanGenerateStaticData(uid) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuario nao autenticado.");
  }

  const db = getFirestore();
  const userSnap = await db.collection("usuarios").doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "Perfil do usuario nao encontrado.");
  }

  const roles = normalizeRoles(userSnap.data()?.role);
  const canGenerate = roles.some((role) => ALLOWED_ROLES.has(role));

  if (!canGenerate) {
    throw new HttpsError(
      "permission-denied",
      "Usuario sem permissao para publicar o JSON estatico.",
    );
  }
}

async function fetchFeriadosNacionais(ano) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn("[generateStaticData] Falha ao buscar feriados nacionais:", error?.message || error);
    return [];
  }
}

async function fetchFeriadosKeys(db, ano) {
  const keys = new Set();

  const [nacionais, locaisSnap] = await Promise.all([
    fetchFeriadosNacionais(ano),
    db
      .collection("feriados")
      .orderBy("data")
      .limit(FERIADOS_LIMIT)
      .get()
      .catch(() => null),
  ]);

  (nacionais || []).forEach((item) => {
    const parts = String(item?.date || "").split("-");
    if (parts.length === 3) {
      keys.add(`${parts[1]}-${parts[2]}`);
    }
  });

  locaisSnap?.forEach((docSnap) => {
    const parts = String(docSnap.data()?.data || "").split("-");
    if (parts.length === 3) {
      keys.add(`${parts[1]}-${parts[2]}`);
    }
  });

  return Array.from(keys).sort();
}

async function buildMetasPayload(db, anoAtual, mesAtualNome) {
  const [metasSnap, feriadosKeys, auditoriaAgentesMesSnap] = await Promise.all([
    db.collection("metas").orderBy("__name__").limit(METAS_LIMIT).get(),
    fetchFeriadosKeys(db, anoAtual),
    db
      .collection("auditoria_agentes")
      .doc(mesAtualNome)
      .collection("cidades")
      .orderBy("cidade")
      .limit(AUDITORIA_AGENTES_LIMIT)
      .get(),
  ]);

  const metas = {};
  metasSnap.forEach((docSnap) => {
    metas[docSnap.id] = docSnap.data();
  });

  return {
    all: metas,
    feriados: feriadosKeys,
    auditoriaAgentes: {
      mes: mesAtualNome,
      cidades: auditoriaAgentesMesSnap.docs.map((docSnap) => docSnap.data()),
    },
  };
}


async function buildPublicPayload(db, generatedAt) {
  const [
    dashSnap,
    retiradasMetaSnap,
    agentesSnap,
    agentesMetaSnap,
    duvidasSnap,
    mapaPublicSnap,
    matchPublicSnap,
    agMatchSnap,
  ] = await Promise.all([
    db.collection("dashboard").orderBy("__name__").limit(24).get(),
    db.collection("config").doc("meta").get(),
    db.collection("dashboardagentes").orderBy("__name__").limit(24).get(),
    db.collection("config").doc("agentes_meta").get(),
    db.collection("config").doc("duvidas_retirada").get(),
    db.collection("public_dashboard").doc("mapa_os").get(),
    db.collection("public_dashboard").doc("match_os").get(),
    db.collection("public_dashboard").doc("agentes_match_os").get(),
  ]);

  const painelRetiradas = {};
  dashSnap.forEach((docSnap) => {
    painelRetiradas[docSnap.id] = docSnap.data();
  });
  const retiradasMeta = retiradasMetaSnap.exists ? retiradasMetaSnap.data() : null;

  const agentesData = {};
  agentesSnap.forEach((docSnap) => {
    agentesData[docSnap.id] = docSnap.data();
  });
  const agentesMeta = agentesMetaSnap.exists ? agentesMetaSnap.data() : null;
  const duvidasData = duvidasSnap.exists ? duvidasSnap.data() : null;
  const duvidasPublicas = {
    titulo: duvidasData?.titulo || "Wiki da Retirada",
    descricao:
      duvidasData?.descricao ||
      "Principais duvidas da operacao respondidas de forma rapida.",
    atualizadoEm: duvidasData?.atualizadoEm || duvidasData?.atualizado_em || null,
    duvidas: Array.isArray(duvidasData?.duvidas)
      ? duvidasData.duvidas.map((item) => ({
          id: item?.id || null,
          pergunta: item?.pergunta || "",
          resposta: item?.resposta || "",
          categoria: item?.categoria || "",
        }))
      : [],
  };

  const mapaPublic = mapaPublicSnap.exists ? mapaPublicSnap.data() : null;
  let mapaMeta = mapaPublic?.meta || null;
  if (!mapaMeta) {
    const mapaMetaSnap = await db.collection("mapa_meta").doc("ultima_atualizacao").get();
    mapaMeta = mapaMetaSnap.exists ? mapaMetaSnap.data() : null;
  }

  const mapaOk =
    mapaPublic?.summary?.kpis &&
    Array.isArray(mapaPublic?.summary?.chartRegionais) &&
    !(
      Number(mapaPublic?.meta?.totalOS || 0) > 0 &&
      Number(mapaPublic?.summary?.totalOrdens || 0) === 0
    );

  let mapaOrdens = null;
  if (!mapaOk) {
    const snap = await db.collection("ordens_abertas").get();
    mapaOrdens = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  }

  const matchPublic = matchPublicSnap.exists ? matchPublicSnap.data() : null;
  let matchMeta = matchPublic?.meta || null;
  if (!matchMeta) {
    const matchMetaSnap = await db
      .collection("match_os_meta")
      .doc("ultima_atualizacao")
      .get();
    matchMeta = matchMetaSnap.exists ? matchMetaSnap.data() : null;
  }

  const matchOk =
    matchPublic?.data &&
    Array.isArray(matchPublic.data.regionais) &&
    Array.isArray(matchPublic.data.agentes) &&
    !(
      Number(matchPublic?.meta?.totalOS || 0) > 0 &&
      Number(matchPublic?.data?.resumo?.totalMatches || 0) === 0
    );

  let matchOrdens = null;
  if (!matchOk) {
    const snap = await db.collection("match_os_abertas").get();
    matchOrdens = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  }

  const agMatch = agMatchSnap.exists ? agMatchSnap.data() : null;

  const agMatchOk =
    agMatch?.data &&
    Array.isArray(agMatch.data.agentes) &&
    !(
      Number(agMatch?.meta?.totalOS || 0) > 0 &&
      Number(agMatch?.data?.resumo?.totalMatches || 0) === 0
    );

  let agMatchOrdens = null;
  if (!agMatchOk) {
    agMatchOrdens =
      matchOrdens ||
      (await db.collection("match_os_abertas").get()).docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
  }

  return {
    generatedAt,
    painel: {
      retiradas: { result: painelRetiradas, meta: retiradasMeta },
      agentes: { result: agentesData, meta: agentesMeta },
    },
    duvidas: duvidasPublicas,
    mapa: {
      source: mapaOk ? "public" : "fallback",
      summary: mapaOk ? mapaPublic.summary : null,
      ordens: mapaOk ? null : mapaOrdens,
      meta: mapaMeta || mapaPublic?.meta || null,
    },
    matchOS: {
      source: matchOk ? "public" : "fallback",
      data: matchOk ? matchPublic.data : null,
      ordens: matchOk ? null : matchOrdens,
      meta: matchMeta || matchPublic?.meta || null,
    },
    matchAgentes: {
      source: agMatchOk ? "public" : "fallback",
      data: agMatchOk ? agMatch.data : null,
      ordens: agMatchOk ? null : agMatchOrdens,
      meta: agMatch?.meta || null,
    },
  };
}

async function carregarResumoSaldos(db) {
  const snap = await db
    .collection("banco_horas_saldos")
    .orderBy("colaborador_nome")
    .limit(SALDOS_LIMIT)
    .get();

  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function carregarSaldosLegado(db) {
  const snap = await db
    .collection("banco_horas")
    .orderBy("data_atualizacao", "desc")
    .limit(SALDOS_LIMIT)
    .get();

  const mapa = {};
  snap.docs.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    const key = item.colaborador_id;
    if (key && !mapa[key]) {
      mapa[key] = item;
    }
  });

  return Object.values(mapa).sort((a, b) =>
    String(a?.colaborador_nome ?? "").localeCompare(String(b?.colaborador_nome ?? ""), "pt-BR"),
  );
}

async function buildInternalPayload(
  db,
  generatedAt,
  publicPayload,
  previousInternalPayload = null,
) {
  const anoAtual = new Date().getFullYear();
  const podeReutilizarOrdensAbertas =
    publicPayload?.mapa?.source === "fallback" &&
    Array.isArray(publicPayload?.mapa?.ordens);
  const podeReutilizarMapaAnterior =
    !podeReutilizarOrdensAbertas &&
    canReusePreviousMapa(publicPayload, previousInternalPayload);
  const mesAtualNome = getCurrentMonthName();

  const [
    feriasSnap,
    veiculosSnap,
    metasPayload,
    duvidasSnap,
    colaboradoresSnap,
    agendaSnap,
    ordensAbertasSnap,
    feriadosNacionais,
    comissoesAnoSnap,
  ] = await Promise.all([
    db.collection("ferias").get(),
    db.collection("veiculos").get(),
    buildMetasPayload(db, anoAtual, mesAtualNome),
    db.collection("config").doc("duvidas_retirada").get(),
    db
      .collection("colaboradores")
      .orderBy("nome")
      .limit(TECNICOS_LIMIT)
      .get(),
    db.collection("agenda").orderBy("data_inicio", "asc").get(),
    podeReutilizarOrdensAbertas
      ? Promise.resolve(null)
      : podeReutilizarMapaAnterior
        ? Promise.resolve(null)
      : db.collection("ordens_abertas").orderBy("__name__").get(),
    fetchFeriadosNacionais(anoAtual),
    db.collection("comissoes").where("ano", "==", anoAtual).get(),
  ]);

  const ferias = feriasSnap.docs.map(mapDoc);
  const veiculos = veiculosSnap.docs.map(mapDoc);
  const duvidas = duvidasSnap.exists ? duvidasSnap.data() : null;

  const colaboradores = colaboradoresSnap.docs.map(mapDoc);
  const agenda = agendaSnap.docs.map(mapDoc);
  const ordensAbertas = podeReutilizarOrdensAbertas
    ? publicPayload.mapa.ordens
    : podeReutilizarMapaAnterior
      ? previousInternalPayload.mapa.ordens
      : ordensAbertasSnap.docs.map(mapDoc);
  const comissoesAno = comissoesAnoSnap.docs.map(mapDoc);

  const saldosResumidos = await carregarResumoSaldos(db);
  const saldosBancoHoras = saldosResumidos.length
    ? saldosResumidos
    : await carregarSaldosLegado(db);

  return serializeForJson({
    generatedAt,
    dashboard: {
      data: {
        ferias,
        veiculos,
        feriados: feriadosNacionais,
        colaboradores,
      },
    },
    metas: metasPayload,
    duvidas,
    colaboradores: {
      items: colaboradores,
    },
    agenda: {
      eventos: agenda,
    },
    bancoHoras: {
      saldos: saldosBancoHoras,
    },
    mapa: {
      ordens: ordensAbertas,
      meta: publicPayload?.mapa?.meta || null,
    },
    comissao: {
      ano: anoAtual,
      registros: comissoesAno,
    },
  });
}

async function buildMetasScopedInternalPayload(
  db,
  generatedAt,
  previousInternalPayload,
) {
  const anoAtual = new Date().getFullYear();
  const mesAtualNome = getCurrentMonthName();
  const metasPayload = await buildMetasPayload(db, anoAtual, mesAtualNome);

  return serializeForJson({
    ...previousInternalPayload,
    generatedAt,
    metas: metasPayload,
  });
}

async function buildAndSaveJSON(options = {}) {
  const db = getFirestore();
  const generatedAt = new Date().toISOString();
  const scope = normalizeScope(options);

  const previousInternalPayload = await loadStaticDataFile(INTERNAL_STATIC_PATH);
  const publicPayload = await buildPublicPayload(db, generatedAt);

  const internalPayload =
    scope === "metas" && previousInternalPayload
      ? await buildMetasScopedInternalPayload(
          db,
          generatedAt,
          previousInternalPayload,
        )
      : await buildInternalPayload(
          db,
          generatedAt,
          publicPayload,
          previousInternalPayload,
        );

  const publicJson = JSON.stringify(publicPayload);
  const internalJson = JSON.stringify(internalPayload);

  await Promise.all([
    saveStaticDataFile(PUBLIC_STATIC_PATH, publicJson),
    saveStaticDataFile(INTERNAL_STATIC_PATH, internalJson),
  ]);

  console.log(
    `[generateStaticData] Salvos ${PUBLIC_STATIC_PATH} (${publicJson.length} bytes) e ${INTERNAL_STATIC_PATH} (${internalJson.length} bytes)`,
  );

  return {
    scope,
    generatedAt,
    files: {
      public: { path: PUBLIC_STATIC_PATH, bytes: publicJson.length },
      internal: { path: INTERNAL_STATIC_PATH, bytes: internalJson.length },
    },
  };
}

exports.generateStaticDataHttp = onRequest(
  { cors: ALLOWED_CORS_ORIGINS },
  async (req, res) => {
    if (!SECRET) {
      console.error("[generateStaticDataHttp] STATIC_DATA_SECRET nao configurado.");
      res.status(503).json({
        ok: false,
        error: "STATIC_DATA_SECRET nao configurado",
      });
      return;
    }

    if (getProvidedSecret(req) !== SECRET) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const result = await buildAndSaveJSON({ scope: req.query?.scope });
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      console.error("[generateStaticDataHttp] Erro:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  },
);

exports.generateStaticDataCallable = onCall(
  { cors: ALLOWED_CORS_ORIGINS },
  async (request) => {
    await assertCanGenerateStaticData(request.auth?.uid);

    try {
      return await buildAndSaveJSON(request.data || {});
    } catch (err) {
      console.error("[generateStaticDataCallable] Erro:", err);
      throw new HttpsError(
        "internal",
        err.message || "Erro ao gerar JSON estatico.",
      );
    }
  },
);
