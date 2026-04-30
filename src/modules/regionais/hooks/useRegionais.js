import { useState, useEffect, useCallback } from "react";
import {
  atualizarRegional,
  buscarRegionais,
  criarRegional,
  excluirRegional,
} from "../services/regionaisService";
import { useAuthContext } from "../../../context/AuthContext";
import { registrarAtividade } from "../../../services/activityLogService";
import {
  buildCacheKey,
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

export const TIPOS_CIDADE = ["Comum", "Agente Aut."];

const CACHE_KEY = buildCacheKey(["regionais", "lista"]);
const CACHE_TTL_MS = 10 * 60 * 1000;

export const useRegionais = () => {
  const { currentUser } = useAuthContext();
  const [regionais, setRegionais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const { data, fromCache } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const itens = await buscarRegionais();
          logFirestoreRead({
            source: "useRegionais",
            operation: "getDocs",
            count: itens.length,
          });
          return itens;
        },
        { ttlMs: CACHE_TTL_MS, force },
      );

      if (fromCache) {
        logFirestoreRead({
          source: "useRegionais",
          operation: "cache-hit",
          cacheHit: true,
        });
      }

      setRegionais(data || []);
    } catch {
      setError("Erro ao carregar regionais.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = useCallback(async (dados) => {
    try {
      const ref = await criarRegional(dados);
      await registrarAtividade({
        usuarioId: currentUser?.id,
        nome: currentUser?.nome || "Sistema",
        acao: "criou regional",
        modulo: "regionais",
        detalhes: { nome: dados?.nome || null },
      });

      invalidateCache(CACHE_KEY);
      setRegionais((current) => [
        { id: ref.id, ...dados, criado_em: new Date() },
        ...current,
      ]);
    } catch {
      setError("Erro ao criar regional.");
    }
  }, [currentUser?.id, currentUser?.nome]);

  const atualizar = useCallback(async (id, dados) => {
    try {
      await atualizarRegional(id, dados);
      await registrarAtividade({
        usuarioId: currentUser?.id,
        nome: currentUser?.nome || "Sistema",
        acao: "atualizou regional",
        modulo: "regionais",
        entidadeId: id,
        detalhes: { nome: dados?.nome || null },
      });

      invalidateCache(CACHE_KEY);
      setRegionais((current) =>
        current.map((item) =>
          item.id === id ? { ...item, ...dados, atualizado_em: new Date() } : item,
        ),
      );
    } catch {
      setError("Erro ao atualizar regional.");
    }
  }, [currentUser?.id, currentUser?.nome]);

  const excluir = useCallback(async (id) => {
    try {
      await excluirRegional(id);
      await registrarAtividade({
        usuarioId: currentUser?.id,
        nome: currentUser?.nome || "Sistema",
        acao: "removeu regional",
        modulo: "regionais",
        entidadeId: id,
      });

      invalidateCache(CACHE_KEY);
      setRegionais((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Erro ao deletar regional.");
    }
  }, [currentUser?.id, currentUser?.nome]);

  return { regionais, loading, error, carregar, criar, atualizar, excluir };
};
