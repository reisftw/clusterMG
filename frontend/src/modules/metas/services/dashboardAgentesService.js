import {
	buildCacheKey,
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import {
	deleteVpsDocument,
	getVpsDocument,
	setVpsDocument,
} from "../../../services/vpsApiClient";

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

function deduplicarCidades(cidades = []) {
	const map = new Map();

	cidades.forEach((cidade) => {
		const nome = normalizaCidade(cidade?.cidade || cidade?.nome);
		const key = normalizaTexto(nome);
		if (!key) return;
		map.set(key, { ...cidade, cidade: nome });
	});

	return [...map.values()];
}

const MONTHORDER = [
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

const CACHE_KEYS = {
	todos: "metas-dashboard-agentes:todos",
};

function normalizeDashboardAgenteRow(row = {}) {
	const cidade = normalizaCidade(row.cidade || row.nome || row.name);
	return {
		...row,
		cidade,
		name: cidade,
		total: Number(row.total ?? row.realizado ?? 0),
		meta: Number(row.meta ?? row.meta80 ?? 0),
		pct: Number(row.pct ?? row.percent ?? 0),
		daily: Array.isArray(row.daily) ? row.daily : [],
		lojaAgentesTotal: Number(row.lojaAgentesTotal || 0),
		lojaAgentesDaily: Array.isArray(row.lojaAgentesDaily)
			? row.lojaAgentesDaily
			: [],
	};
}

export async function buscarTodosDashboardAgentes(force = false) {
	const { data } = await getOrLoadCachedValue(
		CACHE_KEYS.todos,
		async () => {
			const entries = await Promise.all(
				MONTHORDER.map(async (mes) => {
					const doc = await getVpsDocument(`dashboardagentes/${mes}`).catch(
						() => null,
					);
					const cidades = Array.isArray(doc?.cidades)
						? doc.cidades
						: Array.isArray(doc?.cidadesRanking)
							? doc.cidadesRanking
							: [];
					return [
						mes,
						deduplicarCidades(cidades).map(normalizeDashboardAgenteRow),
					];
				}),
			);
			return Object.fromEntries(entries.filter(([, rows]) => rows.length > 0));
		},
		{ ttlMs: 10 * 60 * 1000, force },
	);

	return data || {};
}

export function invalidateDashboardAgentesCache() {
	invalidateCache(CACHE_KEYS.todos);
}

export async function salvarDashboardAgentes(agentesData) {
	try {
		await Promise.all(
			MONTHORDER.map(async (mes) => {
				const cidades = agentesData[mes];

				if (!cidades || cidades.length === 0) {
					await deleteVpsDocument(`dashboardagentes/${mes}`).catch(() => {});
					return;
				}

				const cidadesNorm = deduplicarCidades(cidades).map((c) => ({
					nome: normalizaCidade(c.cidade),
					cancelamentos: c.cancelamentos,
					meta80: c.meta,
					realizado: c.total,
					falta: c.meta - c.total,
					pct: c.pct,
					daily: c.daily,
					lojaAgentesTotal: Number(c.lojaAgentesTotal || 0),
					lojaAgentesDaily: Array.isArray(c.lojaAgentesDaily)
						? c.lojaAgentesDaily
						: [],
				}));

				const cidadesRanking = [...cidadesNorm].sort(
					(a, b) => b.realizado - a.realizado,
				);
				const totalRealizado = cidadesNorm.reduce((s, c) => s + c.realizado, 0);
				const totalMeta = cidadesNorm.reduce((s, c) => s + c.meta80, 0);
				const totalCancelamentos = cidadesNorm.reduce(
					(s, c) => s + c.cancelamentos,
					0,
				);
				const totalFalta = totalMeta - totalRealizado;
				const percentAchieved =
					totalCancelamentos > 0
						? Number.parseFloat(
								((totalRealizado / totalCancelamentos) * 100).toFixed(1),
							)
						: 0;

				const dayCount = cidadesNorm[0]?.daily?.length ?? 31;
				const totalDaily = Array.from({ length: dayCount }, (_, i) =>
					cidadesNorm.reduce((s, c) => s + (c.daily[i] || 0), 0),
				);

				await setVpsDocument(`dashboardagentes/${mes}`, {
					month: mes,
					cidades: cidadesNorm,
					cidadesRanking,
					dayCount,
					totalCancelamentos,
					totalMeta,
					totalRealizado,
					totalFalta,
					percentAchieved,
					totalDaily,
					status:
						percentAchieved >= 80
							? "Meta atingida!"
							: `Faltam ${Math.max(0, Math.round(totalFalta))} retiradas`,
					updatedAt: new Date().toISOString(),
				});
			}),
		);
	} finally {
		invalidateCache(buildCacheKey(["painel-publico", "agentes"]));
		invalidateCache(buildCacheKey(["painel-publico", "agentes", "v2"]));
		invalidateCache(CACHE_KEYS.todos);
	}
}
