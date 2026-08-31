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

	it("salva imovel pela interface de dominio", async () => {
		const dbQuery = vi.fn(async (sql) => {
			if (String(sql).includes("select * from imoveis")) {
				return {
					rows: [
						{
							id: "senior-domain",
							senior_id: "senior-domain",
							legacy_path: "imoveis_administrativos/senior-domain",
							legacy_document_id: "senior-domain",
							nome: "Loja Dominio",
							source_payload: {
								seniorId: "senior-domain",
								nome: "Loja Dominio",
							},
						},
					],
				};
			}
			return { rows: [] };
		});
		const repository = loadRepository(dbQuery);

		const saved = await repository.saveImovel({
			seniorId: "senior-domain",
			nome: "Loja Dominio",
		});

		expect(dbQuery.mock.calls[0][0]).toContain("insert into imoveis");
		expect(saved).toMatchObject({
			id: "senior-domain",
			seniorId: "senior-domain",
			nome: "Loja Dominio",
		});
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

	it("registra reajuste pela interface de dominio", async () => {
		const dbQuery = vi.fn(async (sql) => {
			if (String(sql).includes("select * from imoveis_eventos_financeiros")) {
				return {
					rows: [
						{
							id: "reajuste-1",
							source_collection: "imoveis_administrativos_reajustes",
							legacy_path: "imoveis_administrativos_reajustes/reajuste-1",
							legacy_document_id: "reajuste-1",
							imovel_id: "senior-1",
							tipo: "reajuste",
							valor_anterior: "1000",
							valor_novo: "1200",
							source_payload: {
								id: "reajuste-1",
								imovelId: "senior-1",
							},
						},
					],
				};
			}
			return { rows: [] };
		});
		const repository = loadRepository(dbQuery);

		const saved = await repository.addReajuste("senior-1", {
			id: "reajuste-1",
			valorAnterior: 1000,
			valorNovo: 1200,
		});

		expect(dbQuery.mock.calls[0][0]).toContain(
			"insert into imoveis_eventos_financeiros",
		);
		expect(saved).toMatchObject({
			id: "reajuste-1",
			imovelId: "senior-1",
			valorNovo: 1200,
		});
	});

	it("lista contratos pela interface de dominio", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "contrato-1",
					source_collection: "imoveis_administrativos_contratos",
					legacy_path: "imoveis_administrativos_contratos/contrato-1",
					legacy_document_id: "contrato-1",
					imovel_id: "senior-1",
					tipo: "link",
					nome: "Contrato Principal",
					url: "https://example.com/contrato.pdf",
					source_payload: { imovelId: "senior-1" },
				},
				{
					id: "contrato-2",
					source_collection: "imoveis_administrativos_contratos",
					legacy_path: "imoveis_administrativos_contratos/contrato-2",
					legacy_document_id: "contrato-2",
					imovel_id: "senior-2",
					tipo: "link",
					nome: "Contrato Outro Imovel",
					source_payload: { imovelId: "senior-2" },
				},
			],
		}));
		const repository = loadRepository(dbQuery);

		const contratos = await repository.listContratos("senior-1");

		expect(dbQuery.mock.calls[0][0]).toContain("from imoveis_anexos");
		expect(contratos).toHaveLength(1);
		expect(contratos[0]).toMatchObject({
			id: "contrato-1",
			imovelId: "senior-1",
			nome: "Contrato Principal",
		});
	});
});
