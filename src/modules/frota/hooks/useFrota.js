import { useState, useEffect, useCallback } from "react";
import {
  atualizarAbastecimento,
  atualizarMulta,
  atualizarSinistro,
  atualizarVeiculo,
  buscarAbastecimentos,
  buscarChecklists,
  buscarMultas,
  buscarSinistros,
  buscarVeiculos,
  cadastrarAbastecimento,
  cadastrarMulta,
  cadastrarSinistro,
  cadastrarVeiculo,
  deletarAbastecimento,
  deletarMulta,
  deletarSinistro,
  deletarVeiculo,
  registrarChecklist,
} from "../services/frotaService";
import {
  buildCacheKey,
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const KM_ALERTA = 5000;
const CACHE_TTL_MS = 2 * 60 * 1000;

const CACHE_KEYS = {
  veiculos: buildCacheKey(["frota", "veiculos"]),
  checklists: buildCacheKey(["frota", "checklists"]),
  abastecimentos: buildCacheKey(["frota", "abastecimentos"]),
  multas: buildCacheKey(["frota", "multas"]),
  sinistros: buildCacheKey(["frota", "sinistros"]),
};

async function loadCachedList(cacheKey, source, loader, force = false) {
  const { data, fromCache } = await getOrLoadCachedValue(
    cacheKey,
    async () => {
      const items = await loader();
      logFirestoreRead({
        source,
        operation: "getDocs",
        count: items.length,
      });
      return items;
    },
    { ttlMs: CACHE_TTL_MS, force },
  );

  if (fromCache) {
    logFirestoreRead({
      source,
      operation: "cache-hit",
      cacheHit: true,
    });
  }

  return data || [];
}

export const useFrota = () => {
  const [veiculos, setVeiculos] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [multas, setMultas] = useState([]);
  const [sinistros, setSinistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const [veiculosData, checklistsData, abastecimentosData, multasData, sinistrosData] =
        await Promise.all([
          loadCachedList(CACHE_KEYS.veiculos, "useFrota/veiculos", buscarVeiculos, force),
          loadCachedList(
            CACHE_KEYS.checklists,
            "useFrota/checklists",
            buscarChecklists,
            force,
          ),
          loadCachedList(
            CACHE_KEYS.abastecimentos,
            "useFrota/abastecimentos",
            buscarAbastecimentos,
            force,
          ),
          loadCachedList(CACHE_KEYS.multas, "useFrota/multas", buscarMultas, force),
          loadCachedList(CACHE_KEYS.sinistros, "useFrota/sinistros", buscarSinistros, force),
        ]);

      setVeiculos(veiculosData);
      setChecklists(checklistsData);
      setAbastecimentos(abastecimentosData);
      setMultas(multasData);
      setSinistros(sinistrosData);
      setError(null);
    } catch {
      setError("Erro ao carregar dados da frota.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const veiculosAlerta = veiculos.filter(
    (veiculo) => veiculo.km_atual >= veiculo.km_proxima_manutencao - KM_ALERTA,
  );

  const cadastrar = useCallback(async (dados) => {
    try {
      const ref = await cadastrarVeiculo(dados);
      invalidateCache(CACHE_KEYS.veiculos);
      setVeiculos((current) => [...current, { id: ref.id, ...dados, criado_em: new Date() }]);
    } catch {
      setError("Erro ao cadastrar veículo.");
    }
  }, []);

  const atualizar = useCallback(async (id, dados) => {
    try {
      await atualizarVeiculo(id, dados);
      invalidateCache(CACHE_KEYS.veiculos);
      setVeiculos((current) =>
        current.map((item) =>
          item.id === id ? { ...item, ...dados, atualizado_em: new Date() } : item,
        ),
      );
    } catch {
      setError("Erro ao atualizar veículo.");
    }
  }, []);

  const deletar = useCallback(async (id) => {
    try {
      await deletarVeiculo(id);
      invalidateCache(CACHE_KEYS.veiculos);
      setVeiculos((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Erro ao deletar veículo.");
    }
  }, []);

  const salvarChecklist = useCallback(async (dados) => {
    try {
      const ref = await registrarChecklist(dados);
      invalidateCache(CACHE_KEYS.checklists);
      setChecklists((current) => [...current, { id: ref.id, ...dados, data: new Date() }]);
    } catch {
      setError("Erro ao salvar checklist.");
    }
  }, []);

  const salvarAbastecimento = useCallback(async (dados, id = null) => {
    try {
      if (id) {
        await atualizarAbastecimento(id, dados);
        setAbastecimentos((current) =>
          current.map((item) =>
            item.id === id ? { ...item, ...dados, atualizado_em: new Date() } : item,
          ),
        );
      } else {
        const ref = await cadastrarAbastecimento(dados);
        setAbastecimentos((current) => [...current, { id: ref.id, ...dados, criado_em: new Date() }]);
      }
      invalidateCache(CACHE_KEYS.abastecimentos);
    } catch {
      setError("Erro ao salvar abastecimento.");
    }
  }, []);

  const excluirAbastecimento = useCallback(async (id) => {
    try {
      await deletarAbastecimento(id);
      invalidateCache(CACHE_KEYS.abastecimentos);
      setAbastecimentos((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Erro ao excluir abastecimento.");
    }
  }, []);

  const salvarMulta = useCallback(async (dados, id = null) => {
    try {
      if (id) {
        await atualizarMulta(id, dados);
        setMultas((current) =>
          current.map((item) =>
            item.id === id ? { ...item, ...dados, atualizado_em: new Date() } : item,
          ),
        );
      } else {
        const ref = await cadastrarMulta(dados);
        setMultas((current) => [...current, { id: ref.id, ...dados, criado_em: new Date() }]);
      }
      invalidateCache(CACHE_KEYS.multas);
    } catch {
      setError("Erro ao salvar multa.");
    }
  }, []);

  const excluirMulta = useCallback(async (id) => {
    try {
      await deletarMulta(id);
      invalidateCache(CACHE_KEYS.multas);
      setMultas((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Erro ao excluir multa.");
    }
  }, []);

  const salvarSinistro = useCallback(async (dados, id = null) => {
    try {
      if (id) {
        await atualizarSinistro(id, dados);
        setSinistros((current) =>
          current.map((item) =>
            item.id === id ? { ...item, ...dados, atualizado_em: new Date() } : item,
          ),
        );
      } else {
        const ref = await cadastrarSinistro(dados);
        setSinistros((current) => [...current, { id: ref.id, ...dados, criado_em: new Date() }]);
      }
      invalidateCache(CACHE_KEYS.sinistros);
    } catch {
      setError("Erro ao salvar sinistro.");
    }
  }, []);

  const excluirSinistro = useCallback(async (id) => {
    try {
      await deletarSinistro(id);
      invalidateCache(CACHE_KEYS.sinistros);
      setSinistros((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Erro ao excluir sinistro.");
    }
  }, []);

  return {
    veiculos,
    checklists,
    abastecimentos,
    multas,
    sinistros,
    veiculosAlerta,
    loading,
    error,
    cadastrar,
    atualizar,
    deletar,
    salvarChecklist,
    salvarAbastecimento,
    excluirAbastecimento,
    salvarMulta,
    excluirMulta,
    salvarSinistro,
    excluirSinistro,
    carregar: () => carregar(true),
  };
};
