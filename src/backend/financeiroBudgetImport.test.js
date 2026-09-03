import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("financeiro budget import config merge", () => {
	let mergeBudgetConfigFromRows;
	let mergeBudgetImportRowsReplacingIncomingPeriods;

	beforeAll(() => {
		process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
		const testables = require("../../vps/api/src/financeiro").__testables;
		mergeBudgetConfigFromRows = testables.mergeBudgetConfigFromRows;
		mergeBudgetImportRowsReplacingIncomingPeriods =
			testables.mergeBudgetImportRowsReplacingIncomingPeriods;
	}, 30000);

	it("reuses an existing cost center by code without remapping another center with the same name", () => {
		const result = mergeBudgetConfigFromRows(
			{
				centers: [
					{
						id: "110701",
						codigo: "110701",
						reduzida: "110.701",
						nome: "ROT",
						parentId: "1107",
						parentCodigo: "1107",
						tipoPlano: "A",
						nivel: 4,
						categoriaPrincipal: "Operacoes",
					},
				],
				accounts: [],
				companies: [],
				branches: [],
				partners: [],
				matrix: [],
			},
			[
				{
					codCc: "110701",
					nomeCc: "ROT",
					codConta: "1211",
					nomeConta: "Energia",
					data: "2026-08-24",
					ano: 2026,
					numMes: 8,
					realizado: 100,
					orcado: 0,
					diretoria: "Manutencao de Rede",
				},
			],
			{ uid: "test-user", email: "test@example.com" },
		);

		const rotCenters = result.config.centers.filter(
			(center) => center.nome === "ROT",
		);
		const rot110701 = result.config.centers.find(
			(center) => center.id === "110701",
		);
		const rot150302 = result.config.centers.find(
			(center) => center.id === "150302",
		);

		expect(result.created.centers).toBe(0);
		expect(rot110701).toMatchObject({
			id: "110701",
			codigo: "110701",
			parentId: "1107",
			parentCodigo: "1107",
			categoriaPrincipal: "Operacoes",
		});
		expect(rot150302).toMatchObject({
			id: "150302",
			codigo: "150302",
			parentId: "1503",
			parentCodigo: "1503",
		});
		expect(rotCenters.map((center) => center.id).sort()).toEqual([
			"110701",
			"150302",
		]);
		expect(result.config.matrix[0]).toMatchObject({
			costCenterId: "110701",
			year: 2026,
		});
		expect(result.config.matrix[0].months[7]).toBe(0);
	});

	it("preserva orçamento categorizado cadastrado ao mesclar dados importados", () => {
		const result = mergeBudgetConfigFromRows(
			{
				settings: {
					financialCategoryBudgets: [
						{
							classType: "basal",
							categoryName: "Produto",
							accountName: "Serviços Digitais",
							periodScope: "monthly_default",
							planned: 264423,
						},
					],
				},
				accounts: [],
				centers: [],
				companies: [],
				branches: [],
				partners: [],
				matrix: [],
			},
			[
				{
					codCc: "110701",
					nomeCc: "ROT",
					codConta: "1211",
					nomeConta: "Energia",
					data: "2026-08-24",
					ano: 2026,
					numMes: 8,
					realizado: 100,
					orcado: 0,
				},
			],
			{ uid: "test-user", email: "test@example.com" },
		);

		expect(result.config.settings.financialCategoryBudgets).toEqual([
			expect.objectContaining({
				classType: "basal",
				categoryName: "Produto",
				accountName: "Serviços Digitais",
				periodScope: "monthly_default",
				planned: 264423,
			}),
		]);
	});

	it("usa apenas o campo orçado da planilha na matriz, sem copiar realizado", () => {
		const result = mergeBudgetConfigFromRows(
			{
				accounts: [],
				centers: [],
				companies: [],
				branches: [],
				partners: [],
				matrix: [],
			},
			[
				{
					codCc: "110701",
					nomeCc: "ROT",
					codConta: "1211",
					nomeConta: "Energia",
					data: "2026-08-24",
					ano: 2026,
					numMes: 8,
					realizado: 180808.51,
					orcado: 0,
				},
				{
					codCc: "110701",
					nomeCc: "ROT",
					codConta: "1211",
					nomeConta: "Energia",
					data: "2026-08-25",
					ano: 2026,
					numMes: 8,
					realizado: 10,
					orcado: 50,
				},
			],
			{ uid: "test-user", email: "test@example.com" },
		);

		const importedMatrix = result.config.matrix.find(
			(item) =>
				item.accountId === "1211" &&
				item.costCenterId === "110701" &&
				item.year === 2026,
		);
		expect(importedMatrix.months[7]).toBe(50);
		expect(importedMatrix.total).toBe(50);
	});

	it("substitui o mesmo periodo importado sem apagar historico de outros meses", () => {
		const rows = mergeBudgetImportRowsReplacingIncomingPeriods(
			[
				{
					id: "antigo-agosto",
					layoutOrigem: "FPCP106",
					data: "2026-08-01",
					ano: 2026,
					numMes: 8,
					codConta: "1211",
					nomeConta: "Energia",
					codCc: "110701",
					nomeCc: "ROT",
					realizado: 100,
				},
				{
					id: "setembro",
					layoutOrigem: "FPCP106",
					data: "2026-09-01",
					ano: 2026,
					numMes: 9,
					codConta: "1211",
					nomeConta: "Energia",
					codCc: "110701",
					nomeCc: "ROT",
					realizado: 300,
				},
			],
			[
				{
					id: "novo-agosto",
					layoutOrigem: "FPCP106",
					data: "2026-08-02",
					ano: 2026,
					numMes: 8,
					codConta: "1211",
					nomeConta: "Energia",
					codCc: "110701",
					nomeCc: "ROT",
					realizado: 200,
				},
			],
		);

		expect(rows.map((row) => row.id).sort()).toEqual([
			"novo-agosto",
			"setembro",
		]);
		expect(rows.find((row) => row.id === "setembro")?.realizado).toBe(300);
		expect(rows.find((row) => row.id === "novo-agosto")?.realizado).toBe(200);
	});

	it("aplica De_Para, classificacao fora do basal e centro de projeto do Access", () => {
		const result = mergeBudgetConfigFromRows(
			{
				accounts: [],
				centers: [],
				companies: [],
				branches: [],
				partners: [],
				matrix: [],
			},
			[
				{
					codCc: "110701",
					nomeCc: "ROT",
					codConta: "2201",
					nomeConta: "Conservação e Limpeza",
					data: "2026-08-24",
					ano: 2026,
					numMes: 8,
					realizado: 100,
					orcado: 0,
				},
				{
					codCc: "110701",
					nomeCc: "ROT",
					codConta: "3101",
					nomeConta: "Consórcio",
					data: "2026-08-24",
					ano: 2026,
					numMes: 8,
					realizado: 50,
					orcado: 0,
				},
				{
					codCc: "2020121",
					nomeCc: "Projeto Seplag",
					codConta: "4101",
					nomeConta: "Equipamentos POP (Switches, OTDR, Baterias)",
					data: "2026-08-24",
					ano: 2026,
					numMes: 8,
					realizado: 70,
					orcado: 0,
				},
			],
			{ uid: "test-user", email: "test@example.com" },
		);

		expect(result.config.accounts.find((item) => item.id === "2201")).toMatchObject({
			nome: "Serviços de Conservação e Limpeza",
			categoriaMae: "Administrativo",
			categoriaClasse: "basal",
		});
		expect(result.config.accounts.find((item) => item.id === "3101")).toMatchObject({
			nome: "Consórcio",
			categoriaMae: "Financeiro",
			categoriaClasse: "nao_basal",
		});
		expect(result.config.centers.find((item) => item.id === "2020121")).toMatchObject({
			nome: "Projeto Seplag",
			quebra2: "PROJETO",
			statusProjetos: "Em andamento / A Iniciar",
		});
	});
});
