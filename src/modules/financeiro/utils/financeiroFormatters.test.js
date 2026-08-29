import { describe, expect, it } from "vitest";
import {
	brl,
	decimal,
	formatBudgetCurrency,
	formatValue,
	integer,
	parseBudgetCurrency,
	parseMoneyInput,
} from "./financeiroFormatters";

describe("financeiroFormatters", () => {
	it("mantem formatadores Intl compartilhados", () => {
		expect(brl.format(1234.56)).toBe("R$ 1.234,56");
		expect(integer.format(1234.56)).toBe("1.235");
		expect(decimal.format(12.345)).toBe("12,35");
	});

	it("parseBudgetCurrency preserva conversao de valores da planilha", () => {
		expect(parseBudgetCurrency(123.45)).toBe(123.45);
		expect(parseBudgetCurrency(Number.NaN)).toBe(0);
		expect(parseBudgetCurrency("R$ 1.234,56")).toBe(1234.56);
		expect(parseBudgetCurrency("1234.56")).toBe(1234.56);
		expect(parseBudgetCurrency("")).toBe(0);
		expect(parseBudgetCurrency("abc123")).toBe(0);
	});

	it("formatBudgetCurrency formata depois de aplicar parseBudgetCurrency", () => {
		expect(formatBudgetCurrency("R$ 1.234,56")).toBe("R$ 1.234,56");
		expect(formatBudgetCurrency("valor invalido")).toBe("R$ 0,00");
	});

	it("parseMoneyInput preserva comportamento permissivo de campos monetarios", () => {
		expect(parseMoneyInput("R$ 1.234,56")).toBe(1234.56);
		expect(parseMoneyInput("abc123")).toBe(123);
		expect(parseMoneyInput("")).toBe(0);
		expect(parseMoneyInput(Number.NaN)).toBe(0);
	});

	it("formatValue formata texto, moeda, percentual e numero", () => {
		expect(formatValue("Fornecedor", "text")).toBe("Fornecedor");
		expect(formatValue("", "text")).toBe("-");
		expect(formatValue(1234.56, "currency")).toBe("R$ 1.234,56");
		expect(formatValue(12.345, "percent")).toBe("12,35%");
		expect(formatValue(1234.56)).toBe("1.235");
	});
});
