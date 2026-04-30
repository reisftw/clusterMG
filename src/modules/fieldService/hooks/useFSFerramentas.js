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

const COL_FERRAMENTAS = "fs_ferramentas";
const COL_EQUIPAMENTOS = "fs_equipamentos";
const COL_EPIS = "fs_epis";
const COL_ENTREGAS = "fs_itens_entregues";
const COL_PEDIDOS = "fs_pedidos_compra";
const CACHE_TTL_MS = 2 * 60 * 1000;

const TAB_COLLECTIONS = {
  inventario: [COL_FERRAMENTAS, COL_EQUIPAMENTOS, COL_EPIS, COL_PEDIDOS],
  ferramentas: [COL_FERRAMENTAS],
  equipamentos: [COL_EQUIPAMENTOS],
  epis: [COL_EPIS],
  pedidos: [COL_PEDIDOS],
};

const hasPermission = (roles, permission) => {
  if (!roles || !permission) return false;

  const permissions = {
    manage_fs_ferramentas: [
      "admin",
      "supervisor",
      "gerente",
      "coordenador",
      "lider_fs_i",
      "lider_fs_ii",
      "lider_fs_iii",
      "backoffice_fs_i",
      "backoffice_fs_ii",
      "backoffice_fs_iii",
    ],
  };

  const normalizedRoles = Array.isArray(roles) ? roles : [roles];
  return normalizedRoles.some((role) =>
    permissions[permission]?.includes(String(role).toLowerCase()),
  );
};

function mapSnapshot(snapshot) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
    criadoEm: docSnap.data().criadoEm?.toDate?.(),
    atualizadoEm: docSnap.data().atualizadoEm?.toDate?.(),
  }));
}

function buildQuery(collectionName, regionalId) {
  const constraints = [orderBy("criadoEm", "desc")];

  if (regionalId) {
    constraints.unshift(where("regionalId", "==", regionalId));
  }

  return query(collection(db, collectionName), ...constraints);
}

export const useFSFerramentas = ({
  regionalId = null,
  activeTab = "inventario",
  currentUser = null,
} = {}) => {
  const [ferramentas, setFerramentas] = useState([]);
  const [equipamentos, setEquipamentos] = useState([]);
  const [epis, setEpis] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const userRoles = useMemo(() => {
    if (!currentUser) return [];
    return Array.isArray(currentUser.roles)
      ? currentUser.roles
      : [currentUser.role || "user"];
  }, [currentUser]);

  const podeGerenciar = useMemo(
    () => hasPermission(userRoles, "manage_fs_ferramentas"),
    [userRoles],
  );

  const fetchCollection = useCallback(
    async (collectionName, force = false) => {
      const cacheKey = buildCacheKey([
        "fs-ferramentas",
        collectionName,
        regionalId || "todos",
      ]);

      const { data, fromCache } = await getOrLoadCachedValue(
        cacheKey,
        async () => {
          const snapshot = await getDocs(buildQuery(collectionName, regionalId));

          logFirestoreRead({
            source: `FSFerramentas/${collectionName}`,
            operation: "getDocs",
            count: snapshot.size,
            details: regionalId ? `regional=${regionalId}` : "regional=todos",
          });

          return mapSnapshot(snapshot);
        },
        { ttlMs: CACHE_TTL_MS, force },
      );

      if (fromCache) {
        logFirestoreRead({
          source: `FSFerramentas/${collectionName}`,
          operation: "cache-hit",
          cacheHit: true,
        });
      }

      return data || [];
    },
    [regionalId],
  );

  const carregar = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);

      try {
        const collectionsToLoad =
          TAB_COLLECTIONS[activeTab] || TAB_COLLECTIONS.inventario;

        const results = await Promise.all(
          collectionsToLoad.map((collectionName) =>
            fetchCollection(collectionName, force),
          ),
        );

        const mappedResults = Object.fromEntries(
          collectionsToLoad.map((collectionName, index) => [
            collectionName,
            results[index],
          ]),
        );

        if (mappedResults[COL_FERRAMENTAS]) {
          setFerramentas(mappedResults[COL_FERRAMENTAS]);
        }
        if (mappedResults[COL_EQUIPAMENTOS]) {
          setEquipamentos(mappedResults[COL_EQUIPAMENTOS]);
        }
        if (mappedResults[COL_EPIS]) {
          setEpis(mappedResults[COL_EPIS]);
        }
        if (mappedResults[COL_PEDIDOS]) {
          setPedidos(mappedResults[COL_PEDIDOS]);
        }
      } catch (loadError) {
        console.error(loadError);
        setError(loadError.message || "Erro ao carregar ferramentas do Field Service.");
      } finally {
        setLoading(false);
      }
    },
    [activeTab, fetchCollection],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const refreshCollection = useCallback(
    async (collectionName) => {
      invalidateCache(
        buildCacheKey(["fs-ferramentas", collectionName, regionalId || "todos"]),
      );

      const freshData = await fetchCollection(collectionName, true);

      if (collectionName === COL_FERRAMENTAS) setFerramentas(freshData);
      if (collectionName === COL_EQUIPAMENTOS) setEquipamentos(freshData);
      if (collectionName === COL_EPIS) setEpis(freshData);
      if (collectionName === COL_PEDIDOS) setPedidos(freshData);

      return freshData;
    },
    [fetchCollection, regionalId],
  );

  const criar = useCallback(
    async (collectionName, dados) => {
      if (!podeGerenciar) return { ok: false, erro: "Sem permissao" };

      try {
        const ref = await addDoc(collection(db, collectionName), {
          ...dados,
          criadoPor: auth.currentUser?.uid,
          criadoEm: serverTimestamp(),
        });

        await refreshCollection(collectionName);
        return { ok: true, id: ref.id };
      } catch (createError) {
        setError(createError.message);
        return { ok: false, erro: createError.message };
      }
    },
    [podeGerenciar, refreshCollection],
  );

  const atualizar = useCallback(
    async (collectionName, id, dados) => {
      if (!podeGerenciar) return { ok: false, erro: "Sem permissao" };

      try {
        await updateDoc(doc(db, collectionName, id), {
          ...dados,
          atualizadoEm: serverTimestamp(),
        });

        await refreshCollection(collectionName);
        return { ok: true };
      } catch (updateError) {
        setError(updateError.message);
        return { ok: false, erro: updateError.message };
      }
    },
    [podeGerenciar, refreshCollection],
  );

  const deletar = useCallback(
    async (collectionName, id) => {
      if (!podeGerenciar) return { ok: false, erro: "Sem permissao" };

      try {
        await deleteDoc(doc(db, collectionName, id));
        await refreshCollection(collectionName);
        return { ok: true };
      } catch (deleteError) {
        setError(deleteError.message);
        return { ok: false, erro: deleteError.message };
      }
    },
    [podeGerenciar, refreshCollection],
  );

  const registrarEntrega = useCallback(
    async ({
      itemId,
      itemTipo,
      colaboradorId,
      colaboradorNome,
      regionalId: itemRegionalId,
      data,
      observacao,
    }) => {
      if (!podeGerenciar) return { ok: false, erro: "Sem permissao" };

      try {
        await addDoc(collection(db, COL_ENTREGAS), {
          itemId,
          itemTipo,
          colaboradorId,
          colaboradorNome,
          regionalId: itemRegionalId,
          data,
          observacao,
          tipo: "entrega",
          criadoPor: auth.currentUser?.uid,
          criadoEm: serverTimestamp(),
        });

        const targetCollection =
          itemTipo === "equipamento" ? COL_EQUIPAMENTOS : COL_FERRAMENTAS;

        await updateDoc(doc(db, targetCollection, itemId), {
          status: "em_uso",
          colaboradorId,
          colaboradorNome,
          atualizadoEm: serverTimestamp(),
        });

        await refreshCollection(targetCollection);
        return { ok: true };
      } catch (deliveryError) {
        setError(deliveryError.message);
        return { ok: false, erro: deliveryError.message };
      }
    },
    [podeGerenciar, refreshCollection],
  );

  const registrarDevolucao = useCallback(
    async (entregaId, itemId, itemTipo) => {
      if (!podeGerenciar) return { ok: false, erro: "Sem permissao" };

      try {
        await updateDoc(doc(db, COL_ENTREGAS, entregaId), {
          tipo: "devolucao",
          devolvidoEm: serverTimestamp(),
        });

        const targetCollection =
          itemTipo === "equipamento" ? COL_EQUIPAMENTOS : COL_FERRAMENTAS;

        await updateDoc(doc(db, targetCollection, itemId), {
          status: "disponivel",
          colaboradorId: null,
          colaboradorNome: null,
          atualizadoEm: serverTimestamp(),
        });

        await refreshCollection(targetCollection);
        return { ok: true };
      } catch (returnError) {
        setError(returnError.message);
        return { ok: false, erro: returnError.message };
      }
    },
    [podeGerenciar, refreshCollection],
  );

  const kpis = useMemo(
    () => ({
      totalFerramentas: ferramentas.length,
      ferramentasDisponiveis: ferramentas.filter((item) => item.status === "disponivel")
        .length,
      ferramentasEmUso: ferramentas.filter((item) => item.status === "em_uso").length,
      ferramentasManutencao: ferramentas.filter((item) => item.status === "manutencao")
        .length,
      totalEquipamentos: equipamentos.length,
      equipDisp: equipamentos.filter((item) => item.status === "disponivel").length,
      equipEmUso: equipamentos.filter((item) => item.status === "em_uso").length,
      totalEpis: epis.length,
      pedidosPendentes: pedidos.filter((item) => item.status === "pendente").length,
    }),
    [epis, equipamentos, ferramentas, pedidos],
  );

  return {
    ferramentas,
    equipamentos,
    epis,
    entregas: [],
    pedidos,
    loading,
    error,
    userRoles,
    podeGerenciar,
    kpis,
    criarFerramenta: (dados) => criar(COL_FERRAMENTAS, dados),
    atualizarFerramenta: (id, dados) => atualizar(COL_FERRAMENTAS, id, dados),
    deletarFerramenta: (id) => deletar(COL_FERRAMENTAS, id),
    criarEquipamento: (dados) => criar(COL_EQUIPAMENTOS, dados),
    atualizarEquipamento: (id, dados) => atualizar(COL_EQUIPAMENTOS, id, dados),
    deletarEquipamento: (id) => deletar(COL_EQUIPAMENTOS, id),
    criarEpi: (dados) => criar(COL_EPIS, dados),
    atualizarEpi: (id, dados) => atualizar(COL_EPIS, id, dados),
    deletarEpi: (id) => deletar(COL_EPIS, id),
    criarPedido: (dados) => criar(COL_PEDIDOS, dados),
    atualizarPedido: (id, dados) => atualizar(COL_PEDIDOS, id, dados),
    deletarPedido: (id) => deletar(COL_PEDIDOS, id),
    registrarEntrega,
    registrarDevolucao,
    recarregar: () => carregar(true),
  };
};
