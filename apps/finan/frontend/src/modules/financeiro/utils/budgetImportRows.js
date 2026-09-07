import { normalizeBudgetImportDate } from "./budgetImportDate";
import { parseBudgetCurrency } from "./financeiroFormatters";

export const BUDGET_IMPORT_HEADER_MAP = {
	area: "quebra",
	quebra: "quebra",
	data: "data",
	datapagamento: "data",
	data_pagamento: "data",
	fornecedor: "fornecedor",
	cf: "cf",
	codconta: "codConta",
	cod_conta: "codConta",
	nomeconta: "nomeConta",
	nome_conta: "nomeConta",
	cc: "cc",
	codcc: "codCc",
	cod_cc: "codCc",
	nomecc: "nomeCc",
	nome_cc: "nomeCc",
	orcado: "orcado",
	realizado: "realizado",
	valor: "realizado",
	empresa: "empresa",
	filial: "filial",
	banco: "conta",
	conta: "conta",
	seq: "seqMov",
	seqmov: "seqMov",
	titulo: "titulo",
	tipo: "tipo",
	observacoes: "observacoes",
	historico: "observacoes",
	__empty_8: "observacoes",
	ano: "ano",
	nummes: "numMes",
	num_mes: "numMes",
	mes: "mes",
	categoria: "categoria",
	gestor: "gestor",
	quebra2: "quebra2",
	entidade: "entidade",
	diretoria: "diretoria",
	diretor: "diretor",
	statusprojetos: "statusProjetos",
	status_projetos: "statusProjetos",
	grupo: "grupo",
};

export function normalizeImportHeader(value) {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "");
}

export function formatSpreadsheetValue(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toLocaleDateString("pt-BR");
	}
	return value ?? "";
}

export function splitBudgetCodeName(value) {
	const text = String(value || "").trim();
	if (!text) return { code: "", name: "" };
	const match = text.match(/^\s*([^-–—]+?)\s*[-–—]\s*(.+)\s*$/);
	if (!match) return { code: "", name: text };
	return {
		code: String(match[1] || "").trim(),
		name: String(match[2] || "").trim(),
	};
}

const addDetectedField = (detectedFields, field) => {
	detectedFields.add(field);
};

export function normalizeAccountField({ detectedFields, formattedValue, normalized }) {
	const account = splitBudgetCodeName(formattedValue);
	if (account.code) {
		addDetectedField(detectedFields, "codConta");
		normalized.codConta = account.code;
	}
	if (account.name) {
		addDetectedField(detectedFields, "nomeConta");
		normalized.nomeConta = account.name;
	}
	normalized.cf = formattedValue;
}

export function normalizeCostCenterField({
	detectedFields,
	formattedValue,
	normalized,
}) {
	const costCenter = splitBudgetCodeName(formattedValue);
	if (costCenter.code) {
		addDetectedField(detectedFields, "codCc");
		normalized.codCc = costCenter.code;
	}
	if (costCenter.name) {
		addDetectedField(detectedFields, "nomeCc");
		normalized.nomeCc = costCenter.name;
	}
	normalized.cc = formattedValue;
}

export function normalizeDateField({ detectedFields, formattedValue, normalized, value }) {
	const dateInfo = normalizeBudgetImportDate(value) || {};
	addDetectedField(detectedFields, "data");
	normalized.data = dateInfo.data || formattedValue;
	if (dateInfo.ano) {
		addDetectedField(detectedFields, "ano");
		normalized.ano = dateInfo.ano;
	}
	if (dateInfo.numMes) {
		addDetectedField(detectedFields, "numMes");
		normalized.numMes = dateInfo.numMes;
	}
	if (dateInfo.mes) {
		addDetectedField(detectedFields, "mes");
		normalized.mes = dateInfo.mes;
	}
}

export function normalizeCurrencyField({
	detectedFields,
	formattedValue,
	mappedKey,
	normalized,
}) {
	addDetectedField(detectedFields, mappedKey);
	normalized[mappedKey] = parseBudgetCurrency(formattedValue);
}

export function normalizeMonthField({ detectedFields, formattedValue, mappedKey, normalized }) {
	const month = Number(formattedValue || 0) || 0;
	if (month >= 1 && month <= 12 && !normalized.numMes) {
		addDetectedField(detectedFields, mappedKey);
		normalized[mappedKey] = month;
	}
}

export const FIELD_NORMALIZERS = {
	cf: normalizeAccountField,
	cc: normalizeCostCenterField,
	data: normalizeDateField,
	orcado: normalizeCurrencyField,
	realizado: normalizeCurrencyField,
	numMes: normalizeMonthField,
};

function normalizeDefaultField({
	detectedFields,
	formattedValue,
	mappedKey,
	normalized,
}) {
	addDetectedField(detectedFields, mappedKey);
	normalized[mappedKey] = formattedValue;
}

export function normalizeBudgetImportRows(rows = []) {
	const detectedFields = new Set();
	const normalizedRows = rows
		.map((row) => {
			const normalized = {};
			Object.entries(row || {}).forEach(([header, value]) => {
				const mappedKey = BUDGET_IMPORT_HEADER_MAP[normalizeImportHeader(header)];
				if (!mappedKey) return;
				const formattedValue = formatSpreadsheetValue(value);
				const normalizer = FIELD_NORMALIZERS[mappedKey] || normalizeDefaultField;
				normalizer({
					detectedFields,
					formattedValue,
					mappedKey,
					normalized,
					value,
				});
			});
			return normalized;
		})
		.filter((row) =>
			Object.values(row).some((value) => String(value ?? "").trim()),
		);

	return { rows: normalizedRows, detectedFields: Array.from(detectedFields) };
}
