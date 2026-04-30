// hooks/useMapaOS.js — sem Firestore
import { useMemo } from "react";
import { useDashboardData } from "./useDashboardData";
import { buildPublicMapaSnapshot } from "../../Mapa/utils/mapaUtils";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Marco","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export function useMapaOS(enabled = true) {
  const { data, loading, error } = useDashboardData();

  const allData = useMemo(() => {
    if (!enabled || !data?.mapa) return {};

    const mapaSlice = data.mapa;
    let summary;

    if (mapaSlice.source === "public" && mapaSlice.summary) {
      summary = mapaSlice.summary;
    } else if (mapaSlice.ordens) {
      // fonte fallback: ordens brutas — processar com a mesma util
      summary = buildPublicMapaSnapshot(mapaSlice.ordens);
    } else {
      return {};
    }

    const replicated = {};
    MONTHS.forEach((month) => { replicated[month] = { summary }; });
    return replicated;
  }, [data, enabled]);

  const lastUpdate = useMemo(() => data?.mapa?.meta || null, [data]);

  const fbStatus = error
    ? "Erro ao carregar dados"
    : loading
    ? "Buscando resumo publico do mapa..."
    : allData?.Janeiro?.summary?.totalOrdens
    ? "Sincronizado"
    : "Nenhuma O.S em aberto encontrada";

  return {
    allData,
    loading: enabled ? loading : false,
    fbStatus,
    lastUpdate,
  };
}