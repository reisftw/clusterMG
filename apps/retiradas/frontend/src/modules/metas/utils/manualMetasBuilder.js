import {
	getMetaModeLabel,
	getMetaPercentForBase,
} from "../constants/metasBaseConfig";
import { recalcularSaldoDiario } from "./metasSaldo";

export const MANUAL_META_SOURCES = {
	SEMPRE: "sempre",
	ONNET: "onnet",
};

export const MANUAL_SECTION_TYPES = {
	TECNICOS: "tecnicos",
	REGIONAIS: "regionais",
	AGENTES: "agentes",
	LOJA: "loja",
};

const DEFAULT_ITEM_META = 110;

function toNumber(value) {
	const normalized =
		typeof value === "string" ? value.replace(/\./g, "").replace(",", ".") : value;
	const number = Number(normalized);
	return Number.isFinite(number) ? number : 0;
}

function compactName(value) {
	return String(value || "").trim();
}

export function getDaysInMetaMonth(month, year = new Date().getFullYear()) {
	const monthIndex = [
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
	].indexOf(month);
	if (monthIndex < 0) return 31;
	return new Date(year, monthIndex + 1, 0).getDate();
}

export function parseDailyMetaValues(value, dayCount = 31) {
	const values = String(value || "")
		.split(/[\s,;|]+/)
		.map(toNumber)
		.slice(0, dayCount);

	return Array.from({ length: dayCount }, (_, index) => values[index] || 0);
}

function sumDaily(items = [], dayCount = 31) {
	return Array.from({ length: dayCount }, (_, index) =>
		items.reduce((sum, item) => sum + Number(item.daily?.[index] || 0), 0),
	);
}

function buildPerformanceItems(rows = [], dayCount = 31) {
	return (Array.isArray(rows) ? rows : [])
		.map((row) => {
			const name = compactName(row?.name || row?.nome || row?.cidade);
			const daily = Array.isArray(row?.daily)
				? Array.from({ length: dayCount }, (_, index) =>
						Number(row.daily[index] || 0),
					)
				: parseDailyMetaValues(row?.dailyText, dayCount);
			const totalFromDaily = daily.reduce((sum, value) => sum + value, 0);
			const total = totalFromDaily || toNumber(row?.total);
			const meta = toNumber(row?.meta) || DEFAULT_ITEM_META;

			return {
				name,
				total,
				daily,
				meta,
				percent: meta > 0 ? Number(((total / meta) * 100).toFixed(1)) : 0,
			};
		})
		.filter((item) => item.name)
		.sort((a, b) => b.total - a.total);
}

function buildAgentCities(rows = [], dayCount = 31, metaPercent = 80) {
	return (Array.isArray(rows) ? rows : [])
		.map((row) => {
			const cidade = compactName(row?.cidade || row?.name || row?.nome);
			const daily = Array.isArray(row?.daily)
				? Array.from({ length: dayCount }, (_, index) =>
						Number(row.daily[index] || 0),
					)
				: parseDailyMetaValues(row?.dailyText, dayCount);
			const totalFromDaily = daily.reduce((sum, value) => sum + value, 0);
			const total = totalFromDaily || toNumber(row?.total);
			const cancelamentos = toNumber(row?.cancelamentos);
			const meta = Math.round(
				cancelamentos * (Number(metaPercent || 0) / 100),
			);
			const pct = meta > 0 ? Number(((total / meta) * 100).toFixed(1)) : 0;

			return { cidade, total, cancelamentos, meta, pct, daily };
		})
		.filter((item) => item.cidade)
		.sort((a, b) => b.total - a.total);
}

function buildAgentStoreCities(rows = [], dayCount = 31) {
	return (Array.isArray(rows) ? rows : [])
		.map((row) => {
			const cidade = compactName(row?.cidade || row?.name || row?.nome);
			const daily = Array.isArray(row?.daily)
				? Array.from({ length: dayCount }, (_, index) =>
						Number(row.daily[index] || 0),
					)
				: parseDailyMetaValues(row?.dailyText, dayCount);
			const totalFromDaily = daily.reduce((sum, value) => sum + value, 0);
			const total = totalFromDaily || toNumber(row?.total);

			return { cidade, lojaAgentesTotal: total, lojaAgentesDaily: daily };
		})
		.filter((item) => item.cidade)
		.sort((a, b) => b.lojaAgentesTotal - a.lojaAgentesTotal);
}

function mergeAgentStoreIntoCities(agentCities = [], agentStoreCities = []) {
	if (!agentStoreCities.length) return agentCities;
	const byCity = new Map(
		agentCities.map((city) => [compactName(city.cidade).toLowerCase(), city]),
	);
	agentStoreCities.forEach((storeCity) => {
		const key = compactName(storeCity.cidade).toLowerCase();
		const current = byCity.get(key) || {
			cidade: storeCity.cidade,
			total: 0,
			cancelamentos: 0,
			meta: 0,
			pct: 0,
			daily: Array.from(
				{ length: storeCity.lojaAgentesDaily?.length || 31 },
				() => 0,
			),
		};
		byCity.set(key, {
			...current,
			lojaAgentesTotal: Number(storeCity.lojaAgentesTotal || 0),
			lojaAgentesDaily: storeCity.lojaAgentesDaily || [],
		});
	});
	return [...byCity.values()].sort((a, b) => b.total - a.total);
}

function buildStoreItem(row = {}, dayCount = 31) {
	const daily = Array.isArray(row?.daily)
		? Array.from({ length: dayCount }, (_, index) => Number(row.daily[index] || 0))
		: parseDailyMetaValues(row?.dailyText, dayCount);
	const totalFromDaily = daily.reduce((sum, value) => sum + value, 0);
	return {
		total: totalFromDaily || toNumber(row?.total),
		daily,
	};
}

function calculateStatus(percentAchieved, meta, totalOS) {
	return percentAchieved >= 100
		? "Meta atingida!"
		: `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`;
}

export function buildManualMetasRecord({
	month,
	source,
	year = new Date().getFullYear(),
	baseConfig,
	cancelamentos = 0,
	tecnicos = [],
	regionais = [],
	agentes = [],
	agentesLoja = [],
	loja = {},
	feriadosSet = new Set(),
}) {
	const dayCount = getDaysInMetaMonth(month, year);
	const baseId = source === MANUAL_META_SOURCES.ONNET ? "onnet" : "sempre";
	const metaSazonal = getMetaPercentForBase(baseConfig, baseId, month);
	const meta = Math.round(toNumber(cancelamentos) * (Number(metaSazonal) / 100));
	const technicians = buildPerformanceItems(tecnicos, dayCount);
	const regionalItems = buildPerformanceItems(regionais, dayCount);
	const agentCities = buildAgentCities(agentes, dayCount, metaSazonal);
	const agentStoreCities = buildAgentStoreCities(agentesLoja, dayCount);
	const store = buildStoreItem(loja, dayCount);
	const technicianDaily = sumDaily(technicians, dayCount);
	const regionalDaily = sumDaily(regionalItems, dayCount);
	const agentDaily =
		source === MANUAL_META_SOURCES.ONNET
			? Array.from({ length: dayCount }, () => 0)
			: sumDaily(agentCities, dayCount);
	const totalOS =
		technicians.reduce((sum, item) => sum + Number(item.total || 0), 0) +
		regionalItems.reduce((sum, item) => sum + Number(item.total || 0), 0) +
		agentCities.reduce((sum, item) => sum + Number(item.total || 0), 0) +
		Number(store.total || 0);

	const rawDays = Array.from({ length: dayCount }, (_, index) => {
		const equipe = Number(technicianDaily[index] || 0);
		const regionaisTotal = Number(regionalDaily[index] || 0);
		const agente = Number(agentDaily[index] || 0);
		const lojaTotal = Number(store.daily[index] || 0);
		return {
			dia: index + 1,
			equipe,
			agente,
			loja: lojaTotal,
			regionais: regionaisTotal,
			totalDia: equipe + agente + lojaTotal + regionaisTotal,
		};
	}).filter((item) => Number(item.totalDia || 0) > 0);

	const baseRecord = {
		mes: month,
		month,
		ano: year,
		year,
		origem: source === MANUAL_META_SOURCES.ONNET ? "ONNET" : "SEMPRE",
		cancelamentos: toNumber(cancelamentos),
		meta,
		metaSazonal,
		metaModeLabel: getMetaModeLabel(baseConfig, baseId),
		totalOS,
		planilhaCarregada: true,
		temLancamentos: totalOS > 0,
		percentAchieved:
			meta > 0 ? Number(((totalOS / meta) * 100).toFixed(1)) : 0,
		metaDiaria: 0,
		totalMultas: 0,
		propMult: 0,
		technicians,
		regionais: regionalItems,
		agenteTotal: agentCities.reduce(
			(sum, item) => sum + Number(item.total || 0),
			0,
		),
		lojaTotal: Number(store.total || 0),
		rawDays,
		saldoDiario: rawDays,
		multasDiarias: [],
		manualEntry: true,
	};
	const saldo = recalcularSaldoDiario(baseRecord, feriadosSet, year);

	return {
		...baseRecord,
		saldoDiario: saldo.saldoDiario,
		metaDiaria: saldo.metaDiaria,
		status: calculateStatus(baseRecord.percentAchieved, meta, totalOS),
		agentesData: mergeAgentStoreIntoCities(agentCities, agentStoreCities),
	};
}

export function combineMetasRecords(sempreRecord, onnetRecord, month, options = {}) {
	if (!sempreRecord && !onnetRecord) return null;
	if (!sempreRecord) return onnetRecord;
	if (!onnetRecord) return sempreRecord;

	const year =
		Number(options.year || sempreRecord.year || sempreRecord.ano || onnetRecord.year) ||
		new Date().getFullYear();
	const feriadosSet = options.feriadosSet || new Set();
	const dayCount = getDaysInMetaMonth(month, year);
	const rawByDay = new Map();

	[sempreRecord, onnetRecord].forEach((record) => {
		(record.rawDays || record.saldoDiario || []).forEach((row) => {
			const dia = Number(row?.dia || 0);
			if (!dia) return;
			const current = rawByDay.get(dia) || {
				dia,
				equipe: 0,
				agente: 0,
				loja: 0,
				regionais: 0,
				totalDia: 0,
			};
			current.equipe += Number(row.equipe || 0);
			current.agente += Number(row.agente || 0);
			current.loja += Number(row.loja || 0);
			current.regionais += Number(row.regionais || 0);
			current.totalDia += Number(row.totalDia || 0);
			rawByDay.set(dia, current);
		});
	});

	const meta = Number(sempreRecord.meta || 0) + Number(onnetRecord.meta || 0);
	const totalOS =
		Number(sempreRecord.totalOS || 0) + Number(onnetRecord.totalOS || 0);
	const cancelamentos =
		Number(sempreRecord.cancelamentos || 0) +
		Number(onnetRecord.cancelamentos || 0);
	const rawDays = Array.from({ length: dayCount }, (_, index) => {
		const dia = index + 1;
		return (
			rawByDay.get(dia) || {
				dia,
				equipe: 0,
				agente: 0,
				loja: 0,
				regionais: 0,
				totalDia: 0,
			}
		);
	}).filter((item) => Number(item.totalDia || 0) > 0);
	const combined = {
		...sempreRecord,
		mes: month,
		month,
		ano: year,
		year,
		origem: "ONNET + SEMPRE",
		cancelamentos,
		meta,
		totalOS,
		percentAchieved:
			meta > 0 ? Number(((totalOS / meta) * 100).toFixed(1)) : 0,
		planilhaCarregada: true,
		temLancamentos: totalOS > 0,
		technicians: [
			...(sempreRecord.technicians || []),
			...(onnetRecord.technicians || []),
		].sort((a, b) => b.total - a.total),
		regionais: [
			...(sempreRecord.regionais || []),
			...(onnetRecord.regionais || []),
		].sort((a, b) => b.total - a.total),
		agenteTotal: Number(sempreRecord.agenteTotal || 0),
		lojaTotal:
			Number(sempreRecord.lojaTotal || 0) + Number(onnetRecord.lojaTotal || 0),
		rawDays,
		saldoDiario: rawDays,
		manualEntry: true,
	};
	const saldo = recalcularSaldoDiario(combined, feriadosSet, year);
	return {
		...combined,
		saldoDiario: saldo.saldoDiario,
		metaDiaria: saldo.metaDiaria,
		status: calculateStatus(combined.percentAchieved, meta, totalOS),
	};
}
