import { useState, useEffect, useCallback } from 'react';
import {
  buscarEquipamentos,
  criarEquipamento,
  atualizarEquipamento,
  excluirEquipamento,
} from '../services/equipamentosService';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

export const TIPOS_EQUIPAMENTO = [
  'CELULAR', 'NOTEBOOK', 'TABLET', 'ROTEADOR', 'FERRAMENTA',
  'EPI', 'VEÍCULO', 'OUTRO',
];

export const STATUS_EQUIPAMENTO = [
  'EM USO', 'DISPONÍVEL', 'EM MANUTENÇÃO', 'EXTRAVIADO', 'DESCARTADO',
];

export const STATUS_COLORS = {
  'EM USO': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  'DISPONÍVEL': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  'EM MANUTENÇÃO': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  'EXTRAVIADO': 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  'DESCARTADO': 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

const CACHE_KEY = 'equipamentos:lista';
const CACHE_TTL = 10 * 60 * 1000;

const sortByNome = (items = []) =>
  [...items].sort((a, b) => (a?.nome ?? '').localeCompare(b?.nome ?? ''));

export const useEquipamentos = () => {
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const items = await buscarEquipamentos();
          logFirestoreRead({
            source: 'useEquipamentos',
            operation: 'getDocs',
            count: items.length,
          });
          return sortByNome(items);
        },
        { ttlMs: CACHE_TTL, force },
      );

      setEquipamentos(sortByNome(data || []));
    } catch {
      setError('Erro ao carregar equipamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = useCallback(async (dados) => {
    const ref = await criarEquipamento(dados);
    invalidateCache(CACHE_KEY);
    setEquipamentos((prev) => sortByNome([...prev, { id: ref.id, ...dados }]));
  }, []);

  const atualizar = useCallback(async (id, dados) => {
    await atualizarEquipamento(id, dados);
    invalidateCache(CACHE_KEY);
    setEquipamentos((prev) =>
      sortByNome(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
    );
  }, []);

  const excluir = useCallback(async (id) => {
    await excluirEquipamento(id);
    invalidateCache(CACHE_KEY);
    setEquipamentos((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { equipamentos, loading, error, carregar: () => carregar(true), criar, atualizar, excluir };
};
