export const META_BASES = [
	{ id: "sempre", label: "SEMPRE", origem: "SEMPRE" },
	{ id: "onnet", label: "ONNET", origem: "ONNET" },
	{ id: "onnetSempre", label: "TODOS", origem: "ONNET + SEMPRE" },
];

export const META_MODES = {
	SAZONAL: "sazonal",
	FIXA: "fixa",
};

export const META_MESES = [
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

export const DEFAULT_SAZONALIDADE_SEMPRE = Object.freeze({
	Janeiro: 65,
	Fevereiro: 65,
	Marco: 75,
	Abril: 85,
	Maio: 90,
	Junho: 90,
	Julho: 90,
	Agosto: 90,
	Setembro: 85,
	Outubro: 85,
	Novembro: 75,
	Dezembro: 65,
});

export const DEFAULT_METAS_BASE_CONFIG = Object.freeze({
	sempre: {
		mode: META_MODES.SAZONAL,
		fixedPercent: 80,
		seasonalPercentByMonth: DEFAULT_SAZONALIDADE_SEMPRE,
	},
	onnet: {
		mode: META_MODES.FIXA,
		fixedPercent: 65,
		seasonalPercentByMonth: DEFAULT_SAZONALIDADE_SEMPRE,
	},
	onnetSempre: {
		mode: META_MODES.FIXA,
		fixedPercent: 80,
		seasonalPercentByMonth: DEFAULT_SAZONALIDADE_SEMPRE,
	},
});

function sanitizePercent(value, fallback = 80) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(100, Math.max(0, Number(number.toFixed(1))));
}

export function normalizeMetasBaseConfig(rawConfig = null) {
	const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

	return Object.fromEntries(
		META_BASES.map(({ id }) => {
			const defaults = DEFAULT_METAS_BASE_CONFIG[id];
			const raw =
				source[id] && typeof source[id] === "object" ? source[id] : {};
			const mode =
				raw.mode === META_MODES.FIXA || raw.mode === META_MODES.SAZONAL
					? raw.mode
					: defaults.mode;
			const rawSeasonal = raw.seasonalPercentByMonth || raw.sazonalidade || {};
			const seasonalPercentByMonth = Object.fromEntries(
				META_MESES.map((mes) => [
					mes,
					sanitizePercent(
						rawSeasonal[mes],
						defaults.seasonalPercentByMonth[mes],
					),
				]),
			);

			return [
				id,
				{
					mode,
					fixedPercent: sanitizePercent(
						raw.fixedPercent ?? raw.percentualFixo,
						defaults.fixedPercent,
					),
					seasonalPercentByMonth,
				},
			];
		}),
	);
}

export function getMetaPercentForBase(config, baseId, mes) {
	const normalized = normalizeMetasBaseConfig(config);
	const base = normalized[baseId] || normalized.sempre;
	if (base.mode === META_MODES.FIXA) return base.fixedPercent;
	return base.seasonalPercentByMonth?.[mes] ?? base.fixedPercent ?? 80;
}

export function getMetaModeLabel(config, baseId) {
	const normalized = normalizeMetasBaseConfig(config);
	const base = normalized[baseId] || normalized.sempre;
	return base.mode === META_MODES.FIXA ? "Meta fixa" : "Meta sazonal";
}

export function getBaseIdFromMetaData(data = {}) {
	const origem = String(data?.origem || "").toUpperCase();
	if (origem.includes("ONNET") && origem.includes("SEMPRE"))
		return "onnetSempre";
	if (origem.includes("ONNET")) return "onnet";
	return "sempre";
}

function recalculateSaldoDiarioByMeta(saldoDiario = [], meta, metaOriginal) {
	if (!Array.isArray(saldoDiario) || saldoDiario.length === 0)
		return saldoDiario;
	const ratio = metaOriginal > 0 ? meta / metaOriginal : 1;
	let saldoMes = 0;

	return saldoDiario.map((row) => {
		const totalDia = Number(row?.totalDia || 0);
		const metaDiaOriginal = Number(row?.metaDia || 0);
		const metaDia = Number((metaDiaOriginal * ratio).toFixed(2));
		const saldoDia = Number((totalDia - metaDia).toFixed(2));
		saldoMes = Number((saldoMes + saldoDia).toFixed(2));

		return {
			...row,
			totalDia,
			metaDia,
			metaAcumulada: Number(
				(Number(row?.metaAcumulada || 0) * ratio).toFixed(2),
			),
			saldoDia,
			saldoMes,
		};
	});
}

function recalculatePerformanceItems(items = [], meta, metaOriginal) {
	if (!Array.isArray(items) || items.length === 0) return items;
	const ratio = metaOriginal > 0 ? meta / metaOriginal : 1;

	return items.map((item) => {
		const itemMetaOriginal = Number(item?.meta || 0);
		const itemMeta =
			itemMetaOriginal > 0
				? Number((itemMetaOriginal * ratio).toFixed(2))
				: itemMetaOriginal;
		const total = Number(item?.total || 0);
		const percent =
			itemMeta > 0
				? Number(((total / itemMeta) * 100).toFixed(1))
				: Number(String(item?.percent ?? 0).replace(",", "."));

		return {
			...item,
			meta: itemMeta,
			percent,
		};
	});
}

function applyMetaConfigToRecord(data, config, baseId, mes) {
	if (!data || typeof data !== "object") return data;
	const metaSazonal = getMetaPercentForBase(config, baseId, mes);
	const metaModeLabel = getMetaModeLabel(config, baseId);
	const metaOriginal = Number(data.meta || 0);
	const percentualOriginal = Number(data.metaSazonal || 0);
	const cancelamentosInformados =
		Number(data.cancelamentos || 0) || Number(data.totalCancelamentos || 0);
	const cancelamentosDerivados =
		!cancelamentosInformados && metaOriginal > 0 && percentualOriginal > 0
			? metaOriginal / (percentualOriginal / 100)
			: 0;
	const cancelamentos = cancelamentosInformados || cancelamentosDerivados;
	const meta =
		cancelamentos > 0
			? Math.round(cancelamentos * (metaSazonal / 100))
			: metaOriginal;
	const totalOS = Number(data.totalOS || 0);
	const percentAchieved =
		meta > 0
			? Number(((totalOS / meta) * 100).toFixed(1))
			: Number(String(data.percentAchieved ?? 0).replace(",", "."));
	const saldoDiario = recalculateSaldoDiarioByMeta(
		data.saldoDiario,
		meta,
		metaOriginal,
	);

	return {
		...data,
		meta,
		metaSazonal,
		metaMode:
			normalizeMetasBaseConfig(config)[baseId]?.mode || META_MODES.SAZONAL,
		metaModeLabel,
		percentAchieved,
		saldoDiario,
		technicians: recalculatePerformanceItems(
			data.technicians,
			meta,
			metaOriginal,
		),
		regionais: recalculatePerformanceItems(data.regionais, meta, metaOriginal),
		status:
			percentAchieved >= 100
				? "Meta atingida!"
				: `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`,
	};
}

export function applyMetasBaseConfigToAllData(allData = {}, config = null) {
	const normalized = normalizeMetasBaseConfig(config);

	return Object.fromEntries(
		Object.entries(allData || {}).map(([mes, dadosMes]) => {
			if (!dadosMes || typeof dadosMes !== "object") return [mes, dadosMes];
			const sempre = applyMetaConfigToRecord(
				dadosMes,
				normalized,
				"sempre",
				mes,
			);
			return [
				mes,
				{
					...sempre,
					onnet: applyMetaConfigToRecord(
						dadosMes.onnet,
						normalized,
						"onnet",
						mes,
					),
					onnetSempre: applyMetaConfigToRecord(
						dadosMes.onnetSempre,
						normalized,
						"onnetSempre",
						mes,
					),
				},
			];
		}),
	);
}
