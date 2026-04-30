import { useCallback, useEffect, useMemo, useState } from "react";
import { buscarAtividadesFiltradas } from "../../../services/activityLogService";

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function useAuditoria() {
  const hoje = new Date().toISOString().slice(0, 10);

  const [filtros, setFiltros] = useState({
    modulo: "",
    usuario: "",
    acao: "",
    busca: "",
    dataInicio: hoje,
    dataFim: hoje,
  });
  const [atividadesBrutas, setAtividadesBrutas] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const data = await buscarAtividadesFiltradas({
        modulo: filtros.modulo,
        usuario: filtros.usuario,
        dataInicio: filtros.dataInicio,
        dataFim: filtros.dataFim,
        quantidade: 500,
        force,
      });
      setAtividadesBrutas(data);
    } catch (error) {
      console.error("Erro ao carregar auditoria:", error);
      setAtividadesBrutas([]);
    } finally {
      setLoading(false);
    }
  }, [filtros.dataFim, filtros.dataInicio, filtros.modulo, filtros.usuario]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atividades = useMemo(() => {
    const termoBusca = normalize(filtros.busca);

    return atividadesBrutas.filter((item) => {
      if (filtros.acao && item.acao !== filtros.acao) return false;

      if (!termoBusca) return true;

      const details = item.detalhes ? JSON.stringify(item.detalhes) : "";
      const haystack = normalize(
        `${item.nome} ${item.acao} ${item.modulo} ${item.entidade_id} ${details}`,
      );

      return haystack.includes(termoBusca);
    });
  }, [atividadesBrutas, filtros.acao, filtros.busca]);

  const opcoesModulo = useMemo(() => {
    const set = new Set(atividadesBrutas.map((item) => item.modulo).filter(Boolean));
    return Array.from(set).sort();
  }, [atividadesBrutas]);

  const opcoesUsuario = useMemo(() => {
    const set = new Set(atividadesBrutas.map((item) => item.nome).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [atividadesBrutas]);

  const opcoesAcao = useMemo(() => {
    const set = new Set(atividadesBrutas.map((item) => item.acao).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [atividadesBrutas]);

  return {
    filtros,
    setFiltros,
    atividades,
    loading,
    carregar,
    opcoesModulo,
    opcoesUsuario,
    opcoesAcao,
  };
}
