import { useState, useEffect, useCallback } from 'react';
import {
  buscarTodosFS,
  buscarColaboradoresRetiradas,
  importarColaborador,
  cadastrarColaboradorFS,
  atualizarColaboradorFS,
  deletarColaboradorFS,
  buscarHistoricoFS,
} from '../services/fsColaboradoresService';
import {
  getOrLoadCachedValue,
  invalidateCache,
} from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_KEYS = {
  fs: 'fs-colaboradores:lista',
  retiradas: 'fs-colaboradores:origem-retiradas',
  historico: (id) => `fs-colaboradores:historico:${id}`,
};

const CACHE_TTL = 10 * 60 * 1000;

const sortByNome = (items = []) =>
  [...items].sort((a, b) => (a?.nome ?? '').localeCompare(b?.nome ?? ''));

export const useFSColaboradores = () => {
  const [colaboradores, setColaboradores] = useState([]);
  const [retiradas, setRetiradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      const [{ data: fs }, { data: ret }] = await Promise.all([
        getOrLoadCachedValue(
          CACHE_KEYS.fs,
          async () => {
            const items = await buscarTodosFS();
            logFirestoreRead({
              source: 'useFSColaboradores:colaboradores_fs',
              type: 'getDocs',
              path: 'colaboradores_fs',
              count: items.length,
            });
            return sortByNome(items);
          },
          { ttlMs: CACHE_TTL, force },
        ),
        getOrLoadCachedValue(
          CACHE_KEYS.retiradas,
          async () => {
            const items = await buscarColaboradoresRetiradas();
            logFirestoreRead({
              source: 'useFSColaboradores:colaboradores',
              type: 'getDocs',
              path: 'colaboradores',
              count: items.length,
            });
            return sortByNome(items);
          },
          { ttlMs: CACHE_TTL, force },
        ),
      ]);

      setColaboradores(sortByNome(fs));
      setRetiradas(sortByNome(ret));
    } catch {
      setError('Erro ao carregar colaboradores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const importar = useCallback(async (colaborador) => {
    try {
      const ref = await importarColaborador(colaborador);
      invalidateCache(CACHE_KEYS.fs);

      setColaboradores((prev) =>
        sortByNome([
          ...prev,
          {
            id: ref.id,
            nome: colaborador.nome ?? '',
            cargo: colaborador.cargo ?? '',
            regional: colaborador.regional ?? '',
            telefone: colaborador.telefone ?? '',
            turno: colaborador.turno ?? '',
            status: colaborador.status ?? 'ativo',
            matricula: colaborador.matricula ?? '',
            lider_responsavel: colaborador.lider_responsavel ?? '',
            data_aniversario: colaborador.data_aniversario ?? '',
            data_contratacao: colaborador.data_contratacao ?? '',
            data_demissao: '',
            motivo_demissao: '',
            origem: 'retiradas',
            origem_id: colaborador.id,
          },
        ]),
      );
    } catch {
      setError('Erro ao importar colaborador.');
    }
  }, []);

  const cadastrar = useCallback(async (dados) => {
    try {
      const ref = await cadastrarColaboradorFS(dados);
      invalidateCache(CACHE_KEYS.fs);

      setColaboradores((prev) =>
        sortByNome([
          ...prev,
          {
            id: ref.id,
            ...dados,
            origem: 'fs',
          },
        ]),
      );
    } catch {
      setError('Erro ao cadastrar colaborador.');
    }
  }, []);

  const atualizar = useCallback(async (id, dados) => {
    try {
      await atualizarColaboradorFS(id, dados);
      invalidateCache(CACHE_KEYS.fs);

      setColaboradores((prev) =>
        sortByNome(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
      );
    } catch {
      setError('Erro ao atualizar colaborador.');
    }
  }, []);

  const deletar = useCallback(async (id) => {
    try {
      await deletarColaboradorFS(id);
      invalidateCache(CACHE_KEYS.fs);
      invalidateCache(CACHE_KEYS.historico(id));
      setColaboradores((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError('Erro ao deletar colaborador.');
    }
  }, []);

  const buscarHistorico = useCallback(async (id, force = false) => {
    const { data } = await getOrLoadCachedValue(
      CACHE_KEYS.historico(id),
      async () => {
        const resultado = await buscarHistoricoFS(id);
        logFirestoreRead({
          source: 'useFSColaboradores:historico',
          type: 'getDocs',
          path: `historico:${id}`,
          count:
            (resultado?.bancoHoras?.length ?? 0) +
            (resultado?.ferias?.length ?? 0) +
            (resultado?.escala?.length ?? 0),
        });
        return resultado;
      },
      { ttlMs: CACHE_TTL, force },
    );

    return data;
  }, []);

  const naoImportados = retiradas.filter(
    (item) => !colaboradores.some((fsItem) => fsItem.origem_id === item.id),
  );

  return {
    colaboradores,
    naoImportados,
    loading,
    error,
    importar,
    cadastrar,
    atualizar,
    deletar,
    buscarHistorico,
    carregar: () => carregar(true),
  };
};
