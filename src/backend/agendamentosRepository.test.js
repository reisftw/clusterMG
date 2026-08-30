import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/agendamentosRepository.js");
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
	return require("./api/src/agendamentosRepository.js");
}

describe("agendamentosRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("lista agendamentos mantendo o contrato de app_documents", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "pk-1",
					document_id_original: "ag-1",
					legacy_path: "agendamentos/ag-1",
					legacy_document_id: "ag-1",
					codigo_cliente: "123",
					cliente_nome: "Cliente Teste",
					cidade: "Belo Horizonte",
					regional: "METROPOLITANA",
					data: new Date("2026-08-30T00:00:00.000Z"),
					hora: "08:30:00",
					status: "Aguardando dia",
					created_at: "2026-08-30T10:00:00.000Z",
					updated_at: "2026-08-30T11:00:00.000Z",
					source_payload: { origem: "teste" },
				},
			],
		}));
		const repository = loadRepository(dbQuery);

		const rows = await repository.listDocuments({
			collectionPath: "agendamentos",
			limit: 10,
			offset: 0,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			path: "agendamentos/ag-1",
			collectionPath: "agendamentos",
			documentId: "ag-1",
			data: {
				codigo_cliente: "123",
				cliente_nome: "Cliente Teste",
				cidade: "Belo Horizonte",
				regional: "METROPOLITANA",
				status: "Aguardando dia",
			},
		});
		expect(rows[0].data.hora).toBe("08:30");
		expect(rows[0].data.data).toBe("2026-08-30");
		expect(dbQuery.mock.calls[0][0]).toContain("from agendamentos");
	});

	it("grava agendamento na tabela normalizada e retorna o registro salvo", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [
					{
						id: "pk-2",
						document_id_original: "ag-2",
						legacy_path: "agendamentos/ag-2",
						legacy_document_id: "ag-2",
						codigo_cliente: "456",
						cliente_nome: "Cliente Novo",
						status: "Concluido",
						source_payload: {
							codigo_cliente: "456",
							cliente_nome: "Cliente Novo",
							status: "Concluido",
						},
					},
				],
			});
		const repository = loadRepository(dbQuery);

		const saved = await repository.upsertDocument({
			path: "agendamentos/ag-2",
			collectionPath: "agendamentos",
			documentId: "ag-2",
			parentPath: null,
			data: {
				codigo_cliente: "456",
				cliente_nome: "Cliente Novo",
				status: "Concluido",
			},
		});

		expect(dbQuery.mock.calls[0][0]).toContain("insert into agendamentos");
		expect(saved.documentId).toBe("ag-2");
		expect(saved.data.cliente_nome).toBe("Cliente Novo");
	});

	it("remove logs de verificacao de mapa direto da tabela normalizada", async () => {
		const dbQuery = vi.fn(async () => ({ rowCount: 3, rows: [] }));
		const repository = loadRepository(dbQuery);

		const deleted = await repository.deleteAppointmentLogsByType(
			"verificacao_mapa",
		);

		expect(deleted).toBe(3);
		expect(dbQuery).toHaveBeenCalledWith(
			"delete from agendamentos_logs where tipo = $1",
			["verificacao_mapa"],
		);
	});
});
