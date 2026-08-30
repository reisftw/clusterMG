import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/imoveisRepository.js");
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
	return require("./api/src/imoveisRepository.js");
}

describe("imoveisRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("lista imoveis mantendo o contrato de app_documents", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "senior-1",
					senior_id: "senior-1",
					legacy_path: "imoveis_administrativos/senior-1",
					legacy_document_id: "senior-1",
					nome: "Loja Centro",
					base: "SEMPRE",
					ativo: true,
					cidade: "Belo Horizonte",
					tipo_contrato: "alugado",
					valor_aluguel: "1250.50",
					created_at: "2026-08-30T10:00:00.000Z",
					updated_at: "2026-08-30T11:00:00.000Z",
					source_payload: { classificacao: "LOJA" },
				},
			],
		}));
		const repository = loadRepository(dbQuery);

		const rows = await repository.listAllDocuments("imoveis_administrativos");

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			path: "imoveis_administrativos/senior-1",
			collectionPath: "imoveis_administrativos",
			documentId: "senior-1",
			data: {
				id: "senior-1",
				seniorId: "senior-1",
				nome: "Loja Centro",
				base: "SEMPRE",
				ativo: true,
				cidade: "Belo Horizonte",
				tipoContrato: "alugado",
				valorAluguel: 1250.5,
				classificacao: "LOJA",
			},
		});
		expect(dbQuery.mock.calls[0][0]).toContain("from imoveis");
	});

	it("grava imovel na tabela normalizada e retorna o registro salvo", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [
					{
						id: "senior-2",
						senior_id: "senior-2",
						legacy_path: "imoveis_administrativos/senior-2",
						legacy_document_id: "senior-2",
						nome: "Site Norte",
						tipo_contrato: "proprio",
						valor_aluguel: "0",
						source_payload: { seniorId: "senior-2", nome: "Site Norte" },
					},
				],
			});
		const repository = loadRepository(dbQuery);

		const saved = await repository.upsertDocument({
			path: "imoveis_administrativos/senior-2",
			collectionPath: "imoveis_administrativos",
			documentId: "senior-2",
			parentPath: null,
			data: {
				seniorId: "senior-2",
				nome: "Site Norte",
				tipoContrato: "proprio",
			},
		});

		expect(dbQuery.mock.calls[0][0]).toContain("insert into imoveis");
		expect(saved.documentId).toBe("senior-2");
		expect(saved.data.nome).toBe("Site Norte");
	});

	it("grava eventos financeiros separados por collection original", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [
					{
						id: "iptu-1",
						source_collection: "imoveis_administrativos_iptu",
						legacy_path: "imoveis_administrativos_iptu/iptu-1",
						legacy_document_id: "iptu-1",
						imovel_id: "senior-1",
						tipo: "iptu",
						ano: 2026,
						mes: 8,
						valor: "100.25",
						source_payload: { imovelId: "senior-1", valor: 100.25 },
					},
				],
			});
		const repository = loadRepository(dbQuery);

		const saved = await repository.upsertDocument({
			path: "imoveis_administrativos_iptu/iptu-1",
			collectionPath: "imoveis_administrativos_iptu",
			documentId: "iptu-1",
			data: { imovelId: "senior-1", ano: "2026", mes: "8", valor: 100.25 },
		});

		expect(dbQuery.mock.calls[0][0]).toContain(
			"insert into imoveis_eventos_financeiros",
		);
		expect(saved.collectionPath).toBe("imoveis_administrativos_iptu");
		expect(saved.data.valor).toBe(100.25);
	});
});
