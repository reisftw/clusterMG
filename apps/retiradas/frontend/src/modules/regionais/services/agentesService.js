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

const MAX_AGENTES = 300;
const CACHE_KEY = "agentes-service:lista";
const CACHE_TTL_MS = 30 * 60 * 1000;

const getAgenteSortLabel = (item = {}) => item?.cidade || item?.nome || "";

export const buscarAgentes = async (force = false) => {
	const { data } = await getOrLoadCachedValue(
		`${CACHE_KEY}:vps`,
		async () =>
			(
				await listVpsDocuments(COLLECTIONS.AGENTES, {
					limit: MAX_AGENTES,
				})
			).sort((a, b) =>
				getAgenteSortLabel(a).localeCompare(getAgenteSortLabel(b)),
			),
		{ ttlMs: CACHE_TTL_MS, force },
	);

	return data || [];
};

export const criarAgente = async (dados) => {
	const ref = await createVpsDocument(COLLECTIONS.AGENTES, {
		...dados,
		criado_em: new Date().toISOString(),
	});
	invalidateCache(CACHE_KEY);
	invalidateCache(`${CACHE_KEY}:vps`);
	return ref;
};

export const atualizarAgente = async (id, dados) => {
	await updateVpsDocument(`${COLLECTIONS.AGENTES}/${id}`, {
		...dados,
		atualizado_em: new Date().toISOString(),
	});
	invalidateCache(CACHE_KEY);
	invalidateCache(`${CACHE_KEY}:vps`);
};

export const excluirAgente = async (id) => {
	await deleteVpsDocument(`${COLLECTIONS.AGENTES}/${id}`);
	invalidateCache(CACHE_KEY);
	invalidateCache(`${CACHE_KEY}:vps`);
};
