import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import {
  buildCacheKey,
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const COL = "fs_reclamacoes";
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_KEY = buildCacheKey(["fs-reclamacoes", "lista"]);

export function useFSReclamacoes() {
  const [reclamacoes, setReclamacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      const { data, fromCache } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const snapshot = await getDocs(
            query(collection(db, COL), orderBy("criado_em", "desc")),
          );

          logFirestoreRead({
            source: "FieldService/useFSReclamacoes",
            operation: "getDocs",
            count: snapshot.size,
          });

          return snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
        },
        { ttlMs: CACHE_TTL_MS, force },
      );

      if (fromCache) {
        logFirestoreRead({
          source: "FieldService/useFSReclamacoes",
          operation: "cache-hit",
          cacheHit: true,
        });
      }

      setReclamacoes(data || []);
    } catch (loadError) {
      setError("Erro ao carregar reclamações.");
      console.error(loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const refreshLocalState = useCallback((updater) => {
    setReclamacoes((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      invalidateCache(CACHE_KEY);
      return next;
    });
  }, []);

  const cadastrar = useCallback(async (dados) => {
    try {
      const ref = await addDoc(collection(db, COL), {
        ...dados,
        status: "aberta",
        criado_em: serverTimestamp(),
        atualizado_em: serverTimestamp(),
      });

      await carregar(true);
      return ref.id;
    } catch (createError) {
      console.error("Erro ao cadastrar:", createError);
      setError("Erro ao cadastrar reclamação.");
      return null;
    }
  }, [carregar]);

  const atualizar = useCallback(async (id, dados) => {
    try {
      await updateDoc(doc(db, COL, id), {
        ...dados,
        atualizado_em: serverTimestamp(),
      });

      refreshLocalState((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...dados,
                atualizado_em: new Date(),
              }
            : item,
        ),
      );
    } catch (updateError) {
      console.error("Erro ao atualizar:", updateError);
      setError("Erro ao atualizar reclamação.");
    }
  }, [refreshLocalState]);

  const deletar = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, COL, id));

      refreshLocalState((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      console.error("Erro ao deletar:", deleteError);
      setError("Erro ao deletar reclamação.");
    }
  }, [refreshLocalState]);

  return { reclamacoes, loading, error, cadastrar, atualizar, deletar, carregar };
}
