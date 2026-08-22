import { useMemo } from "react";
import { useDashboardData } from "../../PainelPublico/hooks/useDashboardData";

export function useMatchOS() {
  const { data, loading } = useDashboardData();
  const ordens = useMemo(
    () => (Array.isArray(data?.matchOS?.ordens) ? data.matchOS.ordens : []),
    [data],
  );

  const ultimaAtualizacao = useMemo(() => data?.matchOS?.meta || null, [data]);
  const mensagens = useMemo(() => data?.matchOS?.meta?.mensagens || null, [data]);

  return {
    ordens,
    ultimaAtualizacao,
    mensagens,
    loading,
  };
}

