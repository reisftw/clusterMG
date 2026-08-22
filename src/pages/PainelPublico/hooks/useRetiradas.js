// hooks/useRetiradas.js
import { useMemo } from "react";
import { useDashboardData } from "./useDashboardData";
import { META_SAZONAL } from "../utils/constants";
import { resolveVpsDate } from "../../../services/vpsDate";
import { applyMetasBaseConfigToAllData } from "../../../modules/metas/constants/metasBaseConfig";

function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = Number(v.replace("%","").replace(",",".").trim());
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function normalizeItem(item) {
  return { ...item,
    total: toNumber(item?.total), percent: toNumber(item?.percent),
    achieved: toNumber(item?.achieved), meta: toNumber(item?.meta) };
}

function normalizeMonthRecord(record, monthName) {
  if (!record) return record;
  const d = { ...record };
  d.totalOS = toNumber(d.totalOS);
  d.meta    = toNumber(d.meta);
  d.metaSazonal = toNumber(d.metaSazonal) || toNumber(META_SAZONAL[monthName]) || 0;
  d.cancelamentos =
    toNumber(d.cancelamentos) ||
    toNumber(d.totalCancelamentos) ||
    (d.meta > 0 && d.metaSazonal > 0
      ? d.meta / (d.metaSazonal / 100)
      : 0);
  d.percentAchieved = toNumber(d.percentAchieved);
  d.status  = d.percentAchieved >= 100
    ? "Meta atingida!"
    : `Faltam ${Math.max(0, Math.round(d.meta - d.totalOS))} O.S`;
  d.technicians = (d.technicians || []).map(normalizeItem);
  d.regionais   = (d.regionais   || []).map(normalizeItem);
  d.saldoDiario = (d.saldoDiario || []).map((item) => ({
    ...item,
    dia: toNumber(item?.dia),
    totalDia: toNumber(item?.totalDia),
  }));
  d.rawDays = (d.rawDays || []).map((item) => ({
    ...item,
    dia: toNumber(item?.dia),
    totalDia: toNumber(item?.totalDia),
  }));
  if (d.rawDays.length === 0 && d.saldoDiario.length > 0) {
    d.rawDays = d.saldoDiario.map((item) => ({
      dia: toNumber(item?.dia),
      equipe: toNumber(item?.equipe),
      agente: toNumber(item?.agente),
      loja: toNumber(item?.loja),
      regionais: toNumber(item?.regionais),
      totalDia: toNumber(item?.totalDia),
    }));
  }
  return d;
}

function fmtDate(value) {
  if (!value) return "";
  const raw =
    typeof value === "string" ? value :
    value.texto || value.lastUpdate || value.updatedAt ||
    value.data || value.ultimaAtualizacao || null;
  const d = resolveVpsDate(raw);
  if (!d || isNaN(d)) return typeof raw === "string" ? raw : "";
  return d.toLocaleDateString("pt-BR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
}

function normalizeMonthData(data) {
  const out = { ...data };
  for (const m of Object.keys(out)) {
    const d = normalizeMonthRecord(out[m], m);
    if (!d) continue;
    d.onnet = normalizeMonthRecord(d.onnet, m);
    d.onnetSempre = normalizeMonthRecord(d.onnetSempre, m);
    out[m] = d;
  }
  if (out.Marco && !out.Março) out.Março = { ...out.Marco, mes: "Março", month: "Março" };
  if (out.Março && !out.Marco) out.Marco = { ...out.Março, mes: "Marco", month: "Marco" };
  return out;
}

export function useRetiradas(enabled = true, options = {}) {
  const { data, loading, error } = useDashboardData({
    refreshKey: options.refreshKey || "",
  });

  const allData = useMemo(() => {
    if (!enabled || !data?.painel?.retiradas?.result) return {};
    const configuredData = applyMetasBaseConfigToAllData(
      data.painel.retiradas.result,
      data?.metas?.baseConfig || data?.painel?.retiradas?.baseConfig || null,
    );
    return normalizeMonthData(configuredData);
  }, [data, enabled]);

  const lastUpdate = useMemo(() => {
    if (!data?.painel?.retiradas) return "";
    const months = Object.values(data.painel.retiradas.result || {}).map(fmtDate).find(Boolean);
    return months || fmtDate(data.painel.retiradas.meta) || "";
  }, [data]);

  const forcaTarefa = useMemo(
    () => data?.painel?.forcaTarefa || null,
    [data],
  );

  const feriadosSet = useMemo(() => {
    const feriados = data?.painel?.retiradas?.feriados;
    return Array.isArray(feriados) && feriados.length > 0
      ? new Set(feriados)
      : null;
  }, [data]);

  const agentesData = useMemo(
    () => data?.painel?.agentes?.result || {},
    [data],
  );

  return {
    allData,
    agentesData,
    feriadosSet,
    forcaTarefa,
    loading: enabled ? loading : false,
    fbStatus: error ? "Erro ao carregar dados" : loading ? "Carregando..." : "Sincronizado",
    lastUpdate,
  };
}

