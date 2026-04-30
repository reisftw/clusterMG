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

const MAX_REGIONAIS = 150;
const CACHE_KEY = "regionais-service:lista";
const CACHE_TTL_MS = 30 * 60 * 1000;

const col = () => collection(db, COLLECTIONS.REGIONAIS);

export const buscarRegionais = async (force = false) => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEY,
    async () => {
      const snap = await getDocs(
        query(col(), orderBy("nome"), limit(MAX_REGIONAIS)),
      );

      logFirestoreRead({
        source: "regionaisService:buscarRegionais",
        operation: "getDocs",
        path: COLLECTIONS.REGIONAIS,
        count: snap.size,
      });

      return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const criarRegional = async (dados) => {
  const ref = await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
  invalidateCache(CACHE_KEY);
  return ref;
};

export const atualizarRegional = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.REGIONAIS, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
  invalidateCache(CACHE_KEY);
};

export const excluirRegional = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.REGIONAIS, id));
  invalidateCache(CACHE_KEY);
};
