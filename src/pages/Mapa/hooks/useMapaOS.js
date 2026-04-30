import { useEffect, useState } from "react";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";

export function useMapaOS() {
  const [ordens, setOrdens] = useState([]);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadOrdens(force = false) {
      setLoading(true);

      const staticSlice = await getInternalStaticDataSlice(
        (payload) => payload?.mapa ?? null,
        { force },
      );

      if (!active) return;

      setOrdens(Array.isArray(staticSlice?.ordens) ? staticSlice.ordens : []);
      setUltimaAtualizacao(staticSlice?.meta || null);
      setLoading(false);
    }

    loadOrdens();

    return () => {
      active = false;
    };
  }, []);

  return {
    ordens,
    ultimaAtualizacao,
    loading,
  };
}
