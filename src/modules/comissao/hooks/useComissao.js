import { useState, useEffect, useCallback } from 'react';
import {
  buscarConfig,
  salvarConfig,
  buscarComissoesPorAno,
  salvarComissao,
} from '../services/comissaoService';
import { buscarPresencasPorPeriodo } from '../../presenca/services/presencaService';
import { getOrLoadCachedValue, invalidateCache } from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';
import { regenerateStaticData } from '../../../services/staticDataService';

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const CACHE_KEYS = {
  config: 'comissao:config',
  ano: (ano) => `comissao:ano:${ano}`,
  presencas: (ano) => `comissao:presencas:${ano}`,
};
const CACHE_TTL = 10 * 60 * 1000;

export const useComissao = (anoInicial) => {
  const anoAtual = anoInicial ?? new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [config, setConfig] = useState({ meta_mensal: 110, valor_por_servico: 5 });
  const [registros, setRegistros] = useState([]);
  const [faltasMapa, setFaltasMapa] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: cfg }, { data: regs }, { data: presencas }] = await Promise.all([
        getOrLoadCachedValue(
          CACHE_KEYS.config,
          async () => {
            const item = await buscarConfig();
            logFirestoreRead({
              source: 'useComissao:config',
              operation: 'getDoc',
              path: 'comissao_config/global',
              count: 1,
            });
            return item;
          },
          { ttlMs: CACHE_TTL, force },
        ),
        getOrLoadCachedValue(
          CACHE_KEYS.ano(ano),
          async () => {
            const items = await buscarComissoesPorAno(ano, true);
            logFirestoreRead({
              source: 'useComissao:registros',
              operation: 'getDocs',
              path: 'comissoes',
              count: items.length,
            });
            return items;
          },
          { ttlMs: CACHE_TTL, force },
        ),
        getOrLoadCachedValue(
          CACHE_KEYS.presencas(ano),
          async () => {
            const items = await buscarPresencasPorPeriodo(`${ano}-01-01`, `${ano}-12-31`);
            logFirestoreRead({
              source: 'useComissao:presencas',
              operation: 'getDocs',
              path: 'presencas',
              count: items.length,
            });
            return items;
          },
          { ttlMs: CACHE_TTL, force },
        ),
      ]);

      setConfig(cfg || { meta_mensal: 110, valor_por_servico: 5 });
      setRegistros(regs || []);

      const mapa = {};
      (presencas || []).forEach((p) => {
        if (p.presente) return;
        const mesIdx = parseInt(p.data.split('-')[1], 10) - 1;
        const chave = `${p.colaborador_id}_${mesIdx}`;
        mapa[chave] = (mapa[chave] ?? 0) + 1;
      });
      setFaltasMapa(mapa);
    } catch {
      setError('Erro ao carregar comissões.');
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atualizarConfig = useCallback(async (novaConfig) => {
    await salvarConfig(novaConfig);
    invalidateCache(CACHE_KEYS.config);
    setConfig(novaConfig);
    void regenerateStaticData().catch(() => null);
  }, []);

  const lancarServicos = useCallback(async (colaboradorId, mes, servicos) => {
    const id = await salvarComissao({
      colaborador_id: colaboradorId,
      ano,
      mes,
      servicos: Number(servicos),
    });

    invalidateCache(CACHE_KEYS.ano(ano));
    setRegistros((prev) => {
      const next = [...prev];
      const index = next.findIndex(
        (item) => item.colaborador_id === colaboradorId && item.ano === ano && item.mes === mes,
      );

      const registro = {
        id: index >= 0 ? next[index].id : id,
        colaborador_id: colaboradorId,
        ano,
        mes,
        servicos: Number(servicos),
      };

      if (index >= 0) next[index] = { ...next[index], ...registro };
      else next.push(registro);

      return next;
    });
    void regenerateStaticData().catch(() => null);
  }, [ano]);

  const buildTabela = useCallback((colaboradores) => {
    return colaboradores.map((colab) => {
      const mesesData = MESES.map((_, mesIdx) => {
        const reg = registros.find(
          (item) => item.colaborador_id === colab.id && item.mes === mesIdx,
        );
        const servicos = reg?.servicos ?? 0;
        const comissao = servicos * config.valor_por_servico;
        const faltas = faltasMapa[`${colab.id}_${mesIdx}`] ?? 0;
        const pctMeta = config.meta_mensal > 0 ? servicos / config.meta_mensal : 0;
        return { servicos, comissao, faltas, pctMeta };
      });

      const totalServicos = mesesData.reduce((soma, item) => soma + item.servicos, 0);
      const mediaMes = totalServicos / 12;
      const pctMedia = config.meta_mensal > 0 ? mediaMes / config.meta_mensal : 0;
      const totalComissao = totalServicos * config.valor_por_servico;

      return { colab, meses: mesesData, totalServicos, mediaMes, pctMedia, totalComissao };
    });
  }, [registros, config, faltasMapa]);

  return {
    ano, setAno, config, loading, error,
    atualizarConfig, lancarServicos, buildTabela, carregar: () => carregar(true),
  };
};
