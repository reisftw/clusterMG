import { COLLECTIONS } from "../../../constants/dataCollections";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/dataCache";
import {
  createVpsDocument,
  deleteVpsDocument,
  listVpsDocuments,
  updateVpsDocument,
} from "../../../services/vpsApiClient";

const MAX_REGIONAIS = 150;
const CACHE_KEY = "regionais-service:lista";
const CACHE_TTL_MS = 30 * 60 * 1000;

const getRegionalSortLabel = (item = {}) => item?.nome || "";

export const buscarRegionais = async (force = false) => {
  const { data } = await getOrLoadCachedValue(
    `${CACHE_KEY}:vps`,
    async () =>
      (await listVpsDocuments(COLLECTIONS.REGIONAIS, {
        limit: MAX_REGIONAIS,
      })).sort((a, b) =>
        getRegionalSortLabel(a).localeCompare(getRegionalSortLabel(b)),
      ),
    { ttlMs: CACHE_TTL_MS, force },
  );

  return data || [];
};

export const criarRegional = async (dados) => {
  const ref = await createVpsDocument(COLLECTIONS.REGIONAIS, {
    ...dados,
    criado_em: new Date().toISOString(),
  });
  invalidateCache(CACHE_KEY);
  invalidateCache(`${CACHE_KEY}:vps`);
  return ref;
};

export const atualizarRegional = async (id, dados) => {
  await updateVpsDocument(`${COLLECTIONS.REGIONAIS}/${id}`, {
    ...dados,
    atualizado_em: new Date().toISOString(),
  });
  invalidateCache(CACHE_KEY);
  invalidateCache(`${CACHE_KEY}:vps`);
};

export const excluirRegional = async (id) => {
  await deleteVpsDocument(`${COLLECTIONS.REGIONAIS}/${id}`);
  invalidateCache(CACHE_KEY);
  invalidateCache(`${CACHE_KEY}:vps`);
};

