import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { invalidateDashboardDataCache } from "../../../pages/PainelPublico/hooks/useDashboardData";
import { invalidateInternalStaticDataCache } from "../../../services/internalStaticDataService";
import {
	persistMetasImport,
	saveMetasForceTaskConfig,
} from "../../../services/operationalImportService";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import { logger } from "../../../utils/logger";
import { buildMetaDiariaSchedule } from "../../../utils/metasProjection";
import {
	applyMetasBaseConfigToAllData,
	DEFAULT_SAZONALIDADE_SEMPRE,
	normalizeMetasBaseConfig,
} from "../constants/metasBaseConfig";
import {
	buildManualMetasRecord,
	combineMetasRecords,
	MANUAL_META_SOURCES,
} from "../utils/manualMetasBuilder";
import {
	buscarFeriados,
	buscarForcaTarefaConfig,
	buscarMetasBaseConfig,
	buscarTodasMetas,
	buscarUltimaAtualizacao,
	invalidateForcaTarefaConfigCache,
	invalidateMetasBaseConfigCache,
	invalidateMetasCache,
	salvarMetasBaseConfig,
} from "../services/metasService";
import { parseAgentesWorkbook } from "./useMetasAuditoriaParser";

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

const META_SAZONAL = DEFAULT_SAZONALIDADE_SEMPRE;

const DASHROW = {
	Janeiro: 4,
	Fevereiro: 5,
	Marco: 6,
	Abril: 7,
	Maio: 8,
	Junho: 9,
	Julho: 10,
	Agosto: 11,
	Setembro: 12,
	Outubro: 13,
	Novembro: 14,
	Dezembro: 15,
};

const CFGFEV = {
	techStart: 8,
	regStart: 27,
	agenteRow: 19,
	lojaRow: 23,
	totalCol: "AE",
	dayColStart: 2,
	dayColEnd: 29,
};
const CFGDEF = {
	techStart: 7,
	regStart: 26,
	agenteRow: 18,
	lojaRow: 22,
	totalCol: "AH",
	dayColStart: 2,
	dayColEnd: 32,
};

const TECHNAMES = [
	"PHILIPE SANTOS",
	"NATHAN PEREIRA",
	"JOSEVAL CAMPOS",
	"JOAO EZIQUIEL",
	"PAULO XAVIER",
	"CLAUDSON FARIA",
	"ANDRE PAULA",
];
const REGNAMES = [
	"Central Mineira",
	"Metropolitana sub 1",
	"Metropolitana sub 2",
	"Metropolitana sub 3",
	"Oeste de Minas",
	"Sul de Minas",
	"Centro Oeste",
];

const ONNET_SHEET_BY_MONTH = {
	Janeiro: "onnet_jan",
	Fevereiro: "onnet_fev",
	Marco: "onnet_mar",
	Março: "onnet_mar",
	Abril: "onnet_abr",
	Maio: "onnet_mai",
	Junho: "onnet_jun",
	Julho: "onnet_jul",
	Agosto: "onnet_ago",
	Setembro: "onnet_set",
	Outubro: "onnet_out",
	Novembro: "onnet_nov",
	Dezembro: "onnet_dez",
};

const FERIADOS_FIXOS = [
	"01-01",
	"04-21",
	"05-01",
	"09-07",
	"10-12",
	"11-02",
	"11-15",
	"12-25",
];

function encCol(idx) {
	return XLSX.utils.encode_col(idx);
}

function cv(ws, col, row) {
	if (!ws) return 0;
	const cell = ws[col + row];
	if (!cell || cell.v === undefined || cell.v === null || cell.v === "")
		return 0;
	if (cell.t && cell.t !== "n") return 0;
	const n = Number(cell.v);
	return Number.isNaN(n) ? 0 : n;
}

function ct(ws, col, row) {
	const cell = ws?.[col + row] ?? null;
	return cell ? String(cell.v).trim() : "";
}

function normalizeSheetName(name) {
	return String(name ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function findSheet(wb, target) {
	const norm = normalizeSheetName(target);
	const realName = wb.SheetNames.find((n) => normalizeSheetName(n) === norm);
	return realName ? wb.Sheets[realName] : undefined;
}

function findRowByLabel(ws, label, startRow = 1, endRow = 60) {
	if (!ws) return null;
	const target = normalizeSheetName(label);
	for (let row = startRow; row <= endRow; row++) {
		if (
			normalizeSheetName(ws[`A${row}`]?.v ?? "") === target ||
			normalizeSheetName(ws[`B${row}`]?.v ?? "") === target
		) {
			return row;
		}
	}
	return null;
}

function findRowByLabelInColumn(
	ws,
	label,
	column = "B",
	startRow = 1,
	endRow = 60,
) {
	if (!ws) return null;
	const target = normalizeSheetName(label);
	for (let row = startRow; row <= endRow; row++) {
		if (normalizeSheetName(ws[`${column}${row}`]?.v ?? "") === target)
			return row;
	}
	return null;
}

function findCellColumnByLabel(ws, label, row, startCol = 0, endCol = 60) {
	if (!ws || !row) return null;
	const target = normalizeSheetName(label);
	for (let col = startCol; col <= endCol; col++) {
		if (normalizeSheetName(ws[encCol(col) + row]?.v ?? "") === target)
			return col;
	}
	return null;
}

function findMonthlyLayout(ws, fallbackCfg) {
	if (!ws) return fallbackCfg;

	const totalTecnicosRow = findRowByLabel(ws, "TOTAL TECNICOS");
	const totalRegionaisRow = findRowByLabel(ws, "TOTAL REGIONAIS");
	const agenteRow =
		findRowByLabelInColumn(ws, "Agente Autorizado") ?? fallbackCfg.agenteRow;
	const lojaRow =
		findRowByLabelInColumn(ws, "Entregue em Loja") ?? fallbackCfg.lojaRow;
	let totalColIdx = null;

	for (let row = 1; row <= 40 && totalColIdx === null; row++) {
		for (let col = 2; col <= 40; col++) {
			if (normalizeSheetName(ws[encCol(col) + row]?.v ?? "") === "total") {
				totalColIdx = col;
				break;
			}
		}
	}

	return {
		...fallbackCfg,
		techStart: totalTecnicosRow ? totalTecnicosRow - 7 : fallbackCfg.techStart,
		regStart: totalRegionaisRow ? totalRegionaisRow - 7 : fallbackCfg.regStart,
		agenteRow,
		lojaRow,
		totalCol: totalColIdx !== null ? encCol(totalColIdx) : fallbackCfg.totalCol,
		dayColStart: 2,
		dayColEnd: totalColIdx !== null ? totalColIdx - 1 : fallbackCfg.dayColEnd,
	};
}

export function diasUteis(mes, feriadosExtras = []) {
	const idx = MONTHORDER.indexOf(mes);
	if (idx < 0) return 22;
	const m = idx + 1;
	const ano = new Date().getFullYear();
	const diasNoMes = new Date(ano, m, 0).getDate();
	const todosFeriados = [...FERIADOS_FIXOS, ...feriadosExtras];
	let count = 0;
	for (let d = 1; d <= diasNoMes; d++) {
		const dt = new Date(ano, m - 1, d);
		if (dt.getDay() === 0 || dt.getDay() === 6) continue;
		const key = String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
		if (todosFeriados.includes(key)) continue;
		count++;
	}
	return count;
}

export function isDiaUtil(mes, dia, feriadosExtras = []) {
	const idx = MONTHORDER.indexOf(mes);
	if (idx < 0) return true;
	const m = idx + 1;
	const ano = new Date().getFullYear();
	const dt = new Date(ano, m - 1, dia);
	if (dt.getDay() === 0 || dt.getDay() === 6) return false;
	const key = String(m).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
	const todosFeriados = [...FERIADOS_FIXOS, ...feriadosExtras];
	return !todosFeriados.includes(key);
}

function buildEmptyDaily(length) {
	return Array.from({ length }, () => 0);
}

function parseOnnetMonth(wb, mes, feriadosExtras = []) {
	const sheetName = ONNET_SHEET_BY_MONTH[mes];
	const ws = sheetName ? findSheet(wb, sheetName) : null;
	if (!ws) return null;

	const lojaHeaderRow = findRowByLabel(ws, "ENTREGUE EM LOJA", 1, 30);
	const regionaisHeaderRow = findRowByLabel(ws, "REGIONAIS", 1, 40);
	const totalRegionaisRow = findRowByLabel(ws, "TOTAL REGIONAIS", 1, 60);
	const totalColIdx =
		findCellColumnByLabel(ws, "TOTAL", lojaHeaderRow, 2, 60) ??
		findCellColumnByLabel(ws, "TOTAL", regionaisHeaderRow, 2, 60) ??
		33;
	const totalCol = encCol(totalColIdx);
	const dayColStart = 2;
	const dayColEnd = Math.max(dayColStart - 1, totalColIdx - 1);
	const dayCount = Math.max(0, dayColEnd - dayColStart + 1);
	const lojaRow = lojaHeaderRow ? lojaHeaderRow + 1 : null;

	const cancelamentos = cv(ws, "B", 4);
	const meta = cv(ws, "B", 5);
	const metaSazonal = META_SAZONAL[mes] ?? 80;
	const lojaTotal = lojaRow ? cv(ws, totalCol, lojaRow) : 0;
	const lojaDaily = [];
	for (let col = dayColStart; col <= dayColEnd; col++) {
		lojaDaily.push(lojaRow ? cv(ws, encCol(col), lojaRow) : 0);
	}

	const regionais = [];
	const firstRegionalRow = regionaisHeaderRow ? regionaisHeaderRow + 1 : null;
	const lastRegionalRow = totalRegionaisRow ? totalRegionaisRow - 1 : null;
	if (
		firstRegionalRow &&
		lastRegionalRow &&
		lastRegionalRow >= firstRegionalRow
	) {
		for (let row = firstRegionalRow; row <= lastRegionalRow; row++) {
			const name = ct(ws, "B", row);
			if (!name) continue;
			const total = cv(ws, totalCol, row);
			const daily = [];
			for (let col = dayColStart; col <= dayColEnd; col++) {
				daily.push(cv(ws, encCol(col), row));
			}
			regionais.push({
				name,
				total,
				daily,
				percent: ((total / 110) * 100).toFixed(1),
			});
		}
	}
	regionais.sort((a, b) => b.total - a.total);

	const totalRegionais = regionais.reduce(
		(sum, item) => sum + Number(item.total || 0),
		0,
	);
	const totalMensal = totalRegionais + lojaTotal;
	const dashboardTotalOS = cv(ws, "B", 21);
	const totalOS = dashboardTotalOS > 0 ? dashboardTotalOS : totalMensal;
	const percentAchieved =
		meta > 0 ? Number(((totalOS / meta) * 100).toFixed(1)) : 0;

	const { metaPorDia, metaAcumuladaPorDia } = buildMetaDiariaSchedule({
		month: mes,
		meta,
		feriadosSet: feriadosExtras,
	});

	const saldoDiarioCalculado = [];
	let saldoMes = 0;
	for (let index = 0; index < dayCount; index++) {
		const diaNum = index + 1;
		const util = isDiaUtil(mes, diaNum, feriadosExtras);
		const regTot = regionais.reduce(
			(sum, item) => sum + Number(item.daily?.[index] || 0),
			0,
		);
		const lojaDia = Number(lojaDaily[index] || 0);
		const totalDia = regTot + lojaDia;
		if (totalDia <= 0) continue;

		const metaDoDia = util ? metaPorDia.get(diaNum) || 0 : 0;
		saldoMes += totalDia - metaDoDia;
		saldoDiarioCalculado.push({
			dia: diaNum,
			util,
			equipe: 0,
			agente: 0,
			loja: lojaDia,
			regionais: regTot,
			totalDia,
			metaDia: metaDoDia,
			metaAcumulada: metaAcumuladaPorDia.get(diaNum) || 0,
			saldoDia: totalDia - metaDoDia,
			saldoMes,
		});
	}

	return {
		mes,
		origem: "ONNET",
		cancelamentos,
		meta,
		metaSazonal,
		totalOS,
		planilhaCarregada: true,
		temLancamentos: totalOS > 0,
		percentAchieved,
		metaDiaria: 0,
		totalMultas: 0,
		propMult: 0,
		technicians: [],
		regionais,
		agenteTotal: 0,
		lojaTotal,
		saldoDiario: saldoDiarioCalculado,
		rawDays: saldoDiarioCalculado.map((item) => ({
			dia: item.dia,
			equipe: item.equipe,
			agente: item.agente,
			loja: item.loja,
			regionais: item.regionais,
			totalDia: item.totalDia,
		})),
		multasDiarias: [],
		status:
			Number.parseFloat(percentAchieved) >= metaSazonal
				? "Meta atingida!"
				: `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`,
	};
}

function mergePerformanceItems(items = []) {
	const byName = new Map();
	items.forEach((item) => {
		const name = item?.name || "";
		if (!name) return;
		const current = byName.get(name) || {
			...item,
			total: 0,
			daily: buildEmptyDaily(Array.isArray(item.daily) ? item.daily.length : 0),
		};
		const nextDaily = Array.isArray(item.daily) ? item.daily : [];
		const maxLength = Math.max(current.daily.length, nextDaily.length);
		current.daily = Array.from(
			{ length: maxLength },
			(_, index) =>
				Number(current.daily[index] || 0) + Number(nextDaily[index] || 0),
		);
		current.total += Number(item.total || 0);
		current.percent = ((current.total / 110) * 100).toFixed(1);
		byName.set(name, current);
	});
	return [...byName.values()].sort((a, b) => b.total - a.total);
}

function buildRawDaysFromSaldo(saldoDiario = []) {
	return (Array.isArray(saldoDiario) ? saldoDiario : []).map((item) => ({
		dia: Number(item?.dia || 0),
		equipe: Number(item?.equipe || 0),
		agente: Number(item?.agente || 0),
		loja: Number(item?.loja || 0),
		regionais: Number(item?.regionais || 0),
		totalDia: Number(item?.totalDia || 0),
	}));
}

function combineMonthlyData(sempreData, onnetData, mes, feriadosExtras = []) {
	if (!sempreData && !onnetData) return null;
	if (!sempreData) return onnetData;
	if (!onnetData) return sempreData;

	const meta = Number(sempreData.meta || 0) + Number(onnetData.meta || 0);
	const sourceTotalOS =
		Number(sempreData.totalOS || 0) + Number(onnetData.totalOS || 0);
	const cancelamentos =
		Number(sempreData.cancelamentos || 0) +
		Number(onnetData.cancelamentos || 0);
	const metaSazonal = Number(
		sempreData.metaSazonal || onnetData.metaSazonal || 80,
	);

	const days = new Map();
	[sempreData, onnetData].forEach((source) => {
		const rawDays =
			Array.isArray(source.rawDays) && source.rawDays.length
				? source.rawDays
				: buildRawDaysFromSaldo(source.saldoDiario);
		rawDays.forEach((item) => {
			const dia = Number(item?.dia || 0);
			if (!dia) return;
			const current = days.get(dia) || {
				dia,
				equipe: 0,
				agente: 0,
				loja: 0,
				regionais: 0,
				totalDia: 0,
			};
			current.equipe += Number(item.equipe || 0);
			current.agente += Number(item.agente || 0);
			current.loja += Number(item.loja || 0);
			current.regionais += Number(item.regionais || 0);
			current.totalDia += Number(item.totalDia || 0);
			days.set(dia, current);
		});
	});

	const { metaPorDia, metaAcumuladaPorDia } = buildMetaDiariaSchedule({
		month: mes,
		meta,
		feriadosSet: feriadosExtras,
	});
	let saldoMes = 0;
	const saldoDiario = [...days.values()]
		.sort((a, b) => a.dia - b.dia)
		.filter((item) => Number(item.totalDia || 0) > 0)
		.map((item) => {
			const util = isDiaUtil(mes, item.dia, feriadosExtras);
			const metaDia = util ? metaPorDia.get(item.dia) || 0 : 0;
			saldoMes += Number(item.totalDia || 0) - metaDia;
			return {
				...item,
				util,
				metaDia,
				metaAcumulada: metaAcumuladaPorDia.get(item.dia) || 0,
				saldoDia: Number(item.totalDia || 0) - metaDia,
				saldoMes,
			};
		});
	const totalDiarioConsolidado = saldoDiario.reduce(
		(sum, item) => sum + Number(item.totalDia || 0),
		0,
	);
	const totalOS =
		totalDiarioConsolidado > 0 ? totalDiarioConsolidado : sourceTotalOS;
	const percentAchieved =
		meta > 0 ? Number(((totalOS / meta) * 100).toFixed(1)) : 0;
	const agenteTotal = saldoDiario.reduce(
		(sum, item) => sum + Number(item.agente || 0),
		0,
	);
	const lojaTotal = saldoDiario.reduce(
		(sum, item) => sum + Number(item.loja || 0),
		0,
	);

	return {
		...sempreData,
		mes,
		origem: "ONNET + SEMPRE",
		cancelamentos,
		meta,
		totalOS,
		percentAchieved,
		metaSazonal,
		planilhaCarregada: true,
		temLancamentos: totalOS > 0,
		technicians: mergePerformanceItems(sempreData.technicians || []),
		regionais: mergePerformanceItems([
			...(sempreData.regionais || []),
			...(onnetData.regionais || []),
		]),
		agenteTotal,
		lojaTotal,
		saldoDiario,
		rawDays: saldoDiario.map((item) => ({
			dia: item.dia,
			equipe: item.equipe,
			agente: item.agente,
			loja: item.loja,
			regionais: item.regionais,
			totalDia: item.totalDia,
		})),
		status:
			Number.parseFloat(percentAchieved) >= metaSazonal
				? "Meta atingida!"
				: `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`,
	};
}

export function parseMetasWorkbook(wb, feriadosExtras = []) {
	const result = {};

	const wsDash = findSheet(wb, "DASHBOARD");
	const wsMult = findSheet(wb, "MULTAS");

	MONTHORDER.forEach((mes) => {
		const wsMonth = findSheet(wb, mes);
		const dRow = DASHROW[mes];
		if (!dRow) return;

		const cfg = findMonthlyLayout(
			wsMonth,
			mes === "Fevereiro" ? CFGFEV : CFGDEF,
		);
		const cancelamentos = cv(wsDash, "B", dRow);
		const meta = cv(wsDash, "C", dRow);
		const dashboardTotalOS = cv(wsDash, "D", dRow);
		const pctRaw = cv(wsDash, "F", dRow);
		const metaSazonal = META_SAZONAL[mes] ?? 80;

		const multCols = {
			Janeiro: 9,
			Fevereiro: 10,
			Marco: 11,
			Abril: 12,
			Maio: 13,
			Junho: 14,
			Julho: 15,
			Agosto: 16,
			Setembro: 17,
			Outubro: 18,
			Novembro: 19,
			Dezembro: 20,
		};
		let totalMultas = 0;
		if (wsMult) {
			const mCol = multCols[mes];
			if (mCol !== undefined) totalMultas = cv(wsMult, encCol(mCol - 1), 34);
		}

		const {
			diasUteis: du,
			metaDiariaMedia,
			metaPorDia,
			metaAcumuladaPorDia,
		} = buildMetaDiariaSchedule({
			month: mes,
			meta,
			feriadosSet: feriadosExtras,
		});
		const metaDiaria = du > 0 ? Math.ceil(metaDiariaMedia) : 0;

		const technicians = [];
		for (let i = 0; i < 7; i++) {
			const r = cfg.techStart + i;
			const name = wsMonth ? ct(wsMonth, "B", r) : TECHNAMES[i];
			const total = wsMonth ? cv(wsMonth, cfg.totalCol, r) : 0;
			const daily = [];
			for (let d = cfg.dayColStart; d <= cfg.dayColEnd; d++) {
				daily.push(wsMonth ? cv(wsMonth, encCol(d), r) : 0);
			}
			technicians.push({
				name,
				total,
				daily,
				percent: ((total / 110) * 100).toFixed(1),
			});
		}
		technicians.sort((a, b) => b.total - a.total);

		const regionais = [];
		for (let i = 0; i < 7; i++) {
			const r = cfg.regStart + i;
			const name = wsMonth ? ct(wsMonth, "B", r) : REGNAMES[i];
			const total = wsMonth ? cv(wsMonth, cfg.totalCol, r) : 0;
			const daily = [];
			for (let d = cfg.dayColStart; d <= cfg.dayColEnd; d++) {
				daily.push(wsMonth ? cv(wsMonth, encCol(d), r) : 0);
			}
			regionais.push({
				name,
				total,
				daily,
				percent: ((total / 110) * 100).toFixed(1),
			});
		}
		regionais.sort((a, b) => b.total - a.total);

		const agenteTotal = wsMonth ? cv(wsMonth, cfg.totalCol, cfg.agenteRow) : 0;
		const lojaTotal = wsMonth ? cv(wsMonth, cfg.totalCol, cfg.lojaRow) : 0;
		const totalMensal =
			technicians.reduce((sum, item) => sum + Number(item.total || 0), 0) +
			regionais.reduce((sum, item) => sum + Number(item.total || 0), 0) +
			agenteTotal +
			lojaTotal;
		const totalOS = dashboardTotalOS > 0 ? dashboardTotalOS : totalMensal;
		const percentAchieved =
			pctRaw > 0
				? pctRaw > 1
					? pctRaw
					: Number((pctRaw * 100).toFixed(1))
				: meta > 0
					? Number(((totalOS / meta) * 100).toFixed(1))
					: 0;
		const propMult =
			totalOS > 0 && totalMultas > 0 ? (totalOS / totalMultas).toFixed(1) : 0;
		const agenteDai = [];
		const lojaDai = [];
		for (let d = cfg.dayColStart; d <= cfg.dayColEnd; d++) {
			agenteDai.push(wsMonth ? cv(wsMonth, encCol(d), cfg.agenteRow) : 0);
			lojaDai.push(wsMonth ? cv(wsMonth, encCol(d), cfg.lojaRow) : 0);
		}

		const numDays = cfg.dayColEnd - cfg.dayColStart + 1;
		const saldoDiarioCalculado = [];
		let saldoMes = 0;
		for (let d = 0; d < numDays; d++) {
			const diaNum = d + 1;
			const util = isDiaUtil(mes, diaNum, feriadosExtras);
			const tecTot = technicians.reduce((s, t) => s + (t.daily[d] || 0), 0);
			const regTot = regionais.reduce((s, r) => s + (r.daily[d] || 0), 0);
			const agDia = agenteDai[d] || 0;
			const lojaDia = lojaDai[d] || 0;
			const totalDia = tecTot + regTot + agDia + lojaDia;
			if (totalDia <= 0) continue;

			const metaDoDia = util ? metaPorDia.get(diaNum) || 0 : 0;
			saldoMes += totalDia - metaDoDia;
			saldoDiarioCalculado.push({
				dia: diaNum,
				util,
				equipe: tecTot,
				agente: agDia,
				loja: lojaDia,
				regionais: regTot,
				totalDia,
				metaDia: metaDoDia,
				metaAcumulada: metaAcumuladaPorDia.get(diaNum) || 0,
				saldoDia: totalDia - metaDoDia,
				saldoMes,
			});
		}
		const saldoDiario = saldoDiarioCalculado;

		const multasDiarias = [];
		if (wsMult) {
			for (let d = 1; d <= 31; d++) {
				const lancadas = cv(wsMult, "B", d + 1);
				const retiradas = cv(wsMult, "C", d + 1);
				if (lancadas > 0 || retiradas > 0) {
					multasDiarias.push({ dia: d, lancadas, retiradas });
				}
			}
		}

		const sempreData = {
			mes,
			origem: "SEMPRE",
			cancelamentos,
			meta,
			metaSazonal,
			totalOS,
			planilhaCarregada: true,
			temLancamentos: Boolean(wsMonth) || totalOS > 0,
			percentAchieved,
			metaDiaria,
			totalMultas,
			propMult,
			technicians,
			regionais,
			agenteTotal,
			lojaTotal,
			saldoDiario,
			rawDays: saldoDiarioCalculado.map((item) => ({
				dia: item.dia,
				equipe: item.equipe,
				agente: item.agente,
				loja: item.loja,
				regionais: item.regionais,
				totalDia: item.totalDia,
			})),
			multasDiarias,
			status:
				Number.parseFloat(percentAchieved) >= metaSazonal
					? "Meta atingida!"
					: `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`,
		};

		const onnet = parseOnnetMonth(wb, mes, feriadosExtras);
		result[mes] = {
			...sempreData,
			...(onnet
				? {
						onnet,
						onnetSempre: combineMonthlyData(
							sempreData,
							onnet,
							mes,
							feriadosExtras,
						),
					}
				: {}),
		};
	});

	return result;
}

export const useMetas = () => {
	const [allData, setAllData] = useState({});
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState(false);
	const [lastUpdate, setLastUpdate] = useState(null);
	const mesAtual = MONTHORDER[new Date().getMonth()];
	const [mesSelecionado, setMesSelecionado] = useState(mesAtual);
	const [feriadosExtras, setFeriadosExtras] = useState([]);
	const [forcaTarefaConfig, setForcaTarefaConfig] = useState(null);
	const [metasBaseConfig, setMetasBaseConfig] = useState(() =>
		normalizeMetasBaseConfig(),
	);
	const [savingMetasBaseConfig, setSavingMetasBaseConfig] = useState(false);
	const [savingForcaTarefa, setSavingForcaTarefa] = useState(false);
	const [savingManualEntry, setSavingManualEntry] = useState(false);
	const [agentesData, setAgentesData] = useState({});
	const dataVersionRef = useRef(0);

	const buscarFeriadosVps = useCallback(async () => {
		try {
			const feriadosSet = await buscarFeriados();
			return Array.from(feriadosSet);
		} catch (e) {
			logger.warn("[useMetas] Erro ao buscar feriados:", e);
			return [];
		}
	}, []);

	const carregar = useCallback(async () => {
		const requestVersion = dataVersionRef.current;
		setLoading(true);
		try {
			const [dados, lu, extras, forcaConfig, baseConfig] = await Promise.all([
				buscarTodasMetas(),
				buscarUltimaAtualizacao(),
				buscarFeriadosVps(),
				buscarForcaTarefaConfig(),
				buscarMetasBaseConfig(),
			]);
			if (requestVersion !== dataVersionRef.current) return;
			const normalizedBaseConfig = normalizeMetasBaseConfig(baseConfig);
			if (dados && Object.keys(dados).length > 0) {
				setAllData(applyMetasBaseConfigToAllData(dados, normalizedBaseConfig));
			}
			if (lu) setLastUpdate(lu);
			setFeriadosExtras(extras);
			setForcaTarefaConfig(forcaConfig);
			setMetasBaseConfig(normalizedBaseConfig);
		} catch (e) {
			logger.error("Erro ao carregar metas", e);
		} finally {
			setLoading(false);
		}
	}, [buscarFeriadosVps]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	useEffect(() => {
		return subscribeRealtimeTopics(
			["metas"],
			() => {
				invalidateMetasCache();
				invalidateForcaTarefaConfigCache();
				invalidateMetasBaseConfigCache();
				invalidateDashboardDataCache();
				invalidateInternalStaticDataCache();
				carregar();
			},
			{ debounceMs: 250 },
		);
	}, [carregar]);

	const processarPlanilha = useCallback(
		async (file) => {
			const uploadVersion = dataVersionRef.current + 1;
			dataVersionRef.current = uploadVersion;
			setUploading(true);
			try {
				const buffer = await file.arrayBuffer();
				const wb = XLSX.read(new Uint8Array(buffer), {
					type: "array",
					cellDates: false,
				});

				const extras = await buscarFeriadosVps();
				setFeriadosExtras(extras);

				const baseConfig = await buscarMetasBaseConfig(true);
				const parsed = applyMetasBaseConfigToAllData(
					parseMetasWorkbook(wb, extras),
					baseConfig,
				);
				setAllData(parsed);
				setMetasBaseConfig(normalizeMetasBaseConfig(baseConfig));

				const agentesData = parseAgentesWorkbook(wb);
				setAgentesData(agentesData);
				const now = new Date();
				const txt = `Ultima atualizacao: ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")} as ${String(now.getHours()).padStart(2, "0")}h${String(now.getMinutes()).padStart(2, "0")}`;
				const persistResult = await persistMetasImport({
					parsed,
					agentesData,
					lastUpdate: txt,
				});

				if (uploadVersion !== dataVersionRef.current) return;
				invalidateMetasCache();
				setAllData(parsed);
				setAgentesData(agentesData);
				setLastUpdate(txt);
				invalidateDashboardDataCache(persistResult?.generatedAt || null);
				invalidateInternalStaticDataCache(persistResult?.generatedAt || null);
				setMesSelecionado(MONTHORDER[new Date().getMonth()]);
			} catch (e) {
				logger.error("Erro ao processar planilha", e);
				throw e;
			} finally {
				if (uploadVersion === dataVersionRef.current) {
					setUploading(false);
				}
			}
		},
		[buscarFeriadosVps],
	);

	const salvarForcaTarefa = useCallback(async (config) => {
		setSavingForcaTarefa(true);
		try {
			const result = await saveMetasForceTaskConfig(config);
			const nextConfig = result?.config || config;
			setForcaTarefaConfig(nextConfig);
			invalidateForcaTarefaConfigCache();
			invalidateDashboardDataCache(result?.generatedAt || null);
			invalidateInternalStaticDataCache(result?.generatedAt || null);
			return nextConfig;
		} finally {
			setSavingForcaTarefa(false);
		}
	}, []);

	const salvarConfiguracaoMetasBase = useCallback(async (config) => {
		setSavingMetasBaseConfig(true);
		try {
			const nextConfig = await salvarMetasBaseConfig(config);
			setMetasBaseConfig(nextConfig);
			setAllData((current) =>
				applyMetasBaseConfigToAllData(current, nextConfig),
			);
			invalidateMetasCache();
			invalidateMetasBaseConfigCache();
			invalidateDashboardDataCache();
			invalidateInternalStaticDataCache();
			return nextConfig;
		} finally {
			setSavingMetasBaseConfig(false);
		}
	}, []);

	const salvarLancamentoManual = useCallback(
		async ({ mes, fonte, ano, lancamento }) => {
			const uploadVersion = dataVersionRef.current + 1;
			dataVersionRef.current = uploadVersion;
			setSavingManualEntry(true);
			try {
				const extras = await buscarFeriadosVps();
				const feriadosSet = new Set(extras);
				const baseConfig = await buscarMetasBaseConfig(true, {
					preferLive: true,
				});
				const manualRecord = buildManualMetasRecord({
					month: mes,
					source: fonte,
					year: ano,
					baseConfig,
					feriadosSet,
					...lancamento,
				});
				const { agentesData: manualAgentCities, ...recordData } = manualRecord;
				const currentMonthData = allData[mes] || {};
				const currentSempre =
					currentMonthData && typeof currentMonthData === "object"
						? {
								...currentMonthData,
								onnet: undefined,
								onnetSempre: undefined,
							}
						: null;
				const sempreRecord =
					fonte === MANUAL_META_SOURCES.SEMPRE ? recordData : currentSempre;
				const onnetRecord =
					fonte === MANUAL_META_SOURCES.ONNET
						? recordData
						: currentMonthData.onnet || null;
				const combined = combineMetasRecords(sempreRecord, onnetRecord, mes, {
					year: ano,
					feriadosSet,
				});
				const nextMonthData =
					fonte === MANUAL_META_SOURCES.ONNET
						? {
								...(currentSempre || {}),
								onnet: recordData,
								onnetSempre: combined,
							}
						: {
								...recordData,
								onnet: onnetRecord,
								onnetSempre: combined,
							};
				const parsed = {
					...allData,
					[mes]: nextMonthData,
				};
				const nextAgentesData =
					fonte === MANUAL_META_SOURCES.SEMPRE
						? {
								...agentesData,
								[mes]: manualAgentCities || [],
							}
						: agentesData;
				const now = new Date();
				const txt = `Ultima atualizacao: ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")} as ${String(now.getHours()).padStart(2, "0")}h${String(now.getMinutes()).padStart(2, "0")}`;
				const persistResult = await persistMetasImport({
					parsed,
					agentesData: nextAgentesData,
					lastUpdate: txt,
				});

				if (uploadVersion !== dataVersionRef.current) return null;
				invalidateMetasCache();
				invalidateDashboardDataCache(persistResult?.generatedAt || null);
				invalidateInternalStaticDataCache(persistResult?.generatedAt || null);
				setFeriadosExtras(extras);
				setMetasBaseConfig(normalizeMetasBaseConfig(baseConfig));
				setAllData(applyMetasBaseConfigToAllData(parsed, baseConfig));
				setAgentesData(nextAgentesData);
				setLastUpdate(txt);
				setMesSelecionado(mes);
				return persistResult;
			} catch (e) {
				logger.error("Erro ao salvar lancamento manual de metas", e);
				throw e;
			} finally {
				if (uploadVersion === dataVersionRef.current) {
					setSavingManualEntry(false);
				}
			}
		},
		[agentesData, allData, buscarFeriadosVps],
	);

	return {
		allData,
		dadosMes: allData[mesSelecionado] ?? null,
		loading,
		uploading,
		lastUpdate,
		mesSelecionado,
		setMesSelecionado,
		processarPlanilha,
		forcaTarefaConfig,
		agentesData,
		savingForcaTarefa,
		salvarForcaTarefa,
		metasBaseConfig,
		savingMetasBaseConfig,
		salvarConfiguracaoMetasBase,
		savingManualEntry,
		salvarLancamentoManual,
		carregar,
		feriadosExtras,
	};
};
