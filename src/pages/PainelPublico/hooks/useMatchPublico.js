import { useMemo } from "react";
import { useDashboardData } from "./useDashboardData";
import { buildMatchOSData } from "../../Mapa/utils/matchOs";

function sumRetiradasRelacionadas(section = []) {
  return section.reduce(
    (totalSection, item) =>
      totalSection +
      (item.cidades || []).reduce(
        (totalCidades, cidade) =>
          totalCidades + Number(cidade.totalRetiradasRelacionadas || 0),
        0,
      ),
    0,
  );
}

function normalizeMatchSlice(slice) {
  if (!slice) return null;
  if (slice.data?.regionais || slice.data?.agentes || slice.data?.resumo) {
    return slice.data;
  }
  if (slice.regionais || slice.agentes || slice.resumo) return slice;
  if (Array.isArray(slice.ordens)) return buildMatchOSData(slice.ordens);
  if (Array.isArray(slice.data?.ordens)) return buildMatchOSData(slice.data.ordens);
  return null;
}

function mergeMatchAgentes(matchData, agentesData) {
  if (!matchData && !agentesData) return null;

  const regionais = Array.isArray(matchData?.regionais)
    ? matchData.regionais
    : [];
  const agentes = Array.isArray(matchData?.agentes) && matchData.agentes.length
    ? matchData.agentes
    : Array.isArray(agentesData?.agentes)
      ? agentesData.agentes
      : [];

  const totalRegionais = regionais.length;
  const totalAgentes = agentes.reduce((sum, item) => sum + Number(item.totalCidades || 0), 0);
  const totalCidades =
    regionais.reduce((sum, item) => sum + Number(item.totalCidades || 0), 0) +
    totalAgentes;
  const totalMatches =
    regionais.reduce((sum, item) => sum + Number(item.totalMatches || 0), 0) +
    agentes.reduce((sum, item) => sum + Number(item.totalMatches || 0), 0);

  return {
    ...(matchData || {}),
    regionais,
    agentes,
    resumo: {
      ...(matchData?.resumo || {}),
      totalRegionais,
      totalAgentes,
      totalCidades,
      totalMatches,
      totalRetiradasRelacionadas:
        sumRetiradasRelacionadas(regionais) + sumRetiradasRelacionadas(agentes),
    },
  };
}

export function useMatchPublico() {
  const { data, loading } = useDashboardData();

  const matchData = useMemo(() => {
    const matchSliceData = normalizeMatchSlice(data?.matchOS);
    const agentesSlice = data?.agentesMatchOS || data?.matchAgentes || null;
    const agentesData = normalizeMatchSlice(agentesSlice);
    return mergeMatchAgentes(matchSliceData, agentesData);
  }, [data]);

  const ultimaAtualizacao = useMemo(
    () => data?.matchOS?.meta || data?.matchOS?.data?.meta || null,
    [data],
  );

  return { data: matchData, ultimaAtualizacao, loading };
}

