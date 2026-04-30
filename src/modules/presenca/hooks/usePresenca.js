import { useState, useCallback } from 'react';
import {
  buscarPresencasPorData, buscarPresencasPorPeriodo,
  salvarPresenca, atualizarPresenca,
} from '../services/presencaService';

export const usePresenca = () => {
  const [presencas, setPresencas] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const carregarPorData = useCallback(async (data) => {
    setLoading(true);
    try {
      const dados = await buscarPresencasPorData(data);
      setPresencas(dados);
    } catch {
      setError('Erro ao carregar presenças.');
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarPorPeriodo = useCallback(async (inicio, fim) => {
    setLoading(true);
    try {
      const dados = await buscarPresencasPorPeriodo(inicio, fim);
      setPresencas(dados);
      return dados;
    } catch {
      setError('Erro ao carregar presenças.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const salvar = useCallback(async (dados) => {
    try {
      const existing = presencas.find(
        (p) => p.colaborador_id === dados.colaborador_id && p.data === dados.data
      );
      if (existing) {
        await atualizarPresenca(existing.id, dados);
      } else {
        await salvarPresenca(dados);
      }
      await carregarPorData(dados.data);
    } catch {
      setError('Erro ao salvar presença.');
    }
  }, [presencas, carregarPorData]);

  return { presencas, loading, error, carregarPorData, carregarPorPeriodo, salvar };
};
