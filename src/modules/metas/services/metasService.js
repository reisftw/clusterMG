import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import {
	getInternalSnapshotSlice,
	SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import {
	deleteVpsDocument,
	getVpsDocument,
	listVpsDocuments,
	requestVpsApi,
	setVpsDocument,
	updateVpsDocument,
} from "../../../services/vpsApiClient";
import { normalizeMetasBaseConfig } from "../constants/metasBaseConfig";

const COL = "metas";
const METAS_MAX = 24;
const FERIADOS_MAX = 100;
const MONTH_ALIASES = {
	Marco: "Março",
	Março: "Marco",
};
const CACHE_KEYS = {
	todas: "metas:todas",
	mes: (mes) => `metas:${mes}`,
	ultimaAtualizacao: "metas:ultima-atualizacao",
	forcaTarefa: "metas:forca-tarefa",
	metasBase: "metas:configuracao-bases",
	feriados: (ano) => `metas:feriados:${ano}`,
};

export const DEFAULT_FORCA_TAREFA_CONFIG = Object.freeze({
	ativa: false,
	inicio: "",
	fim: "",
	metas: {
		regionais: 600,
		agentes: 150,
		tecnicos: 400,
	},
});

export function normalizeForcaTarefaConfig(config = null) {
	return {
		...DEFAULT_FORCA_TAREFA_CONFIG,
		...(config || {}),
		metas: {
			...DEFAULT_FORCA_TAREFA_CONFIG.metas,
			...(config?.metas || {}),
		},
	};
}

function withMonthAliases(metas = {}) {
	const next = { ...(metas || {}) };
	Object.entries(MONTH_ALIASES).forEach(([from, to]) => {
		if (next[from] && !next[to]) {
			next[to] = {
				...next[from],
				mes: to,
				month: to,
			};
		}
	});
	return next;
}

export const buscarTodasMetas = async (
	force = false,
	{ allowFallback = true } = {},
) => {
	const staticMetas = await getInternalSnapshotSlice(
		SNAPSHOT_DOMAINS.DASHBOARD,
		(payload) => payload?.metas?.all ?? null,
		{ force },
	);
	if (staticMetas && typeof staticMetas === "object") {
		return withMonthAliases(staticMetas);
	}

	if (!allowFallback) {
		return {};
	}

	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.todas,
		async () => {
			const metas = await listVpsDocuments(COL, { limit: METAS_MAX });
			return metas.reduce((acc, item) => {
				acc[item.id] = item;
				return acc;
			}, {});
		},
		{ ttlMs: 10 * 60 * 1000, force },
	);

	return withMonthAliases(data || {});
};

export const buscarMetaMes = async (mes) => {
	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.mes(mes),
		async () => {
			const direct = await getVpsDocument(`${COL}/${mes}`).catch(() => null);
			if (direct) return direct;
			const alias = MONTH_ALIASES[mes];
			return alias ? getVpsDocument(`${COL}/${alias}`).catch(() => null) : null;
		},
		{ ttlMs: 10 * 60 * 1000 },
	);

	return data ?? null;
};

export const invalidateMetasCache = () => {
	invalidateCache(CACHE_KEYS.todas);
	invalidateCache(CACHE_KEYS.ultimaAtualizacao);
	invalidateCache(CACHE_KEYS.forcaTarefa);
	invalidateCache(CACHE_KEYS.metasBase);
	[
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
	].forEach((mes) => invalidateCache(CACHE_KEYS.mes(mes)));
};

export const salvarMetaMes = async (mes, dados, options = {}) => {
	const mesAtual = options.mesAtual ?? null;
	const temMetaPreenchida = dados && Number(dados.meta) > 0;
	const manterMesVazioAtual =
		dados &&
		mes === mesAtual &&
		dados.planilhaCarregada === true &&
		Number(dados.totalOS) === 0;
	const manterMesSemLancamentosComMeta =
		dados &&
		dados.planilhaCarregada === true &&
		Number(dados.totalOS) === 0 &&
		temMetaPreenchida;

	if (
		!dados ||
		(Number(dados.totalOS) === 0 &&
			!manterMesVazioAtual &&
			!manterMesSemLancamentosComMeta)
	) {
		await deleteVpsDocument(`${COL}/${mes}`).catch(() => {});
		invalidateCache(CACHE_KEYS.todas);
		invalidateCache(CACHE_KEYS.mes(mes));
		return;
	}

	await setVpsDocument(`${COL}/${mes}`, {
		...dados,
		updatedAt: new Date().toISOString(),
	});
	invalidateCache(CACHE_KEYS.todas);
	invalidateCache(CACHE_KEYS.mes(mes));
};

export const salvarUltimaAtualizacao = async (txt) => {
	await updateVpsDocument("config/metas", { lastUpdate: txt });
	invalidateCache(CACHE_KEYS.ultimaAtualizacao);
};

export const buscarUltimaAtualizacao = async () => {
	const staticLastUpdate = await getInternalSnapshotSlice(
		SNAPSHOT_DOMAINS.DASHBOARD,
		(payload) => payload?.metas?.lastUpdate ?? null,
	);
	if (staticLastUpdate) return staticLastUpdate;

	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.ultimaAtualizacao,
		async () => {
			const config = await getVpsDocument("config/metas");
			return config?.lastUpdate ?? null;
		},
		{ ttlMs: 10 * 60 * 1000 },
	);

	return data ?? null;
};

export const buscarForcaTarefaConfig = async (
	force = false,
	{ allowFallback = true } = {},
) => {
	const staticConfig = await getInternalSnapshotSlice(
		SNAPSHOT_DOMAINS.DASHBOARD,
		(payload) => payload?.metas?.forcaTarefa ?? null,
		{ force },
	);
	if (staticConfig && typeof staticConfig === "object") {
		return normalizeForcaTarefaConfig(staticConfig);
	}

	if (!allowFallback) {
		return normalizeForcaTarefaConfig();
	}

	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.forcaTarefa,
		async () => {
			const config = await getVpsDocument("config/metas");
			return config?.forcaTarefa || null;
		},
		{ ttlMs: 10 * 60 * 1000, force },
	);

	return normalizeForcaTarefaConfig(data);
};

export const invalidateForcaTarefaConfigCache = () => {
	invalidateCache(CACHE_KEYS.forcaTarefa);
};

export const buscarMetasBaseConfig = async (
	force = false,
	{ allowFallback = true, preferLive = false } = {},
) => {
	if (!preferLive) {
		const staticConfig = await getInternalSnapshotSlice(
			SNAPSHOT_DOMAINS.DASHBOARD,
			(payload) => payload?.metas?.baseConfig ?? null,
			{ force },
		);
		if (staticConfig && typeof staticConfig === "object") {
			return normalizeMetasBaseConfig(staticConfig);
		}
	}

	if (!allowFallback) {
		return normalizeMetasBaseConfig();
	}

	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.metasBase,
		async () => {
			const config = await getVpsDocument("config/metas");
			return config?.baseConfig || null;
		},
		{ ttlMs: 10 * 60 * 1000, force },
	);

	return normalizeMetasBaseConfig(data);
};

export const salvarMetasBaseConfig = async (config) => {
	const normalized = normalizeMetasBaseConfig(config);
	const result = await requestVpsApi("/imports/metas/base-config", {
		method: "POST",
		body: JSON.stringify({ config: normalized }),
	});
	invalidateCache(CACHE_KEYS.metasBase);
	invalidateCache(CACHE_KEYS.todas);
	return normalizeMetasBaseConfig(result?.config || normalized);
};

export const invalidateMetasBaseConfigCache = () => {
	invalidateCache(CACHE_KEYS.metasBase);
};

export const buscarFeriadosNacionais = async (ano) => {
	try {
		const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
		if (!res.ok) throw new Error("Falha na API");
		return await res.json();
	} catch {
		return [];
	}
};

export const buscarFeriados = async (
	force = false,
	{ allowFallback = true } = {},
) => {
	const staticFeriados = await getInternalSnapshotSlice(
		SNAPSHOT_DOMAINS.DASHBOARD,
		(payload) => payload?.metas?.feriados ?? null,
		{ force },
	);
	if (Array.isArray(staticFeriados)) {
		return new Set(staticFeriados);
	}

	if (!allowFallback) {
		return new Set();
	}

	const ano = new Date().getFullYear();
	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.feriados(ano),
		async () => {
			const keys = new Set();

			try {
				const nacionais = await buscarFeriadosNacionais(ano);
				for (const item of nacionais) {
					const parts = item.date?.split("-");
					if (parts?.length === 3) keys.add(`${parts[1]}-${parts[2]}`);
				}
			} catch (e) {
				console.warn("metasService: erro ao buscar feriados nacionais.", e);
			}

			try {
				const feriados = await listVpsDocuments("feriados", {
					limit: FERIADOS_MAX,
				});
				feriados.forEach((item) => {
					const raw = item.data || "";
					const parts = raw.split("-");
					if (parts.length === 3) keys.add(`${parts[1]}-${parts[2]}`);
				});
			} catch (e) {
				console.warn("metasService: erro ao buscar feriados salvos.", e);
			}

			return Array.from(keys);
		},
		{ ttlMs: 24 * 60 * 60 * 1000, force },
	);

	return new Set(data || []);
};
