import { useState, useEffect, useCallback } from 'react';
import {
  cadastrarFerias,
  solicitarFerias,
  atualizarStatusFerias,
  deletarFerias,
  buscarFeriasPorColaborador,
  buscarTodasFerias,
} from '../services/feriasService';
import {
  getOrLoadCachedValue,
  invalidateCache,
} from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_TTL = 10 * 60 * 1000;

const buildCacheKey = (currentUser) => {
  const role = currentUser?.role?.toLowerCase();
  if (role === 'tecnico') {
    return `ferias:colaborador:${currentUser?.colaborador_id ?? currentUser?.id}`;
  }

  return 'ferias:todas';
};

const sortByInicioDesc = (items = []) =>
  [...items].sort((a, b) => String(b?.data_inicio ?? '').localeCompare(String(a?.data_inicio ?? '')));

export const useFerias = (currentUser) => {
  const [ferias, setFerias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    if (!currentUser) return;

    setLoading(true);
    setError(null);

    try {
      const role = currentUser.role?.toLowerCase();
      const cacheKey = buildCacheKey(currentUser);
      const { data } = await getOrLoadCachedValue(
        cacheKey,
        async () => {
          const items =
            role === 'tecnico'
              ? await buscarFeriasPorColaborador(currentUser.colaborador_id ?? currentUser.id)
              : await buscarTodasFerias();

          logFirestoreRead({
            source: 'useFerias',
            type: 'getDocs',
            path: role === 'tecnico' ? `ferias:colaborador:${currentUser.colaborador_id ?? currentUser.id}` : 'ferias',
            count: items.length,
          });

          return sortByInicioDesc(items);
        },
        { ttlMs: CACHE_TTL, force },
      );

      setFerias(sortByInicioDesc(data || []));
    } catch {
      setError('Erro ao carregar férias.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atualizarCaches = useCallback(() => {
    invalidateCache('ferias:todas');
    if (currentUser?.colaborador_id || currentUser?.id) {
      invalidateCache(`ferias:colaborador:${currentUser.colaborador_id ?? currentUser.id}`);
    }
  }, [currentUser?.colaborador_id, currentUser?.id]);

  const solicitar = useCallback(async (dados) => {
    try {
      const ref = await solicitarFerias(dados);
      atualizarCaches();
      setFerias((prev) =>
        sortByInicioDesc([
          ...prev,
          {
            id: ref.id,
            ...dados,
            status: 'pendente',
          },
        ]),
      );
    } catch {
      setError('Erro ao lançar férias.');
    }
  }, [atualizarCaches]);

  const cadastrar = useCallback(async (dados) => {
    try {
      const ref = await cadastrarFerias(dados);
      atualizarCaches();
      setFerias((prev) =>
        sortByInicioDesc([
          ...prev,
          {
            id: ref.id,
            ...dados,
            status: dados?.status || 'aprovado',
          },
        ]),
      );
    } catch {
      setError('Erro ao cadastrar fÃ©rias.');
    }
  }, [atualizarCaches]);

  const atualizarStatus = useCallback(async (id, status) => {
    try {
      await atualizarStatusFerias(id, status);
      atualizarCaches();
      setFerias((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    } catch {
      setError('Erro ao atualizar status.');
    }
  }, [atualizarCaches]);

  const deletar = useCallback(async (id) => {
    try {
      await deletarFerias(id);
      atualizarCaches();
      setFerias((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError('Erro ao deletar registro.');
    }
  }, [atualizarCaches]);

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
