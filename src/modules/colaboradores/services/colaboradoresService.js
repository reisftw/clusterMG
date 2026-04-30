import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { COLLECTIONS } from "../../../constants/firestoreCollections";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";

const MAX_COLABORADORES = 300;
const CACHE_KEY = "colaboradores-service:lista";
const CACHE_TTL_MS = 30 * 60 * 1000;

const col = () => collection(db, COLLECTIONS.COLABORADORES);

export const buscarColaboradores = async (force = false) => {
  if (!force) {
    const staticItems = await getInternalStaticDataSlice(
      (payload) => payload?.colaboradores?.items ?? null,
    );
    if (Array.isArray(staticItems)) {
      return staticItems;
    }
  }

  const { data } = await getOrLoadCachedValue(
    CACHE_KEY,
    async () => {
      const snap = await getDocs(
        query(col(), orderBy("nome"), limit(MAX_COLABORADORES)),
      );

      logFirestoreRead({
        source: "colaboradoresService:buscarColaboradores",
        operation: "getDocs",
        path: COLLECTIONS.COLABORADORES,
        count: snap.size,
      });

      return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const cadastrarColaborador = async (dados) => {
  const ref = await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
  invalidateCache(CACHE_KEY);
  return ref;
};

export const atualizarColaborador = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.COLABORADORES, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
  invalidateCache(CACHE_KEY);
};

export const deletarColaborador = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.COLABORADORES, id));
  invalidateCache(CACHE_KEY);
};
