import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import {
	createVpsDocument,
	listVpsDocuments,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

const COL_REGRAS = "regras";
const CACHE_KEY = "regras:ativas";
const REGRAS_MAX = 100;

export const criarRegraMetaRisco = async () => {
	const regra = {
		nome: "Meta em Risco",
		ativo: true,
		tipo: "meta_risco",
		parametros: {
			pctMinimo: 70,
			diasRestantesMax: 5,
		},
		acao: "alert_dashboard",
		criadoEm: new Date().toISOString(),
	};

	const ref = await createVpsDocument(COL_REGRAS, regra);
	return ref.id;
};

export const buscarRegrasAtivas = async () => {
	const { data } = await getOrLoadCachedValue(
		CACHE_KEY,
		async () => {
			return (await listVpsDocuments(COL_REGRAS, { limit: REGRAS_MAX }))
				.filter((item) => item.ativo === true)
				.sort((a, b) =>
					String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
				);
		},
		{ ttlMs: 10 * 60 * 1000 },
	);

	return data || [];
};

export const toggleRegra = async (id, ativo) => {
	await updateVpsDocument(`${COL_REGRAS}/${id}`, { ativo });
	invalidateCache(CACHE_KEY);
};
