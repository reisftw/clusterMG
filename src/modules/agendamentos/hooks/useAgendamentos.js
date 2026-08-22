import { useCallback, useEffect, useMemo, useState } from "react";
import {
  atualizarAgendamento,
  buscarAgendamentos,
  criarAgendamento,
  excluirAgendamento,
} from "../services/agendamentosService";
import {
  getOrLoadCachedValue,
  setCachedValue,
} from "../../../services/dataCache";

const CACHE_KEY = "agendamentos:lista:v2";
const CACHE_TTL = 5 * 60 * 1000;

const sortByData = (items = []) =>
  [...items].sort((a, b) => {
    const dataCompare = String(a?.data ?? "").localeCompare(String(b?.data ?? ""));
    if (dataCompare !== 0) return dataCompare;
    return String(a?.tecnico_nome ?? "").localeCompare(String(b?.tecnico_nome ?? ""), "pt-BR");
  });

const getTodayKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const useAgendamentos = () => {
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const items = await buscarAgendamentos();
          return sortByData(items);
        },
        { ttlMs: CACHE_TTL, force },
      );
      setAgendamentos(sortByData(data || []));
    } catch {
      setError("Erro ao carregar agendamentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = useCallback(
    async (dados) => {
      const ref = await criarAgendamento(dados);
      setAgendamentos((prev) => {
        const next = sortByData([...prev, { id: ref.id, ...dados }]);
        setCachedValue(CACHE_KEY, next);
        return next;
      });
      return ref;
    },
    [],
  );

  const atualizar = useCallback(
    async (id, dados) => {
      await atualizarAgendamento(id, dados);
      setAgendamentos((prev) => {
        const next = sortByData(
          prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
        );
        setCachedValue(CACHE_KEY, next);
        return next;
      });
    },
    [],
  );

  const excluir = useCallback(
    async (id) => {
      await excluirAgendamento(id);
      setAgendamentos((prev) => {
        const next = prev.filter((item) => item.id !== id);
        setCachedValue(CACHE_KEY, next);
        return next;
      });
    },
    [],
  );

  const hoje = useMemo(() => getTodayKey(), []);
  const agendamentosHoje = useMemo(
    () => agendamentos.filter((item) => item.data === hoje),
    [agendamentos, hoje],
  );

  const aplicarAtualizacaoLocal = useCallback((id, dados) => {
    setAgendamentos((prev) => {
      const next = sortByData(
        prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
      );
      setCachedValue(CACHE_KEY, next);
      return next;
    });
  }, []);

  return {
    agendamentos,
    agendamentosHoje,
    loading,
    error,
    carregar,
    criar,
    atualizar,
    excluir,
    aplicarAtualizacaoLocal,
  };
};

