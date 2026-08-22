// hooks/useMapaHistorico.js
import { useMemo } from "react";
import { useDashboardData } from "../../PainelPublico/hooks/useDashboardData";

export function useMapaHistorico() {
  const { data, loading } = useDashboardData();

  const historico = useMemo(() => {
    return data?.mapa?.historico || [];
  }, [data]);

  return { historico, loading };
}
