import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const statementPath = require.resolve("./api/src/financeiroStatement.js");
const reportsRepositoryPath = require.resolve(
	"./api/src/financeiroReportsRepository.js",
);

function clearModules() {
	delete require.cache[statementPath];
	delete require.cache[reportsRepositoryPath];
}

function loadStatement(repository = {}) {
	clearModules();
	require.cache[reportsRepositoryPath] = {
		id: reportsRepositoryPath,
		filename: reportsRepositoryPath,
		loaded: true,
		exports: {
			createFakeDreLancamentos: vi.fn(),
			deleteFakeDreLancamentos: vi.fn(),
			listDreLancamentos: vi.fn(),
			replaceDreLancamentos: vi.fn(),
			...repository,
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
});
