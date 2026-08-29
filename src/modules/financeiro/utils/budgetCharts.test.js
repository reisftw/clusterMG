import { describe, expect, it } from "vitest";
import {
	buildBudgetAccountChart,
	buildBudgetCenterChart,
	buildBudgetForecastChart,
	buildBudgetFullSupplierChart,
	buildBudgetMonthlyChart,
	buildBudgetSupplierChart,
} from "./budgetCharts";

const insights = {
	monthlyEvolution: [
		{ label: "Jan", planned: 100, realized: 50 },
		{ label: "Fev", planned: 100, realized: 0 },
	],
	forecastRows: [
		{ label: "Jan", cumulativeRealized: 50, forecast: 50 },
		{ label: "Fev", cumulativeRealized: 50, forecast: 100 },
	],
};

describe("budgetCharts", () => {
	it("builds monthly and forecast charts preserving series labels", () => {
		expect(buildBudgetMonthlyChart(insights)).toMatchObject({
			labels: ["Jan", "Fev"],
			datasets: [
				{ label: "Orçado", data: [100, 100] },
				{ label: "Realizado", data: [50, 0] },
			],
		});
		expect(buildBudgetForecastChart(insights)).toMatchObject({
			labels: ["Jan", "Fev"],
			datasets: [
				{ label: "Realizado acumulado", data: [50, 50] },
				{ label: "Forecast", data: [50, 100] },
			],
		});
	});

	it("builds account, center and supplier charts with limits and totals", () => {
		const accounts = [
			{ id: "1", account: { codigo: "1", nome: "Receita" }, planned: 100, realized: 80 },
			{ id: "2", account: { codigo: "2", nome: "Despesa" }, planned: 50, realized: 70 },
		];
		const centers = [
			{ center: { codigo: "110701", nome: "ROT" }, planned: 100, realized: 80 },
			{ center: { codigo: "110702", nome: "ADM" }, planned: 50, realized: 70 },
		];
		const suppliers = [
			{ supplier: "CEMIG", value: 100 },
			{ supplier: "Fornecedor B", value: 50 },
		];

		expect(buildBudgetAccountChart(accounts, (account) => account.nome, 1).chart.labels).toEqual(["Receita"]);
		expect(buildBudgetCenterChart(centers, (center) => center.nome, 2).chart.datasets[0].data).toEqual([20, 0]);
		expect(buildBudgetSupplierChart(suppliers, 1)).toMatchObject({
			total: 100,
			chart: { labels: ["CEMIG"] },
		});
		expect(buildBudgetFullSupplierChart(suppliers).datasets[0]).toMatchObject({
			label: "Realizado",
			data: [100, 50],
		});
	});
});
