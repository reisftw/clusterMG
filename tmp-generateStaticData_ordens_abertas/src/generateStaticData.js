// functions/src/generateStaticData.js
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage }   = require("firebase-admin/storage");
const { onRequest }         = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

// getFirestore/getStorage já usam o app inicializado no index.js

const BUCKET_NAME = "gestao-retirada.firebasestorage.app";
const SECRET      = process.env.STATIC_DATA_SECRET || null;

// ─── Função principal ─────────────────────────────────────────────────────────
async function buildAndSaveJSON() {
  const db = getFirestore();

  const dashSnap = await db.collection("dashboard").orderBy("__name__").limit(24).get();
  const painelRetiradas = {};
  dashSnap.forEach((d) => { painelRetiradas[d.id] = d.data(); });
  const retiradasMetaSnap = await db.collection("config").doc("meta").get();
  const retiradasMeta = retiradasMetaSnap.exists ? retiradasMetaSnap.data() : null;

  const agentesSnap = await db.collection("dashboardagentes").orderBy("__name__").limit(24).get();
  const agentesData = {};
  agentesSnap.forEach((d) => { agentesData[d.id] = d.data(); });
  const agentesMetaSnap = await db.collection("config").doc("agentes_meta").get();
  const agentesMeta = agentesMetaSnap.exists ? agentesMetaSnap.data() : null;

  const mapaPublicSnap = await db.collection("public_dashboard").doc("mapa_os").get();
  const mapaPublic     = mapaPublicSnap.exists ? mapaPublicSnap.data() : null;
  const mapaMetaSnap   = await db.collection("mapa_meta").doc("ultima_atualizacao").get();
  const mapaMeta       = mapaMetaSnap.exists ? mapaMetaSnap.data() : null;

  const mapaOk =
    mapaPublic?.summary?.kpis &&
    Array.isArray(mapaPublic?.summary?.chartRegionais) &&
    !(Number(mapaPublic?.meta?.totalOS || 0) > 0 && Number(mapaPublic?.summary?.totalOrdens || 0) === 0);

  let mapaOrdens = null;
  if (!mapaOk) {
    const snap = await db.collection("ordens_abertas").get();
    mapaOrdens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // ─── Histórico do Mapa ───────────────────────────────────────────────────────
  const historicoSnap = await db
    .collection("mapa_historico")
    .orderBy("data", "desc")
    .limit(50)
    .get();
  const mapaHistorico = historicoSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const matchPublicSnap = await db.collection("public_dashboard").doc("match_os").get();
  const matchPublic     = matchPublicSnap.exists ? matchPublicSnap.data() : null;
  const matchMetaSnap   = await db.collection("match_os_meta").doc("ultima_atualizacao").get();
  const matchMeta       = matchMetaSnap.exists ? matchMetaSnap.data() : null;

  const matchOk =
    matchPublic?.data &&
    Array.isArray(matchPublic.data.regionais) &&
    Array.isArray(matchPublic.data.agentes) &&
    !(Number(matchPublic?.meta?.totalOS || 0) > 0 && Number(matchPublic?.data?.resumo?.totalMatches || 0) === 0);

  let matchOrdens = null;
  if (!matchOk) {
    const snap = await db.collection("match_os_abertas").get();
    matchOrdens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const agMatchSnap = await db.collection("public_dashboard").doc("agentes_match_os").get();
  const agMatch     = agMatchSnap.exists ? agMatchSnap.data() : null;

  const agMatchOk =
    agMatch?.data &&
    Array.isArray(agMatch.data.agentes) &&
    !(Number(agMatch?.meta?.totalOS || 0) > 0 && Number(agMatch?.data?.resumo?.totalMatches || 0) === 0);

  let agMatchOrdens = null;
  if (!agMatchOk) {
    agMatchOrdens = matchOrdens || (await db.collection("match_os_abertas").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    painel: {
      retiradas: { result: painelRetiradas, meta: retiradasMeta },
      agentes:   { result: agentesData,     meta: agentesMeta },
    },
    mapa: {
      source:    mapaOk ? "public" : "fallback",
      summary:   mapaOk ? mapaPublic.summary : null,
      ordens:    mapaOk ? null : mapaOrdens,
      meta:      mapaMeta || mapaPublic?.meta || null,
      historico: mapaHistorico,
    },
    matchOS: {
      source: matchOk ? "public" : "fallback",
      data:   matchOk ? matchPublic.data : null,
      ordens: matchOk ? null : matchOrdens,
      meta:   matchMeta || matchPublic?.meta || null,
    },
    matchAgentes: {
      source: agMatchOk ? "public" : "fallback",
      data:   agMatchOk ? agMatch.data : null,
      ordens: agMatchOk ? null : agMatchOrdens,
      meta:   agMatch?.meta || null,
    },
  };

  const bucket     = getStorage().bucket(BUCKET_NAME);
  const file       = bucket.file("static/data.json");
  const jsonString = JSON.stringify(payload);

  await file.save(jsonString, {
    metadata: {
      contentType: "application/json",
      cacheControl: "public, max-age=300",
    },
  });
  await file.makePublic();

  console.log(`[generateStaticData] Salvo — ${jsonString.length} bytes`);
  return { bytes: jsonString.length, generatedAt: payload.generatedAt };
}

// ─── Trigger HTTP (v2) ────────────────────────────────────────────────────────
exports.generateStaticDataHttp = onRequest(
  { cors: true },
  async (req, res) => {
    if (SECRET && req.query.secret !== SECRET) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const result = await buildAndSaveJSON();
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      console.error("[generateStaticDataHttp] Erro:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// ─── Triggers Firestore (v2) ──────────────────────────────────────────────────
const COLLECTIONS = [
  "dashboard",
  "dashboardagentes",
  "config",
  "public_dashboard",
  "ordens_abertas",
  "match_os_abertas",
  "mapa_meta",
  "match_os_meta",
  "mapa_historico",
];

COLLECTIONS.forEach((col) => {
  const name = `generateStaticData_${col.replace(/[^a-zA-Z0-9]/g, "_")}`;
  exports[name] = onDocumentWritten(`${col}/{docId}`, async (event) => {
    console.log(`[generateStaticData] Trigger: ${col}/${event.params.docId}`);
    try {
      await buildAndSaveJSON();
    } catch (err) {
      console.error("[generateStaticData] Erro:", err);
    }
  });
});