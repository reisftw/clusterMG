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

	it("normaliza MAC na gravacao (Fase E — docs/TECHNICAL-AUDIT.md, achado #2)", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [
					{
						id: "ordens_abertas:onnet:790",
						source_collection: "ordens_abertas",
						source: "onnet",
						num_os: "790",
						legacy_path: "ordens_abertas/790",
						legacy_document_id: "790",
						source_payload: { num_os: "790", fonte: "onnet" },
					},
				],
			});
		const repository = loadRepository(dbQuery);

		await repository.upsertDocument({
			path: "ordens_abertas/790",
			collectionPath: "ordens_abertas",
			documentId: "790",
			data: {
				num_os: "790",
				fonte: "onnet",
				mac_addr: "aa:bb:cc:dd:ee:ff",
				phy_addr: "AABBCCDDEEFF", // mesmo MAC, formato diferente — deve deduplicar
			},
		});

		const insertParams = dbQuery.mock.calls[0][1];
		// macs_equipamento e o parametro na posicao 27 (indice 26) da query
		// (ver `insert into ordens_servico`, coluna macs_equipamento).
		const macsEquipamentoParam = JSON.parse(insertParams[26]);
		expect(macsEquipamentoParam).toEqual(["AABBCCDDEEFF"]);
	});

	it("descarta MAC invalido (nao vira 12 hex) em vez de gravar lixo", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [
					{
						id: "ordens_abertas:onnet:791",
						source_collection: "ordens_abertas",
						source: "onnet",
						num_os: "791",
						legacy_path: "ordens_abertas/791",
						legacy_document_id: "791",
						source_payload: { num_os: "791", fonte: "onnet" },
					},
				],
			});
		const repository = loadRepository(dbQuery);

		await repository.upsertDocument({
			path: "ordens_abertas/791",
			collectionPath: "ordens_abertas",
			documentId: "791",
			data: { num_os: "791", fonte: "onnet", mac_addr: "nao e um mac" },
		});

		const insertParams = dbQuery.mock.calls[0][1];
		const macsEquipamentoParam = JSON.parse(insertParams[26]);
		expect(macsEquipamentoParam).toEqual([]);
	});

	it("remove ordens por fonte para importacao incremental", async () => {
		const dbQuery = vi.fn(async () => ({ rowCount: 12, rows: [] }));
		const repository = loadRepository(dbQuery);

		const deleted = await repository.deleteDocumentsByCollectionAndSources(
			"match_os_abertas",
			["sempre", "onnet"],
		);

		expect(deleted).toBe(12);
		expect(dbQuery.mock.calls[0][0]).toContain("delete from ordens_servico");
		expect(dbQuery.mock.calls[0][0]).toContain("source = any($2::text[])");
		expect(dbQuery.mock.calls[0][0]).toContain("source_payload->>'fonte'");
		expect(dbQuery.mock.calls[0][1]).toEqual([
			"match_os_abertas",
			["sempre", "onnet"],
			true,
			true,
		]);
	});

	it("busca snapshot publico somente pelo legacy_path exato", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "public_dashboard:match_os",
					source_collection: "public_dashboard",
					tipo: "public_dashboard",
					legacy_path: "public_dashboard/match_os",
					legacy_document_id: "match_os",
					payload: {
						meta: { data: "2026-08-31T10:00:00.000Z" },
					},
					source_payload: {
						meta: { data: "2026-08-31T10:00:00.000Z" },
					},
				},
			],
		}));
		const repository = loadRepository(dbQuery);

		const snapshot = await repository.getDocument("public_dashboard/match_os");

		expect(snapshot.data.meta.data).toBe("2026-08-31T10:00:00.000Z");
		expect(dbQuery).toHaveBeenCalledTimes(1);
		expect(dbQuery.mock.calls[0][0]).toContain("legacy_path = $2");
		expect(dbQuery.mock.calls[0][0]).not.toContain("legacy_document_id = $3");
		expect(dbQuery.mock.calls[0][1]).toEqual([
			"public_dashboard",
			"public_dashboard/match_os",
		]);
	});
});
