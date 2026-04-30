import { useState, useEffect, useCallback } from 'react';
import { buscarSaldos, buscarHistorico, salvarSaldo } from '../services/bancoHorasService';
import { useAuthContext } from '../../../context/AuthContext';
import { registrarAtividade } from '../../../services/activityLogService';
import {
  getOrLoadCachedValue,
  invalidateCache,
} from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';
import { regenerateStaticData } from '../../../services/staticDataService';
import { getInternalStaticDataSlice } from '../../../services/internalStaticDataService';

const CACHE_KEYS = {
  saldos: 'banco-horas:saldos',
  historico: (colaboradorId) => `banco-horas:historico:${colaboradorId}`,
};

const CACHE_TTL = 5 * 60 * 1000;

const sortSaldos = (items = []) =>
  [...items].sort((a, b) => (a?.colaborador_nome ?? '').localeCompare(b?.colaborador_nome ?? ''));

export const minutosParaObj = (minutos) => {
  const neg = minutos < 0;
  const abs = Math.abs(minutos);
  return { horas: Math.floor(abs / 60), minutos: abs % 60, negativo: neg };
};

export const objParaMinutos = ({ horas, minutos, negativo }) => {
  const total = Number(horas) * 60 + Number(minutos);
  return negativo ? -total : total;
};

export const formatarSaldo = (minutos) => {
  if (minutos === 0 || minutos == null) return '00:00h';
  const neg = minutos < 0;
  const abs = Math.abs(minutos);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `${neg ? '-' : '+'}${h}:${m}h`;
};

export const useBancoHoras = ({ preferStatic = false } = {}) => {
  const { currentUser } = useAuthContext();
  const [saldos, setSaldos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      if (preferStatic) {
        const staticSaldos = await getInternalStaticDataSlice(
          (payload) => payload?.bancoHoras?.saldos ?? null,
          { force },
        );
        setSaldos(sortSaldos(Array.isArray(staticSaldos) ? staticSaldos : []));
        setLoading(false);
        return;
      }

      const { data } = await getOrLoadCachedValue(
        CACHE_KEYS.saldos,
        async () => {
          const items = await buscarSaldos(force);
          logFirestoreRead({
            source: 'useBancoHoras:saldos',
            type: 'getDocs',
            path: 'banco_horas',
            count: items.length,
          });
          return sortSaldos(items);
        },
        { ttlMs: CACHE_TTL, force },
      );

      setSaldos(sortSaldos(data || []));
    } catch {
      setError('Erro ao carregar banco de horas.');
    } finally {
      setLoading(false);
    }
  }, [preferStatic]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = useCallback(async (dados) => {
    try {
      const ref = await salvarSaldo(dados);
      invalidateCache(CACHE_KEYS.saldos);
      invalidateCache(CACHE_KEYS.historico(dados?.colaborador_id));

      await registrarAtividade({
        usuarioId: currentUser?.id,
        nome: currentUser?.nome || 'Sistema',
        acao: 'atualizou saldo do banco de horas',
        modulo: 'banco_horas',
        entidadeId: dados?.colaborador_id ?? null,
        detalhes: {
          colaborador_id: dados?.colaborador_id ?? null,
          saldo_minutos: dados?.saldo_minutos ?? null,
          data_pgto_cobranca: dados?.data_pgto_cobranca ?? null,
        },
      });

      setSaldos((prev) =>
        sortSaldos([
          ...prev.filter((item) => item.colaborador_id !== dados?.colaborador_id),
          { id: ref.id, ...dados },
        ]),
      );
      void regenerateStaticData().catch(() => null);
    } catch {
      setError('Erro ao salvar banco de horas.');
    }
  }, [currentUser?.id, currentUser?.nome]);

  const buscarHistoricoColab = useCallback(async (colaboradorId, force = false) => {
    const { data } = await getOrLoadCachedValue(
      CACHE_KEYS.historico(colaboradorId),
      async () => {
        const items = await buscarHistorico(colaboradorId);
        logFirestoreRead({
          source: 'useBancoHoras:historico',
          type: 'getDocs',
          path: `banco_horas:${colaboradorId}`,
          count: items.length,
        });
        return items;
      },
      { ttlMs: CACHE_TTL, force },
    );

    return data || [];
  }, []);

  return { saldos, loading, error, salvar, carregar: () => carregar(true), buscarHistoricoColab };
};
