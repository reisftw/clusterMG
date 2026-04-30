import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, getDocs,
  addDoc, updateDoc, deleteDoc, doc,
  orderBy, serverTimestamp, limit,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_KEY = 'fs-ferias:lista';
const CACHE_TTL = 30 * 60 * 1000;
const FERIAS_MAX = 120;

const sortByInicioDesc = (items = []) =>
  [...items].sort((a, b) => String(b?.data_inicio ?? '').localeCompare(String(a?.data_inicio ?? '')));

export const useFSFerias = (currentUser) => {
  const [ferias, setFerias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const snapshot = await getDocs(
            query(
              collection(db, 'fs_ferias'),
              orderBy('data_inicio', 'desc'),
              limit(FERIAS_MAX),
            ),
          );
          logFirestoreRead({
            source: 'useFSFerias',
            operation: 'getDocs',
            count: snapshot.size,
          });
          return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        },
        { ttlMs: CACHE_TTL, force },
      );
      setFerias(sortByInicioDesc(data || []));
    } catch (e) {
      setError('Erro ao carregar férias: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const solicitar = async (dados) => {
    const ref = await addDoc(collection(db, 'fs_ferias'), {
      ...dados,
      status: 'pendente',
      solicitado_por: currentUser?.uid ?? null,
      criado_em: serverTimestamp(),
    });
    invalidateCache(CACHE_KEY);
    setFerias((prev) =>
      sortByInicioDesc([...prev, { id: ref.id, ...dados, status: 'pendente' }]),
    );
  };

  const cadastrar = async (dados) => {
    const payload = {
      ...dados,
      status: dados?.status || 'aprovado',
      solicitado_por: currentUser?.uid ?? null,
      aprovado_por: currentUser?.uid ?? null,
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, 'fs_ferias'), payload);
    invalidateCache(CACHE_KEY);
    setFerias((prev) =>
      sortByInicioDesc([...prev, { id: ref.id, ...dados, status: payload.status }]),
    );
  };

  const atualizarStatus = async (id, status) => {
    await updateDoc(doc(db, 'fs_ferias', id), {
      status,
      atualizado_em: serverTimestamp(),
      aprovado_por: currentUser?.uid ?? null,
    });
    invalidateCache(CACHE_KEY);
    setFerias((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const deletar = async (id) => {
    await deleteDoc(doc(db, 'fs_ferias', id));
    invalidateCache(CACHE_KEY);
    setFerias((prev) => prev.filter((item) => item.id !== id));
  };

  return {
    ferias,
    loading,
    error,
    solicitar,
    cadastrar,
    atualizarStatus,
    deletar,
    carregar: () => carregar(true),
  };
};
