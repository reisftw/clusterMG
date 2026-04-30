import { useEffect, useState, useCallback } from 'react';
import { getInternalStaticDataSlice } from '../../../services/internalStaticDataService';

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export const useMetasDashboard = () => {
  const [metaMes,     setMetaMes]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [feriadosSet, setFeriadosSet] = useState(new Set());

  const carregar = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const [todos, feriados] = await Promise.all([
        getInternalStaticDataSlice((payload) => payload?.metas?.all ?? null, { force }),
        getInternalStaticDataSlice((payload) => payload?.metas?.feriados ?? null, { force }),
      ]);
      const agora   = new Date();
      const mesNome = MESES[agora.getMonth()];
      const dados   = todos && typeof todos === 'object' ? (todos?.[mesNome] ?? null) : null;
      setMetaMes(dados);
      setFeriadosSet(new Set(Array.isArray(feriados) ? feriados : []));
    } catch (e) {
      console.error('Erro ao carregar metas dashboard', e);
      setMetaMes(null);
      setFeriadosSet(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return { metaMes, loading, feriadosSet, refetch: () => carregar(true) };
};
