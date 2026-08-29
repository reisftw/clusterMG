import { describe, expect, it, vi } from "vitest";
import {
	buildClientRevenueDetailViewModel,
	buildInvoicesDetailViewModel,
	buildPaymentMethodsDetailViewModel,
	invoiceMetricType,
} from "./tariffsViewModels";

describe("tariffsViewModels", () => {
	it("normalizes invoice metric labels used by the spreadsheet", () => {
		expect(invoiceMetricType("FATURAMENTO")).toBe("Ativas");
		expect(invoiceMetricType("ATIVAS")).toBe("Ativas");
		expect(invoiceMetricType("OUTROS LANÇAMENTOS")).toBe("Canceladas");
		expect(invoiceMetricType("CANCELADAS")).toBe("Canceladas");
		expect(invoiceMetricType("TOTAL")).toBe("");
	});

	it("builds invoice KPIs and keeps doughnut center as active minus canceled", () => {
		vi.setSystemTime(new Date("2026-08-29T12:00:00Z"));
		const viewModel = buildInvoicesDetailViewModel({
			report: {
				faturas: [
					{ year: 2026, month: 7, metric: "FATURAMENTO", value: 100 },
					{ year: 2026, month: 7, metric: "OUTROS LANÇAMENTOS", value: 15 },
					{ year: 2026, month: 7, metric: "TOTAL", value: 115 },
					{ year: 2026, month: 10, metric: "FATURAMENTO", value: 999 },
				],
			},
			year: 2026,
			month: 7,
		});

		expect(viewModel.kpis).toMatchObject([
			{ title: "Ativas", value: 100 },
			{ title: "Canceladas", value: 15 },
			{ title: "Meses lidos", value: 1 },
		]);
		expect(viewModel.centerText.value).toBe("85");
		expect(viewModel.monthlyChart.labels).toEqual(["julho"]);
		vi.useRealTimers();
	});

	it("builds client revenue table data with pagination", () => {
		const viewModel = buildClientRevenueDetailViewModel({
			report: {
				receitaPorCliente: [
					{ year: 2026, month: 8, clientCode: "1", clientName: "Sempre", value: 120, total: 300 },
					{ year: 2026, month: 8, clientCode: "2", clientName: "Intersete", value: 80, total: 100 },
				],
			},
			year: 2026,
			month: 8,
			searchTerm: "sempre",
			pageSize: 50,
		});

		expect(viewModel.kpis[0]).toMatchObject({ title: "Receita anual", value: 200 });
		expect(viewModel.searchedRows).toHaveLength(1);
		expect(viewModel.tableRows[0].clientName).toBe("Sempre");
		expect(viewModel.showTable).toBe(true);
	});

	it("builds payment method ranking with percent of total", () => {
		const viewModel = buildPaymentMethodsDetailViewModel({
			report: {
				formasPagamentoValor: [
					{ year: 2026, month: 8, method: "Pix", value: 75 },
					{ year: 2026, month: 8, method: "Boleto", value: 25 },
				],
				formasPagamentoQuantidade: [
					{ year: 2026, month: 8, method: "Pix", quantity: 3 },
					{ year: 2026, month: 8, method: "Boleto", quantity: 1 },
				],
				formasCobrancaValor: [{ year: 2026, month: 8, method: "Pix", value: 10 }],
			},
			year: 2026,
			month: 8,
		});

		expect(viewModel.kpis[0]).toMatchObject({ title: "Valor recebido", value: 100 });
		expect(viewModel.kpis[1]).toMatchObject({ title: "Quantidade", value: 4 });
		expect(viewModel.doughnutRows[0]).toMatchObject({
			label: "Pix",
			value: 75,
			percentOfTotal: 75,
		});
		expect(viewModel.tableRows).toHaveLength(5);
	});
});
