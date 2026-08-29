import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import {
	getVpsDocument,
	listVpsDocuments,
	setVpsDocument,
} from "../../../services/vpsApiClient";

const COL = "auditoria_agentes";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_AGENTES = 300;
const MAX_CIDADES_MES = 300;

const CACHE_KEYS = {
	agentes: "metas-auditoria:agentes",
	auditoria: (mes) => `metas-auditoria:mes:${mes}`,
	historico: (cidadeKey) => `metas-auditoria:historico:${cidadeKey}`,
};

const CITY_DISPLAY_ALIASES = {
	AGUIANIL: "Aguanil",
};

function normalizaTexto(valor) {
	return String(valor ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizaCidade(valor) {
	const cidade = String(valor ?? "").trim();
	if (!cidade) return "";
	return CITY_DISPLAY_ALIASES[normalizaTexto(cidade)] || cidade;
}

function resolveSavedAt(value) {
	if (!value) return 0;
	if (typeof value?.toMillis === "function") return value.toMillis();
	const parsed = Date.parse(String(value));
	return Number.isNaN(parsed) ? 0 : parsed;
}

function shouldReplaceCidade(current, next) {
	if (!current) return true;

	const currentSavedAt = resolveSavedAt(current.savedAt);
	const nextSavedAt = resolveSavedAt(next.savedAt);
	if (nextSavedAt !== currentSavedAt) return nextSavedAt > currentSavedAt;

	const currentTotal =
		Number(current.total || 0) + Number(current.cancelamentos || 0);
	const nextTotal = Number(next.total || 0) + Number(next.cancelamentos || 0);
	return nextTotal >= currentTotal;
}

export function deduplicarCidadesAuditoria(cidades = []) {
	const map = new Map();

	cidades.forEach((cidade) => {
		const cidadeNome = normalizaCidade(cidade?.cidade || cidade?.nome);
		const key = normalizaTexto(cidadeNome);
		if (!key) return;

		const normalized = {
			...cidade,
			cidade: cidadeNome,
		};

		if (shouldReplaceCidade(map.get(key), normalized)) {
			map.set(key, normalized);
		}
	});

	return [...map.values()].sort((a, b) =>
		String(a.cidade || "").localeCompare(String(b.cidade || ""), "pt-BR"),
	);
}

export const buscarAgentes = async (force = false) => {
	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.agentes,
		async () => {
			const agentes = await listVpsDocuments("agentes", { limit: MAX_AGENTES });
			return agentes.reduce((acc, item) => {
				const key = normalizaTexto(item.cidade);
				if (key) acc[key] = item;
				return acc;
			}, {});
		},
		{ ttlMs: CACHE_TTL_MS, force },
	);

	return data || {};
};

export const salvarAuditoriaAgentes = async (mes, cidades) => {
	const batch = cidades.map((cidade) => {
		const cidadeNome = normalizaCidade(cidade.cidade);
		const key = normalizaTexto(cidadeNome).replace(/\s+/g, "_");
		return setVpsDocument(`${COL}/${mes}/cidades/${key}`, {
			...cidade,
			cidade: cidadeNome,
			mes,
			savedAt: new Date().toISOString(),
		});
	});

	await Promise.all(batch);
	invalidateCache(CACHE_KEYS.auditoria(mes));

	cidades.forEach((cidade) => {
		const key = normalizaTexto(normalizaCidade(cidade.cidade)).replace(
			/\s+/g,
			"_",
		);
		invalidateCache(CACHE_KEYS.historico(key));
	});
};

export const buscarAuditoriaAgentes = async (mes, force = false) => {
	try {
		const { data } = await getOrLoadCachedValue(
			CACHE_KEYS.auditoria(mes),
			async () => {
				const cidades = await listVpsDocuments(`${COL}/${mes}/cidades`, {
					limit: MAX_CIDADES_MES,
				});
				return deduplicarCidadesAuditoria(cidades);
			},
			{ ttlMs: CACHE_TTL_MS, force },
		);

		return deduplicarCidadesAuditoria(data || []);
	} catch (e) {
		console.error("[metasAuditoriaService] Erro ao buscar:", e);
		return [];
	}
};

export const buscarHistoricoCidade = async (cidadeKey, force = false) => {
	const meses = [
		"Janeiro",
		"Fevereiro",
		"Marco",
		"Abril",
		"Maio",
		"Junho",
		"Julho",
		"Agosto",
		"Setembro",
		"Outubro",
		"Novembro",
		"Dezembro",
	];

	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.historico(cidadeKey),
		async () => {
			const resultados = [];

			for (const mes of meses) {
				const item = await getVpsDocument(
					`${COL}/${mes}/cidades/${cidadeKey}`,
				).catch(() => null);
				if (item) resultados.push({ mes, ...item });
			}

			return resultados;
		},
		{ ttlMs: CACHE_TTL_MS, force },
	);

	return data || [];
};

export const buscarAuditoriaMes = buscarAuditoriaAgentes;
