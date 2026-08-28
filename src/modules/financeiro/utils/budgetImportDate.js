import * as XLSX from "xlsx";

const BUDGET_MONTHS = [
	"",
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

export function buildBudgetDateInfo(year, month, day) {
	const safeYear = Number(year);
	const safeMonth = Number(month);
	const safeDay = Number(day);
	if (
		!Number.isFinite(safeYear) ||
		!Number.isFinite(safeMonth) ||
		!Number.isFinite(safeDay) ||
		safeMonth < 1 ||
		safeMonth > 12 ||
		safeDay < 1 ||
		safeDay > 31
	) {
		return {};
	}
	return {
		data: `${safeYear}-${String(safeMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`,
		ano: safeYear,
		numMes: safeMonth,
		mes: BUDGET_MONTHS[safeMonth] || "",
	};
}

export function parseExcelSerialDate(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return {};
	const parsed = XLSX.SSF.parse_date_code(value);
	if (!parsed?.y || !parsed?.m || !parsed?.d) return {};
	return buildBudgetDateInfo(parsed.y, parsed.m, parsed.d);
}

export function parseIsoDate(text) {
	const match = String(text || "")
		.trim()
		.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (!match) return {};
	return buildBudgetDateInfo(match[1], match[2], match[3]);
}

export function parseBrazilianDate(text) {
	const match = String(text || "")
		.trim()
		.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
	if (!match) return {};
	const first = Number(match[1]);
	const second = Number(match[2]);
	const month = first <= 12 ? first : second;
	const day = first <= 12 ? second : first;
	const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
	return buildBudgetDateInfo(year, month, day);
}

export function normalizeBudgetImportDate(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const dateInfo = buildBudgetDateInfo(
			value.getFullYear(),
			value.getMonth() + 1,
			value.getDate(),
		);
		return {
			...dateInfo,
			data: value.toISOString().slice(0, 10),
		};
	}

	for (const parser of [parseExcelSerialDate, parseIsoDate, parseBrazilianDate]) {
		const dateInfo = parser(value);
		if (Object.keys(dateInfo).length) return dateInfo;
	}
	return {};
}
