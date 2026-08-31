import * as XLSX from "xlsx";
import {
	calculateDreStatement,
	classifyDreCategory,
	DRE_LINE_IDS,
} from "../utils/dreStatement";

const DRE_VALUE_HEADERS = ["valor", "realizado", "saldo", "total", "vlr"];
const DRE_CATEGORY_HEADERS = [
	"linha",
	"linhadre",
	"categoria",
	"classificacao",
	"classificacaodre",
	"grupo",
	"conta",
];
const DRE_DESCRIPTION_HEADERS = ["descricao", "historico", "nome", "detalhe"];

export function normalizeFinancialStatementHeader(value) {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function firstValue(row = {}, headers = []) {
	for (const header of headers) {
		const value = row[header];
		if (value !== undefined && value !== null && String(value).trim()) {
			return value;
		}
	}
	return "";
}

export function parseFinancialStatementMoney(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = String(value || "")
		.replace(/[R$\s]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(",", ".");
	const parsed = Number(normalized || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function parseFinancialStatementCompetencia(value, fallback = {}) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return { ano: value.getFullYear(), mes: value.getMonth() + 1 };
	}
	const text = String(value || "").trim();
	const br = text.match(/(\d{1,2})[/-](\d{4})/);
	if (br) return { mes: Number(br[1]), ano: Number(br[2]) };
	const iso = text.match(/(\d{4})[/-](\d{1,2})/);
	if (iso) return { ano: Number(iso[1]), mes: Number(iso[2]) };
	return fallback;
}

function normalizeSheetRow(row = {}) {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			normalizeFinancialStatementHeader(key),
			value,
		]),
	);
}

export function parseDreWorkbook(file, buffer) {
	const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
	const sheetName = workbook.SheetNames[0];
	const sheet = workbook.Sheets[sheetName];
	const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
	const current = new Date();
	const rows = rawRows.map((rawRow, index) => {
		const row = normalizeSheetRow(rawRow);
		const competencia = parseFinancialStatementCompetencia(
			firstValue(row, ["competencia", "mesano", "periodo", "data"]),
			{
				ano: Number(row.ano) || current.getFullYear(),
				mes: Number(row.mes || row.nummes) || current.getMonth() + 1,
			},
		);
		const categoriaOriginal = firstValue(row, DRE_CATEGORY_HEADERS);
		const linhaDre = classifyDreCategory(categoriaOriginal);
		return {
			index: index + 2,
			competenciaAno: competencia.ano,
			competenciaMes: competencia.mes,
			linhaDre,
			categoriaOriginal,
			descricao: firstValue(row, DRE_DESCRIPTION_HEADERS),
			valor: parseFinancialStatementMoney(firstValue(row, DRE_VALUE_HEADERS)),
			origemArquivo: file.name,
			raw: rawRow,
		};
	});
	return {
		fileName: file.name,
		sheetName,
		rows: rows.filter(
			(row) =>
				row.categoriaOriginal ||
				row.descricao ||
				row.valor ||
				row.competenciaAno ||
				row.competenciaMes,
		),
	};
}

export function buildDreStatementViewModel(data = {}, preview = null) {
	const statement = calculateDreStatement(data.totalsByLine || {});
	const byId = new Map(statement.map((line) => [line.id, line]));
	const previewRows = preview?.rows || [];
	return {
		statement,
		byId,
		classifiedRows: previewRows.filter((row) => row.linhaDre),
		unclassifiedRows: previewRows.filter((row) => !row.linhaDre),
		kpis: [
			[
				"Receita Líquida",
				byId.get(DRE_LINE_IDS.RECEITA_LIQUIDA)?.value || 0,
			],
			["Lucro Bruto", byId.get(DRE_LINE_IDS.LUCRO_BRUTO)?.value || 0],
			[
				"Resultado Antes IRPJ/CSLL",
				byId.get(DRE_LINE_IDS.RESULTADO_ANTES_IRPJ_CSLL)?.value || 0,
			],
			[
				"Resultado Líquido",
				byId.get(DRE_LINE_IDS.RESULTADO_LIQUIDO)?.value || 0,
			],
		],
	};
}
