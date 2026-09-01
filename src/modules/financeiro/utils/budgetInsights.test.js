import { describe, expect, it, vi } from "vitest";
import {
	buildBudgetOperationalKpis,
	buildBudgetPeriod,
	buildCostCenterTopCards,
	buildDirectorateRows,
	buildOperationalCenterGroups,
	budgetConsumptionStatus,
	budgetVarianceMeta,
	findBudgetParetoRows,
	getBudgetInsights,
	getConfiguredCenterBudget,
	isBudgetCenterResponsible,
	movementSupplierName,
	movementValue,
	paginateBudgetGroups,
} from "./budgetInsights";

const config = {
	accounts: [{ id: "1211", codigo: "1211", nome: "Energia" }],
	centers: [
		{ id: "110700", codigo: "110700", nome: "OPERACOES", tipoPlano: "S", nivel: 3 },
		{
			id: "110701",
			codigo: "110701",
			nome: "ROT",
			tipoPlano: "A",
			parentId: "110700",
			valorMensal: 1000,
			emailResponsavel: "tiago@sempre.net",
			diretoria: "Operacional",
			realizedByCompanyBranch: [
				{
					year: 2026,
					month: 8,
					accountId: "1211",
					realized: 1200,
					movements: [
						{ id: "m1", supplier: "CEMIG", value: 700, accountId: "1211" },
						{ id: "m2", fornecedor: "Fornecedor B", valor: 500 },
					],
				},
			],
		},
		{
			id: "110702",
			codigo: "110702",
			nome: "Sem movimento",
			tipoPlano: "A",
			parentId: "110700",
			valorMensal: 0,
			diretoria: "Operacional",
		},
	],
	matrix: [
		{
			accountId: "1211",
			costCenterId: "110701",
			year: 2026,
			months: [0, 0, 0, 0, 0, 0, 0, 1000, 0, 0, 0, 0],
		},
	],
	settings: {
		directorates: [{ nome: "Operacional", diretor: "Diretor Op" }],
	},
	versions: [{}],
	approvals: [],
};

describe("budgetInsights", () => {
	it("builds month, year and custom budget periods", () => {
		expect(buildBudgetPeriod({ mode: "month", referenceYear: 2026, referenceMonth: 8 })).toMatchObject({
			label: "mês",
			months: [{ year: 2026, month: 8 }],
		});
		expect(buildBudgetPeriod({ mode: "year", referenceYear: 2026 }).months).toHaveLength(12);
		expect(
			buildBudgetPeriod({
				mode: "custom",
				startDate: "2026-07-01",
				endDate: "2026-08-31",
			}).months,
		).toEqual([
			{ year: 2026, month: 7 },
			{ year: 2026, month: 8 },
		]);
	});

	it("calculates budget insights with zero-safe percentages and approvals", () => {
		const insights = getBudgetInsights(config, {
			mode: "month",
			referenceYear: 2026,
			referenceMonth: 8,
		});

		expect(insights.plannedMonth).toBe(1000);
		expect(insights.realizedMonth).toBe(1200);
		expect(insights.availableMonth).toBe(-200);
		expect(insights.usedPercent).toBe(120);
		expect(insights.approvals).toHaveLength(1);
		expect(insights.accountSummary[0]).toMatchObject({
			id: "1211",
			planned: 1000,
			realized: 1200,
			percent: 120,
		});
		expect(insights.budgetCategoryGroups[0]).toMatchObject({
			id: "basal",
			label: "BASAL",
			planned: 1000,
			realized: 1200,
		});
		expect(insights.budgetCategoryGroups[0].categories[0]).toMatchObject({
			name: "Ocupação",
			planned: 1000,
			realized: 1200,
		});
		expect(insights.supplierSummary.map((item) => item.supplier)).toEqual([
			"CEMIG",
			"Fornecedor B",
		]);
	});

	it("builds operational KPI cards and current-month forecast without mutating input", () => {
		vi.setSystemTime(new Date("2026-08-15T12:00:00"));
		const insights = getBudgetInsights(config, {
			mode: "month",
			referenceYear: 2026,
			referenceMonth: 8,
		});
		const kpis = buildBudgetOperationalKpis(insights, config);
		const cards = buildCostCenterTopCards({
			insights,
			config,
			selectedPeriod: { mode: "month", referenceYear: 2026, referenceMonth: 8 },
			now: new Date("2026-08-15T12:00:00"),
		});

		expect(kpis.map((item) => item.id)).toEqual([
			"orcado",
			"realizado",
			"saldo",
			"aprovacoes",
			"ano",
			"basal",
			"nao-basal",
		]);
		expect(cards.find((item) => item.id === "cc-forecast").value).toBeCloseTo(2480);
		vi.useRealTimers();
	});

	it("groups synthetic centers, filters responsible users and paginates groups", () => {
		const insights = getBudgetInsights(config, {
			mode: "month",
			referenceYear: 2026,
			referenceMonth: 8,
		});
		const grouped = buildOperationalCenterGroups({
			config,
			insights,
			currentUser: { email: "tiago@sempre.net" },
			responsibleOnly: true,
		});
		const page = paginateBudgetGroups(grouped.operationalCenterGroups, 1, 1);

		expect(grouped.operationalCenterGroups).toHaveLength(1);
		expect(grouped.operationalCenterGroups[0].children).toHaveLength(1);
		expect(grouped.metricForCenter(config.centers[1]).realized).toBe(1200);
		expect(page.rows).toHaveLength(1);
	});

	it("builds directorates, pareto rows and helper metadata", () => {
		const insights = getBudgetInsights(config, {
			mode: "month",
			referenceYear: 2026,
			referenceMonth: 8,
		});
		const directorates = buildDirectorateRows(insights, config);

		expect(directorates[0]).toMatchObject({
			nome: "Operacional",
			diretor: "Diretor Op",
			planned: 1000,
			realized: 1200,
		});
		expect(findBudgetParetoRows(insights, 1)[0].center.id).toBe("110701");
		expect(budgetConsumptionStatus(120).label).toBe("Estourado");
		expect(budgetConsumptionStatus(80).label).toBe("Atenção");
		expect(budgetVarianceMeta(1000, 800)).toMatchObject({
			variance: 200,
			favorable: true,
		});
		expect(getConfiguredCenterBudget({ valorMensal: 300 }, { mode: "year" }, 1)).toBe(3600);
		expect(isBudgetCenterResponsible({ profile: { email: "TIAGO@SEMPRE.NET" } }, config.centers[1])).toBe(true);
		expect(movementValue({ realizado: -50 })).toBe(-50);
		expect(movementSupplierName({}, "CEMIG")).toBe("CEMIG");
	});
});
