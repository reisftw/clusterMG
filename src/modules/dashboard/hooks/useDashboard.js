import { useState, useEffect, useCallback, useMemo } from 'react';
import { carregarDadosDashboard } from '../services/dashboardService';
import { invalidateDashboardDataCache } from '../../../pages/PainelPublico/hooks/useDashboardData';
import { invalidateCache } from '../../../services/dataCache';
import { invalidateInternalStaticDataCache } from '../../../services/internalStaticDataService';
import { subscribeRealtimeTopics } from '../../../services/realtimeEvents';

function parseDateLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function hoje() {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate());
}

function mesAtualKey() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

export const useDashboard = () => {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      const resultado = await carregarDadosDashboard(force);
      setDados(resultado?.data ?? null);
    } catch {
      setError('Erro ao carregar dados do dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    return subscribeRealtimeTopics(
      ['dashboard', 'metas', 'mapa', 'match', 'acompanhamento'],
      (event) => {
        const token = event?.generatedAt || event?.emittedAt || new Date().toISOString();
        invalidateCache('metas');
        invalidateCache('metas-auditoria');
        invalidateInternalStaticDataCache(token);
        invalidateDashboardDataCache(token);
        carregar(true);
      },
      { debounceMs: 250 },
    );
  }, [carregar]);

  const resumo = useMemo(() => {
    if (!dados) return null;

    const agora = new Date();
    const hojeLocal = hoje();

    const feriadosProximos = dados.feriados
      .filter((item) => parseDateLocal(item.date) >= hojeLocal)
      .slice(0, 3);

    const tecnicosEmFerias = dados.ferias.filter((item) => {
      if (item.status !== 'aprovado') return false;
      const inicio = new Date(item.data_inicio);
      const fim = new Date(item.data_fim);
      return agora >= inicio && agora <= fim;
    }).length;
    const visitasNoMes = dados.visitas.filter((item) =>
      String(item.data || '').startsWith(mesAtualKey()),
    ).length;

    const proximoAniversariante = (() => {
      if (!dados.colaboradores?.length) return null;
      const lista = dados.colaboradores
        .filter(
          (item) =>
            item.data_nascimento &&
            (item.status === 'Ativo' || item.status === 'Em Experiencia'),
        )
        .map((item) => {
          const nasc = new Date(item.data_nascimento);
          const aniv = new Date(agora.getFullYear(), nasc.getMonth(), nasc.getDate());
          if (aniv < hojeLocal) aniv.setFullYear(agora.getFullYear() + 1);
          return { ...item, diffDias: Math.ceil((aniv - hojeLocal) / 86400000) };
        })
        .sort((a, b) => a.diffDias - b.diffDias);

      return lista[0] ?? null;
    })();

    return {
      feriadosProximos,
      tecnicosEmFerias,
      visitasNoMes,
      proximoAniversariante,
    };
  }, [dados]);

  return { dados, resumo, loading, error, carregar: () => carregar(true) };
};

