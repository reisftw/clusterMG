import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, getDocs, addDoc, updateDoc,
  deleteDoc, doc, orderBy, serverTimestamp, limit,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_KEY = 'fs-reunioes:lista';
const CACHE_TTL = 30 * 60 * 1000;
const REUNIOES_MAX = 120;

const sortByInicioDesc = (items = []) =>
  [...items].sort((a, b) => String(b?.data_inicio ?? '').localeCompare(String(a?.data_inicio ?? '')));

export const useFSReunioes = () => {
  const [reunioes, setReunioes] = useState([]);
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
              collection(db, 'fs_reunioes'),
              orderBy('data_inicio', 'desc'),
              limit(REUNIOES_MAX),
            ),
          );
          logFirestoreRead({
            source: 'useFSReunioes',
            operation: 'getDocs',
            count: snapshot.size,
          });
          return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        },
        { ttlMs: CACHE_TTL, force },
      );
      setReunioes(sortByInicioDesc(data || []));
    } catch (e) {
      setError('Erro ao carregar reuniões: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = async (dados) => {
    const ref = await addDoc(collection(db, 'fs_reunioes'), {
      ...dados,
      status: 'agendada',
      criado_em: serverTimestamp(),
    });
    invalidateCache(CACHE_KEY);
    setReunioes((prev) => sortByInicioDesc([...prev, { id: ref.id, ...dados, status: 'agendada' }]));
  };

  const atualizar = async (id, dados) => {
    await updateDoc(doc(db, 'fs_reunioes', id), {
      ...dados,
      atualizado_em: serverTimestamp(),
    });
    invalidateCache(CACHE_KEY);
    setReunioes((prev) =>
      sortByInicioDesc(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
    );
  };

  const atualizarParticipantes = async (id, participantes) => {
    await updateDoc(doc(db, 'fs_reunioes', id), {
      participantes,
      atualizado_em: serverTimestamp(),
    });
    invalidateCache(CACHE_KEY);
    setReunioes((prev) =>
      prev.map((item) => (item.id === id ? { ...item, participantes } : item)),
    );
  };

  const atualizarStatus = async (id, status) => {
    await updateDoc(doc(db, 'fs_reunioes', id), {
      status,
      atualizado_em: serverTimestamp(),
    });
    invalidateCache(CACHE_KEY);
    setReunioes((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const salvarAta = async (id, ata) => {
    await updateDoc(doc(db, 'fs_reunioes', id), {
      ata,
      status: 'realizada',
      atualizado_em: serverTimestamp(),
    });
    invalidateCache(CACHE_KEY);
    setReunioes((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ata, status: 'realizada' } : item)),
    );
  };

  const deletar = async (id) => {
    await deleteDoc(doc(db, 'fs_reunioes', id));
    invalidateCache(CACHE_KEY);
    setReunioes((prev) => prev.filter((item) => item.id !== id));
  };

  return {
    reunioes, loading, error,
    criar, atualizar, atualizarParticipantes,
    atualizarStatus, salvarAta, deletar, carregar: () => carregar(true),
  };
};
