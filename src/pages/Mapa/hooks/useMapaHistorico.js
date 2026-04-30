// hooks/useMapaHistorico.js — sem Firestore
import { useMemo } from "react";
import { useDashboardData } from "../../PainelPublico/hooks/useDashboardData";

export function useMapaHistorico() {
  const { data, loading } = useDashboardData();

  const historico = useMemo(() => {
    return data?.mapa?.historico || [];
  }, [data]);

  return { historico, loading };
}