import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import {
	createVpsDocument,
	deleteVpsDocument,
	getVpsDocument,
	listVpsDocuments,
	setVpsDocument,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

const COL = "ferramentas_regionais";
const REGIONAIS_MAX = 150;
const CACHE_TTL_MS = 30 * 60 * 1000;

const CACHE_KEYS = {
	regionais: "ferramentas-service:regionais",
	config: "ferramentas-service:config",
};

export const getRegionais = async (force = false) => {
	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.regionais,
		async () => {
			return (await listVpsDocuments(COL, { limit: REGIONAIS_MAX })).sort(
				(a, b) =>
					String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
			);
		},
		{ ttlMs: CACHE_TTL_MS, force },
	);

	return data || [];
};

export const addRegional = async (data) => {
	const ref = await createVpsDocument(COL, {
		...data,
		criadoEm: new Date().toISOString(),
	});
	invalidateCache(CACHE_KEYS.regionais);
	return ref;
};

export const updateRegional = async (id, data) => {
	await updateVpsDocument(`${COL}/${id}`, data);
	invalidateCache(CACHE_KEYS.regionais);
};

export const deleteRegional = async (id) => {
	await deleteVpsDocument(`${COL}/${id}`);
	invalidateCache(CACHE_KEYS.regionais);
};

export const getConfig = async (force = false) => {
	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.config,
		async () => {
			return (
				(await getVpsDocument("ferramentas_config/global").catch(
					() => null,
				)) || { tecnicos: [], metaAtiva: 110, metaRetirada: 110 }
			);
		},
		{ ttlMs: CACHE_TTL_MS, force },
	);

	return data;
};

export const saveConfig = async (data) => {
	await setVpsDocument("ferramentas_config/global", data);
	invalidateCache(CACHE_KEYS.config);
};
