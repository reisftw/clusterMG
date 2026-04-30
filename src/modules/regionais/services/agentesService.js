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

const MAX_AGENTES = 300;
const CACHE_KEY = "agentes-service:lista";
const CACHE_TTL_MS = 30 * 60 * 1000;

const col = () => collection(db, COLLECTIONS.AGENTES);

export const buscarAgentes = async (force = false) => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEY,
    async () => {
      const snap = await getDocs(
        query(col(), orderBy("nome"), limit(MAX_AGENTES)),
      );

      logFirestoreRead({
        source: "agentesService:buscarAgentes",
        operation: "getDocs",
        path: COLLECTIONS.AGENTES,
        count: snap.size,
      });

      return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const criarAgente = async (dados) => {
  const ref = await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
  invalidateCache(CACHE_KEY);
  return ref;
};

export const atualizarAgente = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.AGENTES, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
  invalidateCache(CACHE_KEY);
};

export const excluirAgente = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.AGENTES, id));
  invalidateCache(CACHE_KEY);
};
