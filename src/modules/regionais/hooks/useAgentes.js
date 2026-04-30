import { useState, useEffect, useCallback } from 'react';
import { buscarAgentes, criarAgente, atualizarAgente, excluirAgente } from '../services/agentesService';
import { useAuthContext } from '../../../context/AuthContext';
import { registrarAtividade } from '../../../services/activityLogService';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_KEY = 'agentes:lista';
const CACHE_TTL = 10 * 60 * 1000;

const sortByNome = (items = []) =>
  [...items].sort((a, b) => (a?.nome ?? '').localeCompare(b?.nome ?? ''));

export const useAgentes = () => {
  const { currentUser } = useAuthContext();
  const [agentes, setAgentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const items = await buscarAgentes();
          logFirestoreRead({
            source: 'useAgentes',
            operation: 'getDocs',
            count: items.length,
          });
          return sortByNome(items);
        },
        { ttlMs: CACHE_TTL, force },
      );
      setAgentes(sortByNome(data || []));
    } catch {
      setError('Erro ao carregar agentes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = useCallback(async (dados) => {
    const ref = await criarAgente(dados);
    await registrarAtividade({
      usuarioId: currentUser?.id,
      nome: currentUser?.nome || 'Sistema',
      acao: 'criou agente autorizado',
      modulo: 'agentes',
      detalhes: { nome: dados?.nome || null, cidade: dados?.cidade || null },
    });
    invalidateCache(CACHE_KEY);
    setAgentes((prev) => sortByNome([...prev, { id: ref.id, ...dados }]));
  }, [currentUser?.id, currentUser?.nome]);

  const atualizar = useCallback(async (id, dados) => {
    await atualizarAgente(id, dados);
    await registrarAtividade({
      usuarioId: currentUser?.id,
      nome: currentUser?.nome || 'Sistema',
      acao: 'atualizou agente autorizado',
      modulo: 'agentes',
      entidadeId: id,
      detalhes: { nome: dados?.nome || null, cidade: dados?.cidade || null },
    });
    invalidateCache(CACHE_KEY);
    setAgentes((prev) =>
      sortByNome(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
    );
  }, [currentUser?.id, currentUser?.nome]);

  const excluir = useCallback(async (id) => {
    await excluirAgente(id);
    await registrarAtividade({
      usuarioId: currentUser?.id,
      nome: currentUser?.nome || 'Sistema',
      acao: 'removeu agente autorizado',
      modulo: 'agentes',
      entidadeId: id,
    });
    invalidateCache(CACHE_KEY);
    setAgentes((prev) => prev.filter((item) => item.id !== id));
  }, [currentUser?.id, currentUser?.nome]);

  return { agentes, loading, error, carregar: () => carregar(true), criar, atualizar, excluir };
};
