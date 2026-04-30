// hooks/useRetiradas.js — sem Firestore
import { useMemo } from "react";
import { useDashboardData } from "./useDashboardData";
import { META_SAZONAL } from "../utils/constants";

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

function fmtDate(value) {
  if (!value) return "";
  const raw =
    typeof value === "string" ? value :
    value.texto || value.lastUpdate || value.updatedAt ||
    value.data || value.ultimaAtualizacao || null;
  const d = raw?.toDate?.() || (raw ? new Date(raw) : null);
  if (!d || isNaN(d)) return typeof raw === "string" ? raw : "";
  return d.toLocaleDateString("pt-BR", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
}

function normalizeMonthData(data) {
  const out = { ...data };
  for (const m of Object.keys(out)) {
    const d = out[m]; if (!d) continue;
    d.totalOS = toNumber(d.totalOS);
    d.meta    = toNumber(d.meta);
    d.metaSazonal = toNumber(d.metaSazonal) || toNumber(META_SAZONAL[m]) || 0;
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
  }
  return out;
}

export function useRetiradas(enabled = true) {
  const { data, loading, error } = useDashboardData();

  const allData = useMemo(() => {
    if (!enabled || !data?.painel?.retiradas?.result) return {};
    return normalizeMonthData(data.painel.retiradas.result);
  }, [data, enabled]);

  const lastUpdate = useMemo(() => {
    if (!data?.painel?.retiradas) return "";
    const months = Object.values(data.painel.retiradas.result || {}).map(fmtDate).find(Boolean);
    return months || fmtDate(data.painel.retiradas.meta) || "";
  }, [data]);

  return {
    allData,
    loading: enabled ? loading : false,
    fbStatus: error ? "Erro ao carregar dados" : loading ? "Carregando..." : "Sincronizado",
    lastUpdate,
  };
}
