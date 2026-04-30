import { db } from '../../../services/firebase';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const COL_REGRAS = 'regras';
const CACHE_KEY = 'regras:ativas';
const REGRAS_MAX = 100;

export const criarRegraMetaRisco = async () => {
  const regra = {
    nome: 'Meta em Risco',
    ativo: true,
    tipo: 'meta_risco',
    parametros: {
      pctMinimo: 70,
      diasRestantesMax: 5,
    },
    acao: 'alert_dashboard',
    criadoEm: new Date().toISOString(),
  };

  const ref = await addDoc(collection(db, COL_REGRAS), regra);
  return ref.id;
};

export const buscarRegrasAtivas = async () => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEY,
    async () => {
      const snap = await getDocs(
        query(
          collection(db, COL_REGRAS),
          where('ativo', '==', true),
          orderBy('nome'),
          limit(REGRAS_MAX),
        ),
      );
      logFirestoreRead({
        source: 'regrasService:buscarRegrasAtivas',
        operation: 'getDocs',
        path: COL_REGRAS,
        count: snap.size,
      });
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    { ttlMs: 10 * 60 * 1000 },
  );

  return data || [];
};

export const toggleRegra = async (id, ativo) => {
  const ref = doc(db, COL_REGRAS, id);
  await updateDoc(ref, { ativo });
  invalidateCache(CACHE_KEY);
};
