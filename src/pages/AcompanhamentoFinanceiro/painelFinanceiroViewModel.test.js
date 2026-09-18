import { describe, expect, it } from "vitest";
import { buildAcompanhamentoFinanceiroViewModel } from "./painelFinanceiroViewModel";

describe("painelFinanceiroViewModel", () => {
	it("builds financial panel metrics from Serasa and Tarifas reports", () => {
		const viewModel = buildAcompanhamentoFinanceiroViewModel({
			reference: { year: 2026, month: 8 },
			serasaReport: {
				rows: [
					{
						date: "2026-08-10",
						year: 2026,
						month: 8,
						value: 100,
						operation: "Entrada",
					},
					{
						date: "2026-08-11",
						year: 2026,
						month: 8,
						value: -30,
						operation: "Taxa",
					},
					{
						date: "2026-08-12",
						year: 2026,
						month: 8,
						value: -70,
						operation: "-",
						isNetRevenue: true,
					},
				],
				clientesHistory: [{ key: "2026-08", year: 2026, month: 8, clientes: 10 }],
			},
			tarifasReport: {
				receitasDiarias: [
					{ year: 2026, month: 8, value: 500 },
					{ year: 2026, month: 7, value: 250 },
				],
				formasPagamentoQuantidade: [
					{ year: 2026, month: 8, method: "Boleto", quantity: 30 },
					{ year: 2026, month: 8, method: "Pix", quantity: 20 },
				],
				formasCobrancaClientes: [
					{ year: 2026, month: 8, method: "Boleto", customers: 300 },
					{ year: 2026, month: 8, method: "Pix", customers: 200 },
				],
				faturas: [
					{ year: 2026, month: 8, metric: "FATURAMENTO", value: 1000 },
					{ year: 2026, month: 8, metric: "OUTROS LANÇAMENTOS", value: 20 },
				],
			},
		});

		expect(viewModel.periodLabel).toBe("agosto / 2026");
		expect(viewModel.kpis.find((item) => item.id === "faturamento")?.value).toBe(1020);
		expect(viewModel.kpis.find((item) => item.id === "clientes")?.value).toBe(10);
		expect(viewModel.kpis.find((item) => item.id === "ticket")?.value).toBe(50);
		expect(viewModel.kpis.find((item) => item.id === "receitaLiquida")?.value).toBe(3);
		expect(viewModel.invoiceSnapshot).toEqual({ active: 1000, canceled: 20 });
		expect(viewModel.paymentRanking.map((item) => item.label)).toEqual(["Boleto", "Pix"]);
		expect(viewModel.paymentRanking.map((item) => item.value)).toEqual([30, 20]);
		expect(viewModel.billingClientsSeries.map((item) => item.value)).toEqual([300, 200]);
	});
});
