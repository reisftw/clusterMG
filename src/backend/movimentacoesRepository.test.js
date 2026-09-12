import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/movimentacoesRepository.js");
const dbPath = require.resolve("./api/src/db.js");

function clearModules() {
	delete require.cache[repositoryPath];
	delete require.cache[dbPath];
}

function loadRepository(dbQuery) {
	clearModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query: dbQuery },
	};
	return require("./api/src/movimentacoesRepository.js");
}

describe("movimentacoesRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("marcarComoCasada grava a cidade vinda da O.S. casada", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "mov-1",
					status_match: "casada",
					os_numero: "321",
					os_collection: "match_os_abertas",
					cidade: "Belo Horizonte",
				},
			],
		}));
		const repository = loadRepository(dbQuery);

		const result = await repository.marcarComoCasada("mov-1", {
			osNumero: "321",
			osCollection: "match_os_abertas",
			cidade: "Belo Horizonte",
		});

		expect(result.cidade).toBe("Belo Horizonte");
		expect(dbQuery.mock.calls[0][1]).toEqual([
			"mov-1",
			"321",
			"match_os_abertas",
			"Belo Horizonte",
		]);
	});

	it("getRankingCidadesRetiradas agrupa por cidade dentro do periodo", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [{ cidade: "Belo Horizonte", total: 5 }],
		}));
		const repository = loadRepository(dbQuery);

		const ranking = await repository.getRankingCidadesRetiradas({
			dataInicio: "2026-01-01T00:00:00.000Z",
			dataFim: "2026-12-31T23:59:59.999Z",
		});

		expect(ranking).toEqual([{ cidade: "Belo Horizonte", total: 5 }]);
		expect(dbQuery.mock.calls[0][0]).toContain("cidade is not null");
		expect(dbQuery.mock.calls[0][0]).not.toContain("status_match = 'casada'");
	});

	it("getRankingCidadesDevolvidas so conta status_match = casada", async () => {
		const dbQuery = vi.fn(async () => ({ rows: [] }));
		const repository = loadRepository(dbQuery);

		await repository.getRankingCidadesDevolvidas({});

		expect(dbQuery.mock.calls[0][0]).toContain("status_match = 'casada'");
	});

	it("getRankingEstoquesRecebimento agrupa por estoque_destino", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [{ estoque: "Estoque Central", total: 3 }],
		}));
		const repository = loadRepository(dbQuery);

		const ranking = await repository.getRankingEstoquesRecebimento({});

		expect(ranking).toEqual([{ estoque: "Estoque Central", total: 3 }]);
		expect(dbQuery.mock.calls[0][0]).toContain("estoque_destino as estoque");
	});
});
