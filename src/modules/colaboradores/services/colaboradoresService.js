import { COLLECTIONS } from "../../../constants/dataCollections";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/dataCache";
import {
  getInternalSnapshotSlice,
  SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import {
  createVpsDocument,
  deleteVpsDocument,
  listVpsDocuments,
  updateVpsDocument,
} from "../../../services/vpsApiClient";

const MAX_COLABORADORES = 300;
const CACHE_KEY = "colaboradores-service:lista";
const CACHE_TTL_MS = 30 * 60 * 1000;

export const buscarColaboradores = async (
  force = false,
  { allowFallback = true } = {},
) => {
  if (!force) {
    const staticItems = await getInternalSnapshotSlice(
      SNAPSHOT_DOMAINS.RH,
      (payload) => payload?.colaboradores?.items ?? null,
    );
    if (Array.isArray(staticItems) && staticItems.length > 0) {
      return staticItems;
    }

    const dashboardItems = await getInternalSnapshotSlice(
      SNAPSHOT_DOMAINS.DASHBOARD,
      (payload) => payload?.colaboradores?.items ?? null,
    );
    if (Array.isArray(dashboardItems) && dashboardItems.length > 0) {
      return dashboardItems;
    }
  }

  if (!allowFallback) {
    return [];
  }

  const { data } = await getOrLoadCachedValue(
    `${CACHE_KEY}:vps`,
    async () =>
      (await listVpsDocuments(COLLECTIONS.COLABORADORES, {
        limit: MAX_COLABORADORES,
      })).sort((a, b) =>
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
      ),
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const cadastrarColaborador = async (dados) => {
  const ref = await createVpsDocument(COLLECTIONS.COLABORADORES, {
    ...dados,
    criado_em: new Date().toISOString(),
  });
  invalidateCache(CACHE_KEY);
  invalidateCache(`${CACHE_KEY}:vps`);
  return ref;
};

export const atualizarColaborador = async (id, dados) => {
  await updateVpsDocument(`${COLLECTIONS.COLABORADORES}/${id}`, {
    ...dados,
    atualizado_em: new Date().toISOString(),
  });
  invalidateCache(CACHE_KEY);
  invalidateCache(`${CACHE_KEY}:vps`);
};

export const deletarColaborador = async (id) => {
  await deleteVpsDocument(`${COLLECTIONS.COLABORADORES}/${id}`);
  invalidateCache(CACHE_KEY);
  invalidateCache(`${CACHE_KEY}:vps`);
};

