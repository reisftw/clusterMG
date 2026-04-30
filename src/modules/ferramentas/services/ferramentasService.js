import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const COL = "ferramentas_regionais";
const CFG_DOC = doc(db, "ferramentas_config", "global");
const REGIONAIS_MAX = 150;
const CACHE_TTL_MS = 30 * 60 * 1000;

const CACHE_KEYS = {
  regionais: "ferramentas-service:regionais",
  config: "ferramentas-service:config",
};

export const getRegionais = async (force = false) => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.regionais,
    async () => {
      const snap = await getDocs(
        query(collection(db, COL), orderBy("nome"), limit(REGIONAIS_MAX)),
      );

      logFirestoreRead({
        source: "ferramentasService:getRegionais",
        operation: "getDocs",
        path: COL,
        count: snap.size,
      });

      return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const addRegional = async (data) => {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    criadoEm: serverTimestamp(),
  });
  invalidateCache(CACHE_KEYS.regionais);
  return ref;
};

export const updateRegional = async (id, data) => {
  await updateDoc(doc(db, COL, id), data);
  invalidateCache(CACHE_KEYS.regionais);
};

export const deleteRegional = async (id) => {
  await deleteDoc(doc(db, COL, id));
  invalidateCache(CACHE_KEYS.regionais);
};

export const getConfig = async (force = false) => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.config,
    async () => {
      const snap = await getDoc(CFG_DOC);

      logFirestoreRead({
        source: "ferramentasService:getConfig",
        operation: "getDoc",
        path: "ferramentas_config/global",
        count: snap.exists() ? 1 : 0,
      });

      return snap.exists()
        ? snap.data()
        : { tecnicos: [], metaAtiva: 110, metaRetirada: 110 };
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data;
};

export const saveConfig = async (data) => {
  await setDoc(CFG_DOC, data, { merge: true });
  invalidateCache(CACHE_KEYS.config);
};
