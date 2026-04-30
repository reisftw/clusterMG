import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { COLLECTIONS } from "../../../constants/firestoreCollections";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";

const HISTORICO_MAX = 50;
const SALDOS_MAX = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;
const SALDOS_COLLECTION = "banco_horas_saldos";

const col = () => collection(db, COLLECTIONS.BANCO_HORAS);
const saldosCol = () => collection(db, SALDOS_COLLECTION);

const CACHE_KEYS = {
  saldos: "banco-horas-service:saldos",
  historico: (colaboradorId) =>
    `banco-horas-service:historico:${colaboradorId}`,
};

const sortByNome = (items = []) =>
  [...items].sort((a, b) =>
    String(a?.colaborador_nome ?? "").localeCompare(
      String(b?.colaborador_nome ?? ""),
    ),
  );

const carregarResumoSaldos = async () => {
  const snap = await getDocs(
    query(
      saldosCol(),
      orderBy("colaborador_nome"),
      limit(SALDOS_MAX),
    ),
  );

  logFirestoreRead({
    source: "bancoHorasService:buscarSaldos",
    operation: "getDocs",
    path: SALDOS_COLLECTION,
    count: snap.size,
  });

  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
};

const carregarSaldosLegado = async () => {
  const snap = await getDocs(
    query(col(), orderBy("data_atualizacao", "desc"), limit(SALDOS_MAX)),
  );

  logFirestoreRead({
    source: "bancoHorasService:buscarSaldos:legacy",
    operation: "getDocs",
    path: COLLECTIONS.BANCO_HORAS,
    count: snap.size,
  });

  const mapa = {};
  snap.docs.forEach((item) => {
    const data = { id: item.id, ...item.data() };
    const key = data.colaborador_id;
    if (key && !mapa[key]) mapa[key] = data;
  });

  return sortByNome(Object.values(mapa));
};

export const buscarSaldos = async (force = false) => {
  if (!force) {
    const staticSaldos = await getInternalStaticDataSlice(
      (payload) => payload?.bancoHoras?.saldos ?? null,
    );
    if (Array.isArray(staticSaldos)) {
      return sortByNome(staticSaldos);
    }
  }

  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.saldos,
    async () => {
      const resumidos = await carregarResumoSaldos();
      if (resumidos.length > 0) return sortByNome(resumidos);
      return carregarSaldosLegado();
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return sortByNome(data || []);
};

export const buscarHistorico = async (colaboradorId, force = false) => {
  if (!colaboradorId) return [];

  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.historico(colaboradorId),
    async () => {
      const snap = await getDocs(
        query(
          col(),
          where("colaborador_id", "==", colaboradorId),
          orderBy("data_atualizacao", "desc"),
          limit(HISTORICO_MAX),
        ),
      );

      logFirestoreRead({
        source: "bancoHorasService:buscarHistorico",
        operation: "getDocs",
        path: `${COLLECTIONS.BANCO_HORAS}:${colaboradorId}`,
        count: snap.size,
      });

      return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const salvarSaldo = async (dados) => {
  const payload = {
    ...dados,
    criado_em: serverTimestamp(),
  };

  const ref = await addDoc(col(), payload);

  if (dados?.colaborador_id) {
    await setDoc(
      doc(db, SALDOS_COLLECTION, String(dados.colaborador_id)),
      {
        ...dados,
        colaborador_id: dados.colaborador_id,
        atualizado_em: serverTimestamp(),
      },
      { merge: true },
    );
  }

  invalidateCache(CACHE_KEYS.saldos);
  invalidateCache(CACHE_KEYS.historico(dados?.colaborador_id));
  return ref;
};
