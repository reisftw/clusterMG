import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, getDocs,
  addDoc, updateDoc, deleteDoc, doc,
  orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_KEY = 'fs-escala:folgas';
const CACHE_TTL = 5 * 60 * 1000;

const sortByDataDesc = (items = []) =>
  [...items].sort((a, b) => String(b?.data ?? '').localeCompare(String(a?.data ?? '')));

export const useFSEscala = () => {
  const [folgas, setFolgas] = useState([]);
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
            query(collection(db, 'fs_escala_folgas'), orderBy('data', 'desc')),
          );
          logFirestoreRead({
            source: 'useFSEscala',
            operation: 'getDocs',
            count: snapshot.size,
          });
          return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        },
        { ttlMs: CACHE_TTL, force },
      );
      setFolgas(sortByDataDesc(data || []));
    } catch (e) {
      setError('Erro ao carregar escala: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lancarFolgas = async (lista) => {
    const refs = await Promise.all(
      lista.map((dados) =>
        addDoc(collection(db, 'fs_escala_folgas'), {
          ...dados,
          criado_em: serverTimestamp(),
        }),
      ),
    );
    invalidateCache(CACHE_KEY);
    setFolgas((prev) =>
      sortByDataDesc([
        ...prev,
        ...lista.map((dados, index) => ({ id: refs[index].id, ...dados })),
      ]),
    );
  };

  const atualizarFolga = async (id, dados) => {
    await updateDoc(doc(db, 'fs_escala_folgas', id), {
      ...dados,
      atualizado_em: serverTimestamp(),
    });
    invalidateCache(CACHE_KEY);
    setFolgas((prev) =>
      sortByDataDesc(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
    );
  };

  const deletar = async (id) => {
    await deleteDoc(doc(db, 'fs_escala_folgas', id));
    invalidateCache(CACHE_KEY);
    setFolgas((prev) => prev.filter((item) => item.id !== id));
  };

  const deletarVarias = async (ids) => {
    await Promise.all(ids.map((id) => deleteDoc(doc(db, 'fs_escala_folgas', id))));
    invalidateCache(CACHE_KEY);
    setFolgas((prev) => prev.filter((item) => !ids.includes(item.id)));
  };

  return { folgas, loading, error, lancarFolgas, atualizarFolga, deletar, deletarVarias, carregar: () => carregar(true) };
};
