import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
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

	it("getRankingCidadesRetiradas agrupa por cidade dentro do periodo, paginado", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [{ total: 1 }] })
			.mockResolvedValueOnce({ rows: [{ label: "Belo Horizonte", total: 5 }] });
		const repository = loadRepository(dbQuery);

		const ranking = await repository.getRankingCidadesRetiradas({
			dataInicio: "2026-01-01T00:00:00.000Z",
			dataFim: "2026-12-31T23:59:59.999Z",
		});

		expect(ranking).toMatchObject({
			items: [{ cidade: "Belo Horizonte", total: 5 }],
			page: 1,
			total: 1,
			totalPages: 1,
		});
		// Nao filtra linha sem cidade — agrupa como "Nao identificada" (senao
		// o ranking parece "sem dados" quando a maioria ainda esta sem match).
		expect(dbQuery.mock.calls[1][0]).toContain("Não identificada");
		expect(dbQuery.mock.calls[1][0]).not.toContain("cidade is not null");
		expect(dbQuery.mock.calls[1][0]).not.toContain("status_match = 'casada'");
	});

	it("getRankingCidadesDevolvidas so conta status_match = casada", async () => {
		const dbQuery = vi.fn(async () => ({ rows: [] }));
		const repository = loadRepository(dbQuery);

		await repository.getRankingCidadesDevolvidas({});

		expect(dbQuery.mock.calls[0][0]).toContain("status_match = 'casada'");
	});

	it("getRankingEstoquesRecebimento agrupa por estoque_destino, paginado", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [{ total: 1 }] })
			.mockResolvedValueOnce({ rows: [{ label: "Estoque Central", total: 3 }] });
		const repository = loadRepository(dbQuery);

		const ranking = await repository.getRankingEstoquesRecebimento({});

		expect(ranking).toMatchObject({
			items: [{ estoque: "Estoque Central", total: 3 }],
			total: 1,
		});
		expect(dbQuery.mock.calls[1][0]).toContain("trim(estoque_destino)");
	});

	it("saveProdutoConfig grava categoria e valor do equipamento", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [{ produto_nome: "ONT GPON XX530V", categoria: "AX", valor: "349.90" }],
		}));
		const repository = loadRepository(dbQuery);

		const result = await repository.saveProdutoConfig(
			{ produtoNome: "ONT GPON XX530V", categoria: "ax", valor: "349.90" },
			{ uid: "u1" },
		);

		expect(result).toEqual({
			produto: "ONT GPON XX530V",
			categoria: "AX",
			valor: 349.9,
		});
		expect(dbQuery.mock.calls[0][1]).toEqual([
			"ONT GPON XX530V",
			"AX",
			349.9,
			"u1",
		]);
	});

	it("saveProdutoConfig rejeita categoria fora de FAST/AC/AX", async () => {
		const repository = loadRepository(vi.fn());

		await expect(
			repository.saveProdutoConfig({
				produtoNome: "ONT GPON XX530V",
				categoria: "PREMIUM",
			}),
		).rejects.toThrow(/Categoria inválida/);
	});

	it("saveProdutoConfig rejeita nome de produto vazio", async () => {
		const repository = loadRepository(vi.fn());

		await expect(
			repository.saveProdutoConfig({ produtoNome: "  ", categoria: "AX" }),
		).rejects.toThrow(/Nome do produto/);
	});

	it("getResumoCategoriaProdutos agrupa quantidade e valor total por categoria", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{ categoria: "AX", quantidade: 10, valor_total: "3499.00" },
				{ categoria: "Não definida", quantidade: 3, valor_total: "0" },
			],
		}));
		const repository = loadRepository(dbQuery);

		const resumo = await repository.getResumoCategoriaProdutos({});

		expect(resumo).toEqual([
			{ categoria: "AX", quantidade: 10, valorTotal: 3499 },
			{ categoria: "Não definida", quantidade: 3, valorTotal: 0 },
		]);
		expect(dbQuery.mock.calls[0][0]).toContain("Não definida");
		expect(dbQuery.mock.calls[0][0]).toContain("sum(coalesce(c.valor, 0))");
	});

	it("saveConfig grava backfillAnualConcluidoEm (marca a varredura do ano como ja rodada)", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [] }) // readConfig() interno ao saveConfig
			.mockResolvedValueOnce({ rows: [] }); // insert/update
		const repository = loadRepository(dbQuery);

		const next = await repository.saveConfig(
			{ backfillAnualConcluidoEm: "2026-09-12T12:00:00.000Z" },
			{ uid: "admin1" },
		);

		expect(next.backfillAnualConcluidoEm).toBe("2026-09-12T12:00:00.000Z");
		expect(dbQuery.mock.calls[1][1]).toContain("2026-09-12T12:00:00.000Z");
	});

	it("readConfig traz backfillAnualConcluidoEm nulo por padrao (nunca rodou)", async () => {
		const dbQuery = vi.fn(async () => ({ rows: [] }));
		const repository = loadRepository(dbQuery);

		const config = await repository.readConfig();

		expect(config.backfillAnualConcluidoEm).toBeNull();
	});
});
