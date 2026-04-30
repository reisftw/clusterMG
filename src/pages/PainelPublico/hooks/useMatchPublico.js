// hooks/useMatchPublico.js — sem Firestore
import { useMemo } from "react";
import { useDashboardData } from "./useDashboardData";
import { buildMatchOSData } from "../../Mapa/utils/matchOs";

export function useMatchPublico() {
  const { data, loading, error } = useDashboardData();

  const matchData = useMemo(() => {
    if (!data?.matchOS) return null;
    const slice = data.matchOS;
    if (slice.source === "public" && slice.data) return slice.data;
    if (slice.ordens) return buildMatchOSData(slice.ordens);
    return null;
  }, [data]);

  const ultimaAtualizacao = useMemo(() => data?.matchOS?.meta || null, [data]);

  return { data: matchData, ultimaAtualizacao, loading };
}