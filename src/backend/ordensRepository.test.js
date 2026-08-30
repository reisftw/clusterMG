import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/ordensRepository.js");
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
	return require("./api/src/ordensRepository.js");
}

describe("ordensRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("lista ordens mantendo o contrato de app_documents", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "ordens_abertas:sempre:123",
					source_collection: "ordens_abertas",
					source: "sempre",
					num_os: "123",
					legacy_path: "ordens_abertas/123",
					legacy_document_id: "123",
					codigo_cliente: "456",
					nome_cliente: "Cliente Teste",
					cidade: "Belo Horizonte",
					regional: "METROPOLITANA",
					status: "Pendente",
					latitude: "-19.9",
					longitude: "-44.0",
					telefones: ["31999999999"],
					macs_equipamento: ["AA"],
					source_payload: { numero_plano: "1" },
				},
			],
		}));
		const repository = loadRepository(dbQuery);

		const rows = await repository.listAllDocuments("ordens_abertas");

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			path: "ordens_abertas/123",
			collectionPath: "ordens_abertas",
			documentId: "123",
			data: {
				num_os: "123",
				codigo_cliente: "456",
				nome_cliente: "Cliente Teste",
				cidade: "Belo Horizonte",
				regional: "METROPOLITANA",
				status: "Pendente",
				fonte: "sempre",
				numero_plano: "1",
			},
		});
		expect(rows[0].data.latitude).toBe(-19.9);
		expect(dbQuery.mock.calls[0][0]).toContain("from ordens_servico");
	});

	it("grava ordem na tabela normalizada", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [
					{
						id: "ordens_abertas:onnet:789",
						source_collection: "ordens_abertas",
						source: "onnet",
						num_os: "789",
						legacy_path: "ordens_abertas/789",
						legacy_document_id: "789",
						nome_cliente: "Cliente Onnet",
						source_payload: { num_os: "789", fonte: "onnet" },
					},
				],
			});
		const repository = loadRepository(dbQuery);

		const saved = await repository.upsertDocument({
			path: "ordens_abertas/789",
			collectionPath: "ordens_abertas",
			documentId: "789",
			data: { num_os: "789", fonte: "onnet", nome_cliente: "Cliente Onnet" },
		});

		expect(dbQuery.mock.calls[0][0]).toContain("insert into ordens_servico");
		expect(saved.documentId).toBe("789");
		expect(saved.data.fonte).toBe("onnet");
	});

	it("remove ordens por fonte para importacao incremental", async () => {
		const dbQuery = vi.fn(async () => ({ rowCount: 12, rows: [] }));
		const repository = loadRepository(dbQuery);

		const deleted = await repository.deleteDocumentsByCollectionAndSources(
			"match_os_abertas",
			["sempre", "onnet"],
		);

		expect(deleted).toBe(12);
		expect(dbQuery).toHaveBeenCalledWith(
			"delete from ordens_servico where source_collection = $1 and source = any($2::text[])",
			["match_os_abertas", ["sempre", "onnet"]],
		);
	});
});
