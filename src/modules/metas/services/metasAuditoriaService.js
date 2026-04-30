import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const COL = "auditoria_agentes";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_AGENTES = 300;
const MAX_CIDADES_MES = 300;

const CACHE_KEYS = {
  agentes: "metas-auditoria:agentes",
  auditoria: (mes) => `metas-auditoria:mes:${mes}`,
  historico: (cidadeKey) => `metas-auditoria:historico:${cidadeKey}`,
};

export const buscarAgentes = async (force = false) => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.agentes,
    async () => {
      const snap = await getDocs(
        query(collection(db, "agentes"), orderBy("cidade"), limit(MAX_AGENTES)),
      );

      logFirestoreRead({
        source: "metasAuditoriaService:buscarAgentes",
        operation: "getDocs",
        path: "agentes",
        count: snap.size,
      });

      const map = {};
      snap.forEach((item) => {
        const payload = item.data();
        const key = String(payload.cidade || "").toUpperCase().trim();
        if (key) map[key] = { ...payload, id: item.id };
      });
      return map;
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || {};
};

export const salvarAuditoriaAgentes = async (mes, cidades) => {
  const batch = cidades.map((cidade) => {
    const key = String(cidade.cidade).toUpperCase().replace(/\s+/g, "_");
    const ref = doc(db, COL, mes, "cidades", key);
    return setDoc(ref, { ...cidade, mes, savedAt: new Date().toISOString() });
  });

  await Promise.all(batch);
  invalidateCache(CACHE_KEYS.auditoria(mes));

  cidades.forEach((cidade) => {
    const key = String(cidade.cidade).toUpperCase().replace(/\s+/g, "_");
    invalidateCache(CACHE_KEYS.historico(key));
  });
};

export const buscarAuditoriaAgentes = async (mes, force = false) => {
  try {
    const { data } = await getOrLoadCachedValue(
      CACHE_KEYS.auditoria(mes),
      async () => {
        const snap = await getDocs(
          query(
            collection(db, COL, mes, "cidades"),
            orderBy("cidade"),
            limit(MAX_CIDADES_MES),
          ),
        );

        logFirestoreRead({
          source: "metasAuditoriaService:buscarAuditoriaAgentes",
          operation: "getDocs",
          path: `${COL}/${mes}/cidades`,
          count: snap.size,
        });

        return snap.docs.map((item) => item.data());
      },
      { ttlMs: CACHE_TTL_MS, force },
    );

    return data || [];
  } catch (e) {
    console.error("[metasAuditoriaService] Erro ao buscar:", e);
    return [];
  }
};

export const buscarHistoricoCidade = async (cidadeKey, force = false) => {
  const meses = [
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

  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.historico(cidadeKey),
    async () => {
      const resultados = [];

      for (const mes of meses) {
        const ref = doc(db, COL, mes, "cidades", cidadeKey);
        const snap = await getDoc(ref);

        logFirestoreRead({
          source: "metasAuditoriaService:buscarHistoricoCidade",
          operation: "getDoc",
          path: `${COL}/${mes}/cidades/${cidadeKey}`,
          count: snap.exists() ? 1 : 0,
        });

        if (snap.exists()) resultados.push({ mes, ...snap.data() });
      }

      return resultados;
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const buscarAuditoriaMes = buscarAuditoriaAgentes;
