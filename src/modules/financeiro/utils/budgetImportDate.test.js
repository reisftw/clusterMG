import { describe, expect, it } from "vitest";
import {
	buildBudgetDateInfo,
	normalizeBudgetImportDate,
	parseBrazilianDate,
	parseExcelSerialDate,
	parseIsoDate,
} from "./budgetImportDate";

describe("budgetImportDate", () => {
	it("buildBudgetDateInfo monta a estrutura padrao de data orcamentaria", () => {
		expect(buildBudgetDateInfo(2026, 8, 3)).toEqual({
			data: "2026-08-03",
			ano: 2026,
			numMes: 8,
			mes: "Agosto",
		});
	});

	it("normalizeBudgetImportDate normaliza Date nativo preservando o comportamento ISO antigo", () => {
		expect(normalizeBudgetImportDate(new Date("2026-08-03T12:00:00Z"))).toEqual(
			{
				data: "2026-08-03",
				ano: 2026,
				numMes: 8,
				mes: "Agosto",
			},
		);
	});

	it("parseExcelSerialDate normaliza numero serial do Excel", () => {
		expect(parseExcelSerialDate(46251)).toEqual({
			data: "2026-08-17",
			ano: 2026,
			numMes: 8,
			mes: "Agosto",
		});
	});

	it("parseIsoDate normaliza data ISO yyyy-mm-dd", () => {
		expect(parseIsoDate("2026-8-3")).toEqual({
			data: "2026-08-03",
			ano: 2026,
			numMes: 8,
			mes: "Agosto",
		});
	});

	it("parseBrazilianDate aceita data BR dd/mm/yyyy", () => {
		expect(parseBrazilianDate("25/08/2026")).toEqual({
			data: "2026-08-25",
			ano: 2026,
			numMes: 8,
			mes: "Agosto",
		});
	});

	it("parseBrazilianDate preserva a heuristica antiga para datas ambíguas mm/dd/yyyy", () => {
		expect(parseBrazilianDate("8/3/2026")).toEqual({
			data: "2026-08-03",
			ano: 2026,
			numMes: 8,
			mes: "Agosto",
		});
	});

	it("normalizeBudgetImportDate retorna objeto vazio para valores invalidos", () => {
		expect(normalizeBudgetImportDate(null)).toEqual({});
		expect(normalizeBudgetImportDate(undefined)).toEqual({});
		expect(normalizeBudgetImportDate("")).toEqual({});
		expect(normalizeBudgetImportDate("2026-24-03")).toEqual({});
		expect(normalizeBudgetImportDate("99/99/2026")).toEqual({});
		expect(normalizeBudgetImportDate(Number.NaN)).toEqual({});
	});
});
