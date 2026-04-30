import { useCallback, useEffect, useState } from "react";
import {
  CAPACITY_PER_TECHNICIAN,
  carregarMapeamento,
  salvarVinculoRegional,
} from "../services/mapeamentoService";

export function useMapeamento() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingRegionalId, setSavingRegionalId] = useState(null);
  const [error, setError] = useState("");

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const payload = await carregarMapeamento(force);
      setData(payload);
    } catch (err) {
      console.error("Erro ao carregar mapeamento:", err);
      setError("Erro ao carregar o módulo de mapeamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvarVinculos = useCallback(async (regionalId, tecnicoIds) => {
    setSavingRegionalId(regionalId);
    setError("");
    try {
      await salvarVinculoRegional(regionalId, tecnicoIds);
      setData((current) => {
        if (!current) return current;

        const tecnicoIdsSet = new Set(tecnicoIds || []);
        const regionais = (current.regionais || []).map((regional) => {
          if (regional.id !== regionalId) return regional;

          const tecnicos = (current.tecnicosClt || []).filter((item) =>
            tecnicoIdsSet.has(item.id),
          );
          const capacidadeTotal = tecnicos.length * CAPACITY_PER_TECHNICIAN;
          const abertasMesAtual = Number(regional.abertasMesAtual || 0);
          const sobraEquipeAtiva = abertasMesAtual - capacidadeTotal;

          return {
            ...regional,
            tecnicos,
            tecnicoIds: tecnicos.map((item) => item.id),
            capacidadeTotal,
            sobraEquipeAtiva,
            alerta: sobraEquipeAtiva < CAPACITY_PER_TECHNICIAN,
          };
        });

        return {
          ...current,
          regionais,
          resumo: {
            ...(current.resumo || {}),
            totalTecnicosVinculados: regionais.reduce(
              (sum, regional) => sum + (regional.tecnicos?.length || 0),
              0,
            ),
            capacidadeTotal: regionais.reduce(
              (sum, regional) => sum + Number(regional.capacidadeTotal || 0),
              0,
            ),
            alertas: regionais.filter((regional) => regional.alerta).length,
          },
        };
      });
    } catch (err) {
      console.error("Erro ao salvar vínculo de mapeamento:", err);
      setError("Não foi possível salvar os vínculos da regional.");
      throw err;
    } finally {
      setSavingRegionalId(null);
    }
  }, [carregar]);

  return {
    data,
    loading,
    error,
    savingRegionalId,
    carregar,
    salvarVinculos,
  };
}
