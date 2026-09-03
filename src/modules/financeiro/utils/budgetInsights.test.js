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

	it("builds operational KPI cards and category budget cards without mutating input", () => {
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
			"projetos",
		]);
		expect(cards.map((item) => item.id)).toEqual([
			"cc-basal",
			"cc-nao-basal",
			"cc-projetos",
			"cc-alertas",
		]);
		expect(cards.find((item) => item.id === "cc-basal")).toMatchObject({
			title: "Orçamento BASAL",
			value: 1000,
		});
		expect(cards.find((item) => item.id === "cc-basal")?.helper).toContain(
			"Saldo disponível:",
		);
		expect(cards.find((item) => item.id === "cc-basal")?.helper).toContain(
			"Realizado + comprometido:",
		);
		expect(cards.find((item) => item.id === "cc-nao-basal")).toMatchObject({
			title: "Orçamento NÃO BASAL",
			value: 0,
		});
		expect(cards.find((item) => item.id === "cc-projetos")).toMatchObject({
			title: "Orçamento PROJETOS",
			value: 0,
		});
		vi.useRealTimers();
	});

	it("separa centros de custo de projeto da base basal", () => {
		const insights = getBudgetInsights(
			{
				...config,
				centers: [
					...config.centers,
					{
						id: "220001",
						codigo: "220001",
						nome: "Fase 1 HPs 2026",
						tipoPlano: "A",
						valorMensal: 0,
						realizedByCompanyBranch: [
							{
								year: 2026,
								month: 8,
								accountId: "1211",
								realized: 5000,
							},
						],
					},
				],
				matrix: [
					...config.matrix,
					{
						accountId: "1211",
						costCenterId: "220001",
						year: 2026,
						months: [0, 0, 0, 0, 0, 0, 0, 460000, 0, 0, 0, 0],
					},
				],
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);
		const projectGroup = insights.budgetCategoryGroups.find(
			(item) => item.id === "projetos",
		);

		expect(projectGroup).toMatchObject({
			label: "PROJETOS",
			planned: 460000,
			realized: 5000,
		});
		expect(projectGroup.categories[0]).toMatchObject({
			name: "Fase 1 HPs 2026",
			planned: 460000,
			realized: 5000,
		});
	});

	it("filtra realizado basal e nao basal pelo grupo Sempre e mantem projetos", () => {
		const insights = getBudgetInsights(
			{
				...config,
				accounts: [
					{ id: "basal", codigo: "basal", nome: "Serviços Digitais" },
					{
						id: "nao-basal",
						codigo: "nao-basal",
						nome: "Consórcio",
						categoriaClasse: "nao_basal",
						categoriaMae: "Financeiro",
					},
					{ id: "projeto", codigo: "projeto", nome: "Equipamentos POP" },
				],
				centers: [
					{
						id: "basal-center",
						nome: "Basal",
						realizedByCompanyBranch: [
							{ year: 2026, month: 8, accountId: "basal", realized: 100, grupo: "Sempre", quebra2: "ORÇAMENTO" },
							{ year: 2026, month: 8, accountId: "basal", realized: 200, grupo: "Onnet", quebra2: "ORÇAMENTO" },
						],
					},
					{
						id: "nao-basal-center",
						nome: "Nao basal",
						realizedByCompanyBranch: [
							{ year: 2026, month: 8, accountId: "nao-basal", realized: 300, grupo: "Sempre", quebra2: "ACOMPANHAR" },
							{ year: 2026, month: 8, accountId: "nao-basal", realized: 400, grupo: "Onnet", quebra2: "ACOMPANHAR" },
						],
					},
					{
						id: "project-center",
						nome: "Projeto Seplag",
						quebra2: "PROJETO",
						realizedByCompanyBranch: [
							{ year: 2026, month: 7, accountId: "projeto", realized: 250, grupo: "Sempre", quebra2: "PROJETO" },
							{ year: 2026, month: 8, accountId: "projeto", realized: 500, grupo: "Onnet", quebra2: "PROJETO" },
						],
					},
				],
				matrix: [
					{
						accountId: "basal",
						costCenterId: "basal-center",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
					{
						accountId: "nao-basal",
						costCenterId: "nao-basal-center",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
					{
						accountId: "projeto",
						costCenterId: "project-center",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
				],
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);

		expect(insights.budgetCategoryGroups.find((item) => item.id === "basal").realized).toBe(100);
		expect(insights.budgetCategoryGroups.find((item) => item.id === "nao_basal").realized).toBe(300);
		expect(insights.budgetCategoryGroups.find((item) => item.id === "projetos").realized).toBe(750);
		expect(insights.monthlyEvolution.find((item) => item.month === 8)).toMatchObject({
			realized: 1150,
		});
	});

	it("nao duplica realizado do centro em contas sem lancamento no periodo", () => {
		const insights = getBudgetInsights(
			{
				accounts: [
					{ id: "energia", codigo: "energia", nome: "Energia Elétrica (Lojas, Escritorios)" },
					{ id: "aluguel", codigo: "aluguel", nome: "Aluguel" },
				],
				centers: [
					{
						id: "centro-1",
						nome: "Centro financeiro",
						tipoPlano: "A",
						realizedByCompanyBranch: [
							{
								year: 2026,
								month: 8,
								accountId: "energia",
								realized: 1000,
								grupo: "Sempre",
								quebra2: "ORÇAMENTO",
							},
						],
					},
				],
				matrix: [
					{
						accountId: "energia",
						costCenterId: "centro-1",
						year: 2026,
						months: Array.from({ length: 12 }, (_, index) => index === 7 ? 500 : 0),
					},
					{
						accountId: "energia",
						costCenterId: "centro-1",
						year: 2027,
						months: Array.from({ length: 12 }, () => 0),
					},
					{
						accountId: "aluguel",
						costCenterId: "centro-1",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
				],
				settings: {},
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);
		const rowsByAccount = new Map(
			insights.accountRows.map((row) => [row.row.accountId, row]),
		);

		expect(rowsByAccount.get("energia").realized).toBe(1000);
		expect(rowsByAccount.get("aluguel")).toBeUndefined();
		expect(insights.budgetCategoryGroups.find((item) => item.id === "basal").realized).toBe(1000);
	});

	it("classifica realizado pela quebra e categoria do lancamento importado", () => {
		const insights = getBudgetInsights(
			{
				accounts: [
					{
						id: "conta-compartilhada",
						codigo: "999",
						nome: "Conta compartilhada",
						categoriaClasse: "basal",
						categoriaMae: "Produto",
					},
				],
				centers: [
					{
						id: "centro-basal",
						nome: "Centro basal",
						tipoPlano: "A",
						realizedByCompanyBranch: [
							{
								year: 2026,
								month: 8,
								accountId: "conta-compartilhada",
								realized: 100,
								grupo: "Sempre",
								quebra2: "ORÇAMENTO",
								categoria: "Produto",
							},
						],
					},
					{
						id: "centro-nao-basal",
						nome: "Centro nao basal",
						tipoPlano: "A",
						realizedByCompanyBranch: [
							{
								year: 2026,
								month: 8,
								accountId: "conta-compartilhada",
								realized: 300,
								grupo: "Sempre",
								quebra2: "ACOMPANHAR",
								categoria: "Financeiro",
							},
						],
					},
				],
				matrix: [
					{
						accountId: "conta-compartilhada",
						costCenterId: "centro-basal",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
					{
						accountId: "conta-compartilhada",
						costCenterId: "centro-nao-basal",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
				],
				settings: {},
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);

		const basalGroup = insights.budgetCategoryGroups.find((item) => item.id === "basal");
		const nonBasalGroup = insights.budgetCategoryGroups.find((item) => item.id === "nao_basal");

		expect(basalGroup.realized).toBe(100);
		expect(basalGroup.categories[0]).toMatchObject({
			name: "Produto",
			realized: 100,
		});
		expect(nonBasalGroup.realized).toBe(300);
		expect(nonBasalGroup.categories[0]).toMatchObject({
			name: "Financeiro",
			realized: 300,
		});
	});

	it("prioriza a quebra do lancamento sobre sinais de projeto no centro", () => {
		const insights = getBudgetInsights(
			{
				accounts: [
					{ id: "aluguel-postes", codigo: "aluguel-postes", nome: "Aluguel Postes" },
				],
				centers: [
					{
						id: "centro-expansao",
						nome: "Expansão de Rede 2025",
						tipoPlano: "A",
						realizedByCompanyBranch: [
							{
								year: 2026,
								month: 8,
								accountId: "aluguel-postes",
								realized: 795021.81,
								grupo: "Sempre",
								quebra2: "ORÇAMENTO",
								categoria: "Transmissão",
							},
						],
					},
				],
				matrix: [
					{
						accountId: "aluguel-postes",
						costCenterId: "centro-expansao",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
				],
				settings: {},
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);

		const basalGroup = insights.budgetCategoryGroups.find((item) => item.id === "basal");
		const projectGroup = insights.budgetCategoryGroups.find((item) => item.id === "projetos");

		expect(basalGroup.realized).toBe(795021.81);
		expect(basalGroup.categories[0]).toMatchObject({
			name: "Transmissão",
			realized: 795021.81,
		});
		expect(projectGroup.realized).toBe(0);
	});

	it("inclui realizado importado sem linha correspondente na matriz", () => {
		const insights = getBudgetInsights(
			{
				accounts: [
					{ id: "tarifas", codigo: "tarifas", nome: "Tarifas Boletos" },
				],
				centers: [
					{
						id: "centro-sem-matriz",
						nome: "Centro sem matriz",
						tipoPlano: "A",
						realizedByCompanyBranch: [
							{
								year: 2026,
								month: 8,
								accountId: "tarifas",
								realized: 137894.28,
								grupo: "Sempre",
								quebra2: "ORÇAMENTO",
								categoria: "Financeiro",
							},
						],
					},
				],
				matrix: [],
				settings: {},
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);

		const basalGroup = insights.budgetCategoryGroups.find((item) => item.id === "basal");

		expect(basalGroup.realized).toBe(137894.28);
		expect(basalGroup.categories[0]).toMatchObject({
			name: "Financeiro",
			realized: 137894.28,
		});
	});

	it("aplica orcamento oficial de projetos por vigencia", () => {
		const configWithProjectBudgets = {
			...config,
			settings: {
				...config.settings,
				financialCategoryBudgets: [
					{
						classType: "projetos",
						categoryName: "Projeto Seplag",
						accountName: "Orçamento do projeto",
						periodScope: "project_range",
						startYear: 2026,
						startMonth: 8,
						planned: 460000,
					},
					{
						classType: "projetos",
						categoryName: "Fase 1 HPs 2026",
						accountName: "Orçamento do projeto",
						periodScope: "project_range",
						startYear: 2026,
						startMonth: 8,
						planned: 1200000,
					},
					{
						classType: "projetos",
						categoryName: "Construção de Novas Portas 2026",
						accountName: "Orçamento do projeto",
						periodScope: "project_range",
						startYear: 2026,
						startMonth: 8,
						planned: 2400000,
					},
				],
			},
		};
		const insights = getBudgetInsights(
			configWithProjectBudgets,
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);
		const projectGroup = insights.budgetCategoryGroups.find(
			(item) => item.id === "projetos",
		);
		const septemberInsights = getBudgetInsights(
			configWithProjectBudgets,
			{ mode: "month", referenceYear: 2026, referenceMonth: 9 },
		);
		const septemberProjectGroup = septemberInsights.budgetCategoryGroups.find(
			(item) => item.id === "projetos",
		);
		const julyInsights = getBudgetInsights(
			configWithProjectBudgets,
			{ mode: "month", referenceYear: 2026, referenceMonth: 7 },
		);
		const julyProjectGroup = julyInsights.budgetCategoryGroups.find(
			(item) => item.id === "projetos",
		);

		expect(projectGroup.planned).toBe(4060000);
		expect(projectGroup.categories.map((item) => item.name)).toEqual(
			expect.arrayContaining([
				"Projeto Seplag",
				"Fase 1 HPs 2026",
				"Construção de Novas Portas 2026",
			]),
		);
		expect(septemberProjectGroup.planned).toBe(4060000);
		expect(julyProjectGroup.planned).toBe(0);
	});

	it("prioriza orçamento mensal cadastrado por categoria financeira", () => {
		const insights = getBudgetInsights(
			{
				...config,
				settings: {
					...config.settings,
					financialCategoryBudgets: [
						{
							classType: "basal",
							categoryName: "Produto",
							accountName: "Serviços Digitais",
							year: 2026,
							month: 8,
							planned: 264423,
						},
					],
				},
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);
		const basalGroup = insights.budgetCategoryGroups.find(
			(item) => item.id === "basal",
		);
		const produto = basalGroup.categories.find((item) => item.name === "Produto");

		expect(insights.plannedMonth).toBe(264423);
		expect(produto).toMatchObject({
			planned: 264423,
		});
		expect(produto.accounts[0]).toMatchObject({
			planned: 264423,
		});
	});

	it("consolida orçamento oficial e realizado importado no mesmo card de conta", () => {
		const insights = getBudgetInsights(
			{
				accounts: [
					{
						id: "1343",
						codigo: "1343",
						nome: "Empréstimos bancários",
						categoriaMae: "Financeiro",
						categoriaClasse: "nao_basal",
					},
				],
				centers: [
					{
						id: "110602",
						codigo: "110602",
						nome: "Financeiro",
						tipoPlano: "A",
						responsavel: "VICTOR HUGO",
						realizedByCompanyBranch: [
							{
								year: 2026,
								month: 8,
								accountId: "1343",
								realized: 1722527.62,
								grupo: "Sempre",
								quebra2: "ACOMPANHAR",
								categoria: "Financeiro",
							},
						],
					},
				],
				matrix: [
					{
						accountId: "1343",
						costCenterId: "110602",
						year: 2026,
						months: Array.from({ length: 12 }, () => 0),
					},
				],
				settings: {
					financialCategoryBudgets: [
						{
							classType: "nao_basal",
							categoryName: "Financeiro",
							accountName: "Empréstimos bancários",
							periodScope: "monthly_default",
							planned: 1600000,
						},
					],
				},
			},
			{ mode: "month", referenceYear: 2026, referenceMonth: 8 },
		);
		const nonBasalGroup = insights.budgetCategoryGroups.find(
			(item) => item.id === "nao_basal",
		);
		const financeiro = nonBasalGroup.categories.find(
			(item) => item.name === "Financeiro",
		);

		expect(financeiro.accounts).toHaveLength(1);
		expect(financeiro.accounts[0]).toMatchObject({
			id: "1343",
			planned: 1600000,
			realized: 1722527.62,
		});
	});

	it("usa orçamento categorizado padrão mensal sem duplicar mês específico", () => {
		const configWithBudgets = {
			...config,
			settings: {
				...config.settings,
				financialCategoryBudgets: [
					{
						classType: "basal",
						categoryName: "Produto",
						accountName: "Serviços Digitais",
						periodScope: "monthly_default",
						planned: 264423,
					},
					{
						classType: "basal",
						categoryName: "Produto",
						accountName: "Serviços Digitais",
						year: 2026,
						month: 8,
						planned: 264423,
					},
				],
			},
		};

		const august = getBudgetInsights(configWithBudgets, {
			mode: "month",
			referenceYear: 2026,
			referenceMonth: 8,
		});
		const september = getBudgetInsights(configWithBudgets, {
			mode: "month",
			referenceYear: 2026,
			referenceMonth: 9,
		});
		const year = getBudgetInsights(configWithBudgets, {
			mode: "year",
			referenceYear: 2026,
		});

		expect(august.plannedMonth).toBe(264423);
		expect(september.plannedMonth).toBe(264423);
		expect(year.plannedYear).toBe(264423 * 12);
	});

	it("calcula orçamento não basal oficial por categoria", () => {
		const configWithBudgets = {
			...config,
			settings: {
				...config.settings,
				financialCategoryBudgets: [
					{
						classType: "nao_basal",
						categoryName: "Aquisições",
						accountName: "Veículos",
						periodScope: "monthly_default",
						planned: 34000,
					},
					{
						classType: "nao_basal",
						categoryName: "Financeiro",
						accountName: "Consórcio",
						periodScope: "monthly_default",
						planned: 33000,
					},
					{
						classType: "nao_basal",
						categoryName: "Financeiro",
						accountName: "Empréstimos bancários",
						periodScope: "monthly_default",
						planned: 1600000,
					},
					{
						classType: "nao_basal",
						categoryName: "Financeiro",
						accountName: "Empréstimos c/ partes relacionadas",
						periodScope: "monthly_default",
						planned: 0,
					},
					{
						classType: "nao_basal",
						categoryName: "Impostos Parcelamento",
						accountName: "COFINS parcelamento",
						periodScope: "monthly_default",
						planned: 9000,
					},
					{
						classType: "nao_basal",
						categoryName: "Impostos Parcelamento",
						accountName: "CSLL parcelamento",
						periodScope: "monthly_default",
						planned: 12500,
					},
					{
						classType: "nao_basal",
						categoryName: "Impostos Parcelamento",
						accountName: "ICMS parcelamento",
						periodScope: "monthly_default",
						planned: 12000,
					},
					{
						classType: "nao_basal",
						categoryName: "Impostos Parcelamento",
						accountName: "IRPJ parcelamento",
						periodScope: "monthly_default",
						planned: 51000,
					},
					{
						classType: "nao_basal",
						categoryName: "Impostos Parcelamento",
						accountName: "PIS parcelamento",
						periodScope: "monthly_default",
						planned: 2000,
					},
				],
			},
		};

		const insights = getBudgetInsights(configWithBudgets, {
			mode: "month",
			referenceYear: 2026,
			referenceMonth: 8,
		});
		const nonBasalGroup = insights.budgetCategoryGroups.find(
			(item) => item.id === "nao_basal",
		);
		const financeiro = nonBasalGroup.categories.find(
			(item) => item.name === "Financeiro",
		);
		const parcelamento = nonBasalGroup.categories.find(
			(item) => item.name === "Impostos Parcelamento",
		);

		expect(nonBasalGroup.planned).toBe(1753500);
		expect(financeiro.planned).toBe(1633000);
		expect(parcelamento.planned).toBe(86500);
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
