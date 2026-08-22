import { useCallback, useEffect, useState } from "react";
import {
  getInternalSnapshotSlice,
  SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import { regenerateStaticData } from "../../../services/staticDataService";
import {
  normalizeDuvidasContent,
  salvarDuvidasContent,
} from "../services/duvidasService";

const EMPTY_STATE = normalizeDuvidasContent({});

export function useDuvidas() {
  const [conteudo, setConteudo] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getInternalSnapshotSlice(
        SNAPSHOT_DOMAINS.DASHBOARD,
        (payload) => payload?.duvidas ?? null,
        { force },
      );
      setConteudo(normalizeDuvidasContent(snapshot || {}));
    } catch (err) {
      setError(err?.message || "Erro ao carregar duvidas.");
      setConteudo(EMPTY_STATE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = useCallback(async (nextContent) => {
    setSaving(true);
    setError(null);
    try {
      const normalized = await salvarDuvidasContent(nextContent);
      setConteudo(normalized);
      try {
        await regenerateStaticData();
        await carregar(true);
      } catch (publishError) {
        console.warn(
          "[useDuvidas] Conteudo salvo, mas nao foi possivel atualizar o JSON estatico:",
          publishError,
        );
      }
    } catch (err) {
      setError(err?.message || "Erro ao salvar duvidas.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [carregar]);

  return {
    conteudo,
    loading,
    saving,
    error,
    carregar: () => carregar(true),
    salvar,
  };
}

