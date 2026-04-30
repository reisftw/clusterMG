import { useState, useEffect, useCallback } from 'react';
import {
  buscarAtestados,
  salvarAtestado,
  atualizarAtestado,
  deletarAtestado,
} from '../services/atestadoService';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_KEY = 'atestados:lista';
const CACHE_TTL = 10 * 60 * 1000;

const sortByCriado = (items = []) =>
  [...items].sort((a, b) => String(b?.criado_em ?? '').localeCompare(String(a?.criado_em ?? '')));

export const useAtestado = () => {
  const [atestados, setAtestados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const items = await buscarAtestados();
          logFirestoreRead({
            source: 'useAtestado',
            operation: 'getDocs',
            count: items.length,
          });
          return sortByCriado(items);
        },
        { ttlMs: CACHE_TTL, force },
      );

      setAtestados(sortByCriado(data || []));
    } catch {
      setError('Erro ao carregar atestados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = useCallback(async (dados) => {
    try {
      const ref = await salvarAtestado(dados);
      invalidateCache(CACHE_KEY);
      setAtestados((prev) => sortByCriado([...prev, { id: ref.id, ...dados }]));
    } catch {
      setError('Erro ao salvar atestado.');
    }
  }, []);

  const atualizar = useCallback(async (id, dados) => {
    try {
      await atualizarAtestado(id, dados);
      invalidateCache(CACHE_KEY);
      setAtestados((prev) =>
        sortByCriado(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
      );
    } catch {
      setError('Erro ao atualizar atestado.');
    }
  }, []);

  const deletar = useCallback(async (id) => {
    try {
      await deletarAtestado(id);
      invalidateCache(CACHE_KEY);
      setAtestados((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError('Erro ao deletar atestado.');
    }
  }, []);

  return { atestados, loading, error, salvar, atualizar, deletar, carregar: () => carregar(true) };
};
