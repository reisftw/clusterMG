import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../../../services/firebase";
import { useDashboardData } from "../../PainelPublico/hooks/useDashboardData";

export function useMatchOS() {
  const { data, loading: dashboardLoading } = useDashboardData();
  const [ordens, setOrdens] = useState([]);
  const [loadingOrdens, setLoadingOrdens] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadOrdens() {
      if (!data?.matchOS) {
        if (active) setOrdens([]);
        return;
      }

      const slice = data.matchOS;

      if (Array.isArray(slice.ordens)) {
        if (active) setOrdens(slice.ordens);
        return;
      }

      if (slice.source !== "public") {
        if (active) setOrdens([]);
        return;
      }

      setLoadingOrdens(true);

      try {
        const snap = await getDocs(
          query(collection(db, "match_os_abertas"), orderBy("__name__")),
        );
        if (!active) return;

        setOrdens(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );
      } catch (error) {
        if (!active) return;
        console.error("[useMatchOS] Erro ao carregar ordens:", error);
        setOrdens([]);
      } finally {
        if (active) setLoadingOrdens(false);
      }
    }

    loadOrdens();

    return () => {
      active = false;
    };
  }, [data]);

  const ultimaAtualizacao = useMemo(() => data?.matchOS?.meta || null, [data]);

  return {
    ordens,
    ultimaAtualizacao,
    loading: dashboardLoading || loadingOrdens,
  };
}
