import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/mensageriaRepository.js");
const dbPath = require.resolve("./api/src/db.js");
const normalizedDualWritePath = require.resolve("./api/src/normalizedDualWrite.js");

function clearModules() {
	delete require.cache[repositoryPath];
	delete require.cache[dbPath];
	delete require.cache[normalizedDualWritePath];
}

function loadRepository({ dbQuery, normalizedDualWrite = {} } = {}) {
	clearModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: {
			query: dbQuery,
		},
	};
	require.cache[normalizedDualWritePath] = {
		id: normalizedDualWritePath,
		filename: normalizedDualWritePath,
		loaded: true,
		exports: {
			upsert: vi.fn(async () => undefined),
			...normalizedDualWrite,
		},
	};
	return require("./api/src/mensageriaRepository.js");
}

describe("mensageriaRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("lista fila no contrato de app_documents usando as tabelas normalizadas", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "fila-1",
					codigo_cliente: "123",
					cliente: "Cliente Teste",
					telefone: "(31) 99999-0000",
					telefone_digits: "5531999990000",
					os: "OS-1",
					status: "aprovado",
					template_id: "cancelamento",
					origem: "teste",
					tentativas: 2,
					criado_em: "2026-08-30T10:00:00.000Z",
					atualizado_em: "2026-08-30T11:00:00.000Z",
					legacy_path: "mensageria_fila/fila-1",
					legacy_document_id: "fila-1",
					updated_at: "2026-08-30T11:00:00.000Z",
					source_payload: { origem: "teste" },
				},
			],
		}));
		const repository = loadRepository({ dbQuery });

		const rows = await repository.listDocuments({
			collectionPath: "mensageria_fila",
			limit: 10,
			offset: 0,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			path: "mensageria_fila/fila-1",
			collectionPath: "mensageria_fila",
			documentId: "fila-1",
			data: {
				id: "fila-1",
				codigoCliente: "123",
				cliente: "Cliente Teste",
				telefone_digits: "5531999990000",
				templateId: "cancelamento",
				tentativas: 2,
				origem: "teste",
			},
		});
		expect(dbQuery.mock.calls[0][0]).toContain("from mensageria_fila");
	});

	it("escreve usando normalizedDualWrite e retorna o documento normalizado", async () => {
		const upsert = vi.fn(async () => undefined);
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "fila-2",
					cliente: "Cliente Novo",
					status: "novo",
					legacy_path: "mensageria_fila/fila-2",
					legacy_document_id: "fila-2",
					source_payload: { cliente: "Cliente Novo", status: "novo" },
				},
			],
		}));
		const repository = loadRepository({
			dbQuery,
			normalizedDualWrite: { upsert },
		});

		const record = {
			path: "mensageria_fila/fila-2",
			collectionPath: "mensageria_fila",
			documentId: "fila-2",
			parentPath: null,
			data: { cliente: "Cliente Novo", status: "novo" },
		};
		const saved = await repository.upsertDocument(record);

		expect(upsert).toHaveBeenCalledWith(record);
		expect(saved.documentId).toBe("fila-2");
		expect(saved.data.cliente).toBe("Cliente Novo");
	});

	it("normaliza selected_date de conversas para string yyyy-mm-dd", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "5531999990000",
					telefone: "5531999990000",
					selected_date: new Date("2026-09-01T00:00:00.000Z"),
					selected_time: "14:30",
					stage: "awaiting_time",
					legacy_path: "mensageria_agendamento_conversas/5531999990000",
					legacy_document_id: "5531999990000",
					source_payload: {},
				},
			],
		}));
		const repository = loadRepository({ dbQuery });

		const conversation = await repository.getDocument(
			"mensageria_agendamento_conversas/5531999990000",
		);

		expect(conversation.data).toMatchObject({
			selectedDate: "2026-09-01",
			selectedTime: "14:30",
			stage: "awaiting_time",
		});
	});

	it("adquire lock de fila com update atomico e retorna o item travado", async () => {
		const dbQuery = vi.fn(async () => ({
			rows: [
				{
					id: "fila-lock",
					cliente: "Cliente Lock",
					status: "enviando",
					envio_lock_id: "lock-1",
					envio_lock_em: "2026-08-30T12:00:00.000Z",
					legacy_path: "mensageria_fila/fila-lock",
					legacy_document_id: "fila-lock",
					source_payload: { cliente: "Cliente Lock" },
				},
			],
		}));
		const repository = loadRepository({ dbQuery });

		const locked = await repository.acquireQueueItemLock("fila-lock", "lock-1", {
			ttlSeconds: 900,
		});

		expect(dbQuery.mock.calls[0][0]).toContain("update mensageria_fila");
		expect(dbQuery.mock.calls[0][0]).toContain("returning *");
		expect(dbQuery.mock.calls[0][1]).toEqual(["fila-lock", "lock-1", 900]);
		expect(locked.data).toMatchObject({
			id: "fila-lock",
			status: "enviando",
			envioLockId: "lock-1",
			cliente: "Cliente Lock",
		});
	});
});
