import { describe, expect, it } from "vitest";
import {
	getBudgetMonthSelectorYear,
	getBudgetReference,
	getFinanceiroPageFlags,
} from "./financeiroPageViewModel";

describe("financeiroPageViewModel", () => {
	it("identifica paginas operacionais e paginas compactas sem depender do componente", () => {
		expect(getFinanceiroPageFlags("orcamentoDre")).toMatchObject({
			isBudgetPage: true,
			isBudgetOperationalPage: true,
			hideHeaderControls: false,
			isCompactReportPage: false,
		});
		expect(getFinanceiroPageFlags("reportsTarifas")).toMatchObject({
			isBudgetPage: false,
			isBudgetOperationalPage: false,
			hideHeaderControls: true,
			isCompactReportPage: true,
		});
	});

	it("monta referencia do orçamento usando lastImportReference antes do summary", () => {
		expect(
			getBudgetReference({
				lastImportReference: { year: 2026, month: 8 },
				lastImportSummary: { referenceYear: 2025, referenceMonth: 7 },
			}),
		).toEqual({ referenceYear: 2026, referenceMonth: 8 });
	});

	it("calcula ano do seletor com override antes da referencia", () => {
		expect(
			getBudgetMonthSelectorYear(
				{ referenceYear: 2024 },
				{ referenceYear: 2026 },
				2025,
			),
		).toBe(2024);
	});
});
