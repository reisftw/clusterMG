import { db } from '../../../services/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';
import { getInternalStaticDataSlice } from '../../../services/internalStaticDataService';

const COL = 'metas';
const METAS_MAX = 24;
const FERIADOS_MAX = 100;
const CACHE_KEYS = {
  todas: 'metas:todas',
  mes: (mes) => `metas:${mes}`,
  ultimaAtualizacao: 'metas:ultima-atualizacao',
  feriados: (ano) => `metas:feriados:${ano}`,
};

export const buscarTodasMetas = async (force = false) => {
  if (!force) {
    const staticMetas = await getInternalStaticDataSlice(
      (payload) => payload?.metas?.all ?? null,
    );
    if (staticMetas && typeof staticMetas === 'object') {
      return staticMetas;
    }
  }

  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.todas,
    async () => {
      const snap = await getDocs(
        query(collection(db, COL), orderBy('__name__'), limit(METAS_MAX)),
      );
      logFirestoreRead({
        source: 'metasService:buscarTodasMetas',
        operation: 'getDocs',
        path: COL,
        count: snap.size,
      });
      const result = {};
      snap.forEach((item) => {
        result[item.id] = item.data();
      });
      return result;
    },
    { ttlMs: 10 * 60 * 1000, force },
  );

  return data || {};
};

export const buscarMetaMes = async (mes) => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.mes(mes),
    async () => {
      const snap = await getDoc(doc(db, COL, mes));
      logFirestoreRead({
        source: 'metasService:buscarMetaMes',
        operation: 'getDoc',
        path: `${COL}/${mes}`,
        count: snap.exists() ? 1 : 0,
      });
      return snap.exists() ? snap.data() : null;
    },
    { ttlMs: 10 * 60 * 1000 },
  );

  return data ?? null;
};

export const salvarMetaMes = async (mes, dados) => {
  const ref = doc(db, COL, mes);
  if (!dados || Number(dados.totalOS) === 0) {
    await deleteDoc(ref).catch(() => {});
    invalidateCache(CACHE_KEYS.todas);
    invalidateCache(CACHE_KEYS.mes(mes));
    return;
  }

  await setDoc(ref, { ...dados, updatedAt: new Date().toISOString() });
  invalidateCache(CACHE_KEYS.todas);
  invalidateCache(CACHE_KEYS.mes(mes));
};

export const salvarUltimaAtualizacao = async (txt) => {
  await setDoc(doc(db, 'config', 'metas'), { lastUpdate: txt }, { merge: true });
  invalidateCache(CACHE_KEYS.ultimaAtualizacao);
};

export const buscarUltimaAtualizacao = async () => {
  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.ultimaAtualizacao,
    async () => {
      const snap = await getDoc(doc(db, 'config', 'metas'));
      logFirestoreRead({
        source: 'metasService:buscarUltimaAtualizacao',
        operation: 'getDoc',
        path: 'config/metas',
        count: snap.exists() ? 1 : 0,
      });
      return snap.exists() ? snap.data().lastUpdate : null;
    },
    { ttlMs: 10 * 60 * 1000 },
  );

  return data ?? null;
};

export const buscarFeriadosNacionais = async (ano) => {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    if (!res.ok) throw new Error('Falha na API');
    return await res.json();
  } catch {
    return [];
  }
};

export const buscarFeriados = async (force = false) => {
  if (!force) {
    const staticFeriados = await getInternalStaticDataSlice(
      (payload) => payload?.metas?.feriados ?? null,
    );
    if (Array.isArray(staticFeriados)) {
      return new Set(staticFeriados);
    }
  }

  const ano = new Date().getFullYear();
  const { data } = await getOrLoadCachedValue(
    CACHE_KEYS.feriados(ano),
    async () => {
      const keys = new Set();

      try {
        const nacionais = await buscarFeriadosNacionais(ano);
        for (const item of nacionais) {
          const parts = item.date?.split('-');
          if (parts?.length === 3) keys.add(`${parts[1]}-${parts[2]}`);
        }
      } catch (e) {
        console.warn('metasService: erro ao buscar feriados nacionais.', e);
      }

      try {
        const snap = await getDocs(
          query(collection(db, 'feriados'), orderBy('data'), limit(FERIADOS_MAX)),
        );
        logFirestoreRead({
          source: 'metasService:buscarFeriadosFirebase',
          operation: 'getDocs',
          path: 'feriados',
          count: snap.size,
        });
        snap.forEach((item) => {
          const raw = item.data().data || '';
          const parts = raw.split('-');
          if (parts.length === 3) keys.add(`${parts[1]}-${parts[2]}`);
        });
      } catch (e) {
        console.warn('metasService: erro ao buscar feriados do Firebase.', e);
      }

      return Array.from(keys);
    },
    { ttlMs: 24 * 60 * 60 * 1000, force },
  );

  return new Set(data || []);
};
