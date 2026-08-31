import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const statementPath = require.resolve("./api/src/financeiroStatement.js");
const reportsRepositoryPath = require.resolve(
	"./api/src/financeiroReportsRepository.js",
);
const budgetRepositoryPath = require.resolve(
	"./api/src/financeiroBudgetConfigRepository.js",
);

function clearModules() {
	delete require.cache[statementPath];
	delete require.cache[reportsRepositoryPath];
	delete require.cache[budgetRepositoryPath];
}

function loadStatement(reportsRepository = {}, budgetRepository = {}) {
	clearModules();
	require.cache[reportsRepositoryPath] = {
		id: reportsRepositoryPath,
		filename: reportsRepositoryPath,
		loaded: true,
		exports: {
			createFakeDreLancamentos: vi.fn(),
			deleteFakeDreLancamentos: vi.fn(),
			clearSerasaFinancialReport: vi.fn(),
			clearTariffsFinancialReport: vi.fn(),
			getSerasaFinancialReport: vi.fn(),
			getTariffsFinancialReport: vi.fn(),
			listDreLancamentos: vi.fn(),
			replaceDreLancamentos: vi.fn(),
			saveSerasaFinancialReport: vi.fn(),
			saveTariffsFinancialReport: vi.fn(),
			...reportsRepository,
		},
	};
	require.cache[budgetRepositoryPath] = {
		id: budgetRepositoryPath,
		filename: budgetRepositoryPath,
		loaded: true,
		exports: {
			getBudgetCostCenters: vi.fn(),
			getBudgetData: vi.fn(),
			saveBudgetCostCenters: vi.fn(),
			saveBudgetData: vi.fn(),
			...budgetRepository,
		},
	};
	return require("./api/src/financeiroStatement.js");
}

describe("financeiroStatement", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("normaliza filtros e monta chave de cache da DRE", () => {
		const statement = loadStatement();

		expect(
			statement.normalizeStatementFilters({
				year: "2026",
				month: "8",
				fake: "true",
			}),
		).toEqual({ ano: "2026", mes: "8", isFake: true });
		expect(
			statement.buildDreStatementCacheKey({
				ano: 2026,
				mes: 8,
				isFake: false,
			}),
		).toBe("dre:2026:8:");
	});

	it("delega leitura e mutacoes da DRE para o repositorio normalizado", async () => {
		const repository = {
			createFakeDreLancamentos: vi.fn(async () => ({ ok: true })),
			deleteFakeDreLancamentos: vi.fn(async () => ({ deletedRows: 3 })),
			listDreLancamentos: vi.fn(async () => ({ rows: [] })),
			replaceDreLancamentos: vi.fn(async () => ({ importedRows: 2 })),
		};
		const statement = loadStatement(repository);

		await statement.getDreStatement({ ano: 2026, mes: 8, isFake: "1" });
		await statement.saveDreStatement({ rows: [{ id: "row-1" }] }, { uid: "u1" });
		await statement.createFakeDreData({ uid: "u1" });
		await statement.deleteFakeDreData({ uid: "u1" });

		expect(repository.listDreLancamentos).toHaveBeenCalledWith({
			ano: 2026,
			mes: 8,
			isFake: true,
		});
		expect(repository.replaceDreLancamentos).toHaveBeenCalledWith(
			{ rows: [{ id: "row-1" }] },
			{ uid: "u1" },
		);
		expect(repository.createFakeDreLancamentos).toHaveBeenCalledWith({
			uid: "u1",
		});
		expect(repository.deleteFakeDreLancamentos).toHaveBeenCalledWith({
			uid: "u1",
		});
	});

	it("delega Serasa e Tarifas para o repositorio de reports", async () => {
		const repository = {
			clearSerasaFinancialReport: vi.fn(async () => ({ ok: true })),
			clearTariffsFinancialReport: vi.fn(async () => ({ ok: true })),
			getSerasaFinancialReport: vi.fn(async () => ({ rows: [] })),
			getTariffsFinancialReport: vi.fn(async () => ({ faturas: [] })),
			saveSerasaFinancialReport: vi.fn(async () => ({ ok: true })),
			saveTariffsFinancialReport: vi.fn(async () => ({ ok: true })),
		};
		const statement = loadStatement(repository);

		await statement.getSerasaStatement();
		await statement.saveSerasaStatement({ rows: [{ id: "serasa-1" }] });
		await statement.clearSerasaStatement({ rows: [] });
		await statement.getTariffsStatement();
		await statement.saveTariffsStatement({ faturas: [{ id: "fat-1" }] });
		await statement.clearTariffsStatement({ faturas: [] });

		expect(repository.getSerasaFinancialReport).toHaveBeenCalled();
		expect(repository.saveSerasaFinancialReport).toHaveBeenCalledWith({
			rows: [{ id: "serasa-1" }],
		});
		expect(repository.clearSerasaFinancialReport).toHaveBeenCalledWith({
			rows: [],
		});
		expect(repository.getTariffsFinancialReport).toHaveBeenCalled();
		expect(repository.saveTariffsFinancialReport).toHaveBeenCalledWith({
			faturas: [{ id: "fat-1" }],
		});
		expect(repository.clearTariffsFinancialReport).toHaveBeenCalledWith({
			faturas: [],
		});
	});

	it("delega orcamento/config para o repositorio de budget", async () => {
		const repository = {
			getBudgetCostCenters: vi.fn(async () => ({ centers: [] })),
			getBudgetData: vi.fn(async () => ({ rows: [] })),
			saveBudgetCostCenters: vi.fn(async () => ({ ok: true })),
			saveBudgetData: vi.fn(async () => ({ ok: true })),
		};
		const statement = loadStatement({}, repository);

		await statement.getBudgetConfigurationStatement();
		await statement.saveBudgetConfigurationStatement({ centers: [] }, { uid: "u1" });
		await statement.getBudgetDataStatement();
		await statement.saveBudgetDataStatement({ rows: [] }, { uid: "u1" });

		expect(repository.getBudgetCostCenters).toHaveBeenCalled();
		expect(repository.saveBudgetCostCenters).toHaveBeenCalledWith(
			{ centers: [] },
			{ uid: "u1" },
		);
		expect(repository.getBudgetData).toHaveBeenCalled();
		expect(repository.saveBudgetData).toHaveBeenCalledWith(
			{ rows: [] },
			{ uid: "u1" },
		);
	});
});
