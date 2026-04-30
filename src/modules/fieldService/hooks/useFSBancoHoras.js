import { useCallback, useEffect, useMemo, useState } from "react";
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
  where,
} from "firebase/firestore";
import { auth, db } from "../../../services/firebase.js";
import {
  buildCacheKey,
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const CACHE_TTL_MS = 2 * 60 * 1000;

function buildBancoHorasQuery(regionalId, colaboradorId) {
  const constraints = [orderBy("data", "desc")];

  if (regionalId) constraints.unshift(where("regionalId", "==", regionalId));
  if (colaboradorId) constraints.unshift(where("colaborador_id", "==", colaboradorId));

  return query(collection(db, "banco_horas"), ...constraints);
}

export const useFSBancoHoras = ({
  currentUser = null,
  regionalId = null,
  colaboradorId = null,
  colaboradores = [],
  regionais = [],
} = {}) => {
  const [lancamentos, setLancamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const userRole = currentUser?.role || null;

  const colaboradoresFiltrados = useMemo(() => {
    if (!Array.isArray(colaboradores)) return [];

    if (!regionalId) {
      return colaboradores.filter(
        (item) => item.status === "Ativo" || item.status === "Em Experiência",
      );
    }

    return colaboradores.filter(
      (item) =>
        item.regionalId === regionalId &&
        (item.status === "Ativo" || item.status === "Em Experiência"),
    );
  }, [colaboradores, regionalId]);

  const carregar = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);

      try {
        const cacheKey = buildCacheKey([
          "fs-banco-horas",
          regionalId || "todos",
          colaboradorId || "todos",
        ]);

        const { data, fromCache } = await getOrLoadCachedValue(
          cacheKey,
          async () => {
            const snapshot = await getDocs(
              buildBancoHorasQuery(regionalId, colaboradorId),
            );

            logFirestoreRead({
              source: "FSBancoHoras/useFSBancoHoras",
              operation: "getDocs",
              count: snapshot.size,
              details: `regional=${regionalId || "todos"} colaborador=${colaboradorId || "todos"}`,
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
            source: "FSBancoHoras/useFSBancoHoras",
            operation: "cache-hit",
            cacheHit: true,
          });
        }

        setLancamentos(data || []);
      } catch (loadError) {
        console.error(loadError);
        setError(loadError.message || "Erro ao carregar banco de horas.");
      } finally {
        setLoading(false);
      }
    },
    [colaboradorId, regionalId],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const invalidateCurrentCache = useCallback(() => {
    invalidateCache(
      buildCacheKey([
        "fs-banco-horas",
        regionalId || "todos",
        colaboradorId || "todos",
      ]),
    );
  }, [colaboradorId, regionalId]);

  const adicionarLancamento = useCallback(
    async (dados) => {
      if (!userRole) return false;

      setError(null);

      try {
        await addDoc(collection(db, "banco_horas"), {
          ...dados,
          usuarioCriacao: auth.currentUser?.uid,
          regionalId: dados.regionalId || null,
          dataLancamento: serverTimestamp(),
          criadoEm: serverTimestamp(),
        });

        invalidateCurrentCache();
        await carregar(true);
        return true;
      } catch (createError) {
        setError(createError.message);
        return false;
      }
    },
    [carregar, invalidateCurrentCache, userRole],
  );

  const atualizarLancamento = useCallback(
    async (id, dados) => {
      if (!userRole) return false;

      const podeEditar =
        userRole === "admin" || dados.colaboradorId === auth.currentUser?.uid;

      if (!podeEditar) {
        setError("Sem permissão para editar este lançamento");
        return false;
      }

      setError(null);

      try {
        await updateDoc(doc(db, "banco_horas", id), {
          ...dados,
          updatedAt: serverTimestamp(),
        });

        invalidateCurrentCache();
        await carregar(true);
        return true;
      } catch (updateError) {
        setError(updateError.message);
        return false;
      }
    },
    [carregar, invalidateCurrentCache, userRole],
  );

  const deletarLancamento = useCallback(
    async (id) => {
      if (!userRole || userRole !== "admin") {
        setError("Apenas admin pode deletar");
        return false;
      }

      setError(null);

      try {
        await deleteDoc(doc(db, "banco_horas", id));
        invalidateCurrentCache();
        await carregar(true);
        return true;
      } catch (deleteError) {
        setError(deleteError.message);
        return false;
      }
    },
    [carregar, invalidateCurrentCache, userRole],
  );

  const calcularSaldoAtual = useCallback((lista) => {
    if (!Array.isArray(lista)) return 0;

    return lista.reduce((saldo, lancamento) => {
      const [horas, minutos] = String(lancamento.horas || "0:0")
        .split(":")
        .map(Number);

      const totalMinutos = (horas || 0) * 60 + (minutos || 0);
      return saldo + (lancamento.tipo === "debito" ? -totalMinutos : totalMinutos);
    }, 0);
  }, []);

  const lancamentosPorColaborador = useMemo(() => {
    if (!Array.isArray(lancamentos) || !Array.isArray(colaboradoresFiltrados)) {
      return [];
    }

    const agrupado = {};

    lancamentos.forEach((lancamento) => {
      const colaborador = colaboradoresFiltrados.find(
        (item) => item.id === lancamento.colaborador_id,
      );
      const nome = colaborador?.nome?.split(" ")[0] || "Colaborador";

      if (!agrupado[lancamento.colaborador_id]) {
        agrupado[lancamento.colaborador_id] = {
          id: lancamento.colaborador_id,
          nome,
          regionalId: colaborador?.regionalId || "",
          regionalNome:
            regionais.find((item) => item.id === colaborador?.regionalId)?.nome || "",
          cargo: colaborador?.cargo || "",
          saldo: 0,
          lancamentos: [],
        };
      }

      agrupado[lancamento.colaborador_id].saldo = calcularSaldoAtual([
        ...agrupado[lancamento.colaborador_id].lancamentos,
        lancamento,
      ]);
      agrupado[lancamento.colaborador_id].lancamentos.push(lancamento);
    });

    return Object.values(agrupado);
  }, [calcularSaldoAtual, colaboradoresFiltrados, lancamentos, regionais]);

  const totalLancamentos = Array.isArray(lancamentos) ? lancamentos.length : 0;
  const totalHoras = calcularSaldoAtual(lancamentos);

  return {
    lancamentos,
    lancamentosPorColaborador,
    colaboradoresFiltrados,
    loading,
    error,
    userRole,
    totalLancamentos,
    totalHoras,
    adicionarLancamento,
    atualizarLancamento,
    deletarLancamento,
    calcularSaldoAtual,
    recarregar: () => carregar(true),
  };
};
