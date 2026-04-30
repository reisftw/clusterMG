// hooks/useAgentesMatchPublico.js — sem Firestore
import { useMemo } from "react";
import { useDashboardData } from "./useDashboardData";
import { buildMatchOSData } from "../../Mapa/utils/matchOs";

export function useAgentesMatchPublico() {
  const { data, loading, error } = useDashboardData();

  const matchData = useMemo(() => {
    if (!data?.matchAgentes) return null;
    const slice = data.matchAgentes;

    if (slice.source === "public" && slice.data) return slice.data;

    if (slice.ordens) {
      const raw = buildMatchOSData(slice.ordens);
      return {
        agentes: raw.agentes,
        regionais: [],
        resumo: {
          ...raw.resumo,
          totalRegionais: 0,
          totalCidades:  raw.agentes.reduce((s, i) => s + i.totalCidades, 0),
          totalMatches:  raw.agentes.reduce((s, i) => s + i.totalMatches, 0),
        },
      };
    }
    return null;
  }, [data]);

  const ultimaAtualizacao = useMemo(() => data?.matchAgentes?.meta || null, [data]);

  return { data: matchData, ultimaAtualizacao, loading };
}