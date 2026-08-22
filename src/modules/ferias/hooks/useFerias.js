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
} from '../../../services/dataCache';
import { logDataRead } from '../../../services/dataMonitoring';
import { ROLES } from '../../../constants/roles';

const CACHE_TTL = 10 * 60 * 1000;
const GLOBAL_FERIAS_ROLES = new Set([ROLES.ADMIN, ROLES.GESTOR]);

const getCurrentColaboradorId = (currentUser) =>
  currentUser?.colaborador_id ?? currentUser?.id ?? null;

const canReadAllFerias = (currentUser) =>
  GLOBAL_FERIAS_ROLES.has(String(currentUser?.role ?? '').toLowerCase());

const buildCacheKey = (currentUser) => {
  const colaboradorId = getCurrentColaboradorId(currentUser);
  if (!canReadAllFerias(currentUser) && colaboradorId) {
    return `ferias:colaborador:${colaboradorId}`;
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
      const colaboradorId = getCurrentColaboradorId(currentUser);
      const scopedToCurrentUser = !canReadAllFerias(currentUser) && Boolean(colaboradorId);
      const cacheKey = buildCacheKey(currentUser);
      const { data } = await getOrLoadCachedValue(
        cacheKey,
        async () => {
          const items =
            scopedToCurrentUser
              ? await buscarFeriasPorColaborador(colaboradorId)
              : await buscarTodasFerias();

          logDataRead({
            source: 'useFerias',
            type: 'sql-list',
            path: scopedToCurrentUser ? `ferias:colaborador:${colaboradorId}` : 'ferias',
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
    const colaboradorId = getCurrentColaboradorId(currentUser);
    if (colaboradorId) {
      invalidateCache(`ferias:colaborador:${colaboradorId}`);
    }
  }, [currentUser]);

  const solicitar = useCallback(async (dados) => {
    try {
      const payload = {
        ...dados,
        colaborador_id: dados?.colaborador_id ?? getCurrentColaboradorId(currentUser),
      };
      const ref = await solicitarFerias(payload);
      atualizarCaches();
      setFerias((prev) =>
        sortByInicioDesc([
          ...prev,
          {
            id: ref.id,
            ...payload,
            status: 'pendente',
          },
        ]),
      );
    } catch {
      setError('Erro ao lançar férias.');
    }
  }, [atualizarCaches, currentUser]);

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
      setError('Erro ao cadastrar férias.');
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


