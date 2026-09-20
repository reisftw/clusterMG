import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const repositoryPath = require.resolve(
	"./api/src/documentos/repositories/documentosRepository.js",
);
const dbPath = require.resolve("./api/src/db.js");
const auditLogPath = require.resolve("./api/src/auditLog.js");

function clearModules() {
	delete require.cache[repositoryPath];
	delete require.cache[dbPath];
	delete require.cache[auditLogPath];
}

function loadRepository(query) {
	clearModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query },
	};
	require.cache[auditLogPath] = {
		id: auditLogPath,
		filename: auditLogPath,
		loaded: true,
		exports: {
			calculateChangedFields: vi.fn(() => ["nome"]),
			recordAuditLog: vi.fn(),
		},
	};
	return require("./api/src/documentos/repositories/documentosRepository.js");
}

describe("documentosRepository auxiliares normalizados", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("salva configuracao de documentos em tabela normalizada", async () => {
		const query = vi.fn(async () => ({
			rows: [{ data: { enabled: true } }],
		}));
		const repository = loadRepository(query);

		const result = await repository.saveDocumentosConfig("cobranca", {
			enabled: true,
		});

		expect(query.mock.calls[0][0]).toContain(
			"insert into documentos_configuracoes",
		);
		expect(query.mock.calls[0][0]).not.toContain("app_documents");
		expect(result).toEqual({ enabled: true });
	});

	it("registra log de cobranca em tabela normalizada", async () => {
		const query = vi.fn(async () => ({
			rows: [
				{
					id: "empresa_2026-08_stamp",
					empresa_id: "empresa",
					empresa_nome: "Empresa Teste",
					email: "financeiro@example.com",
					mes_referencia: "2026-08",
					pendencias: ["Contrato"],
					payload: { sentAt: "2026-08-31T10:00:00.000Z" },
					created_at: "2026-08-31T10:00:00.000Z",
					updated_at: "2026-08-31T10:00:00.000Z",
				},
			],
		}));
		const repository = loadRepository(query);

		const result = await repository.recordBillingLog("empresa_2026-08_stamp", {
			empresaId: "empresa",
			empresaNome: "Empresa Teste",
			email: "financeiro@example.com",
			mesReferencia: "2026-08",
			pendencias: ["Contrato"],
			sentAt: "2026-08-31T10:00:00.000Z",
		});

		expect(query.mock.calls[0][0]).toContain(
			"insert into documentos_cobranca_logs",
		);
		expect(result).toMatchObject({
			id: "empresa_2026-08_stamp",
			empresaId: "empresa",
			pendencias: ["Contrato"],
		});
	});

	it("lista campos de nota fiscal da tabela normalizada", async () => {
		const query = vi.fn(async () => ({
			rows: [
				{
					id: "nf-servico",
					nome: "Nota Fiscal de Servico",
					ordem: 2,
					ativo: true,
					created_at: "2026-08-31T10:00:00.000Z",
					updated_at: "2026-08-31T10:00:00.000Z",
				},
			],
		}));
		const repository = loadRepository(query);

		const result = await repository.listInvoiceFields();

		expect(query.mock.calls[0][0]).toContain(
			"from documentos_notas_fiscais_campos",
		);
		expect(result[0]).toMatchObject({
			id: "nf-servico",
			nome: "Nota Fiscal de Servico",
			ordem: 2,
		});
	});
});
