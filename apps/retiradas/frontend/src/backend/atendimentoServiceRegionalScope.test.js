// Testes do IDOR/escopo regional introduzido na Fase A
// (docs/TECHNICAL-AUDIT.md, achado #3) em
// vps/api/src/atendimento/atendimentoService.js — updateCase,
// updateTechnician e deleteTechnician agora verificam a regional do
// registro (técnico vinculado ao caso / técnico) contra a regional do
// usuário autenticado, quando o papel é escopado (supervisor).
//
// atendimentoService.js é um arquivo grande com várias dependências
// externas (documents, evolutionMessaging, etc.) — mockamos tudo via
// require.cache antes de requerer o módulo, do mesmo jeito que
// src/backend/app.characterization.test.js já faz para vps/api/src/app.js.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const apiDir = path.join(process.cwd(), "apps/retiradas/backend/api/src");
const servicePath = require.resolve(path.join(apiDir, "atendimento/atendimentoService.js"));

const mockPaths = [
	"agendamentosRepository.js",
	"documents.js",
	"regionaisRepository.js",
	"evolutionMessaging.js",
	"notificationsService.js",
	"sempreIntegration.js",
	"realtime.js",
	"webhooks/utils/webhookSecrets.js",
	"auditLog.js",
].map((relative) => require.resolve(path.join(apiDir, relative)));

let documentsMock;
let auditLogMock;

function setMock(resolvedPath, exports) {
	require.cache[resolvedPath] = {
		id: resolvedPath,
		filename: resolvedPath,
		loaded: true,
		exports,
	};
}

function installMocks() {
	documentsMock = {
		getDocument: vi.fn(async () => null),
		upsertDocument: vi.fn(async () => ({ ok: true })),
		deleteDocument: vi.fn(async () => undefined),
		listAllDocuments: vi.fn(async () => []),
		listDocuments: vi.fn(async () => []),
	};
	// auditLog.js exige vps/api/src/db.js no topo, que lanca erro sincrono se
	// nenhuma env var de conexao estiver definida — mock pra nao precisar de
	// Postgres real so pra testar o service.
	auditLogMock = {
		recordAuditLog: vi.fn(async () => undefined),
		calculateChangedFields: vi.fn((before, after) => {
			const beforeKeys = before && typeof before === "object" ? Object.keys(before) : [];
			const afterKeys = after && typeof after === "object" ? Object.keys(after) : [];
			const changed = new Set();
			for (const key of new Set([...beforeKeys, ...afterKeys])) {
				if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) changed.add(key);
			}
			return Array.from(changed);
		}),
	};
	setMock(mockPaths[0], {});
	setMock(mockPaths[1], documentsMock);
	setMock(mockPaths[2], {});
	setMock(mockPaths[3], {});
	setMock(mockPaths[4], {});
	setMock(mockPaths[5], {});
	setMock(mockPaths[6], { broadcastRealtime: vi.fn() });
	setMock(mockPaths[7], { getProvidedWebhookSecret: vi.fn(() => "") });
	setMock(mockPaths[8], auditLogMock);
	delete require.cache[servicePath];
}

function fakeUser(role, regional) {
	return { role, regional, profile: { role, regional } };
}

describe("IDOR/escopo regional — atendimentoService", () => {
	beforeEach(() => {
		installMocks();
	});

	afterEach(() => {
		[...mockPaths, servicePath].forEach((resolved) => {
			delete require.cache[resolved];
		});
	});

	describe("updateCase", () => {
		it("supervisor autorizado + caso do técnico da própria regional → OK", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue({
				data: { id: "caso-1", phone: "5511999999999", technician: { regional: "Metropolitana SUB2" } },
			});
			await expect(
				atendimentoService.updateCase(
					"caso-1",
					{ note: "ok" },
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).resolves.toBeTruthy();
			expect(documentsMock.upsertDocument).toHaveBeenCalled();
			expect(auditLogMock.recordAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({ module: "atendimento", entity: "atendimento_casos", recordId: "caso-1" }),
			);
		});

		it("supervisor autorizado + caso de técnico de OUTRA regional → 403", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue({
				data: { id: "caso-1", phone: "5511999999999", technician: { regional: "Interior SUB1" } },
			});
			await expect(
				atendimentoService.updateCase(
					"caso-1",
					{ note: "ok" },
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).rejects.toMatchObject({ statusCode: 403 });
			expect(documentsMock.upsertDocument).not.toHaveBeenCalled();
		});

		it("caso sem técnico vinculado ainda (regional desconhecida) → permitido (não é regressão operacional)", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue({
				data: { id: "caso-1", phone: "5511999999999" },
			});
			await expect(
				atendimentoService.updateCase(
					"caso-1",
					{ note: "ok" },
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).resolves.toBeTruthy();
		});

		it("caso inexistente → 404", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue(null);
			await expect(
				atendimentoService.updateCase(
					"nao-existe",
					{},
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).rejects.toMatchObject({ statusCode: 404 });
		});

		it("admin altera caso de qualquer regional → OK", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue({
				data: { id: "caso-1", phone: "5511999999999", technician: { regional: "Interior SUB1" } },
			});
			await expect(
				atendimentoService.updateCase(
					"caso-1",
					{ note: "ok" },
					fakeUser("admin", "Metropolitana SUB2"),
				),
			).resolves.toBeTruthy();
		});
	});

	describe("deleteTechnician", () => {
		it("supervisor autorizado + técnico da própria regional → OK", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue({
				data: { phone: "5511999999999", regional: "Metropolitana SUB2" },
			});
			await expect(
				atendimentoService.deleteTechnician(
					"5511999999999",
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).resolves.toMatchObject({ ok: true });
			expect(auditLogMock.recordAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({ action: "delete", module: "atendimento", entity: "atendimento_tecnicos" }),
			);
		});

		it("supervisor autorizado + técnico de OUTRA regional → 403", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue({
				data: { phone: "5511999999999", regional: "Interior SUB1" },
			});
			await expect(
				atendimentoService.deleteTechnician(
					"5511999999999",
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).rejects.toMatchObject({ statusCode: 403 });
			expect(documentsMock.deleteDocument).not.toHaveBeenCalled();
		});

		it("técnico inexistente → 404", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue(null);
			await expect(
				atendimentoService.deleteTechnician(
					"5511999999999",
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).rejects.toMatchObject({ statusCode: 404 });
		});
	});

	describe("updateTechnician", () => {
		it("supervisor autorizado + técnico de OUTRA regional → 403, nunca chega a salvar", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue({
				data: { phone: "5511999999999", regional: "Interior SUB1" },
			});
			await expect(
				atendimentoService.updateTechnician(
					"5511999999999",
					{ name: "Novo nome" },
					fakeUser("supervisor", "Metropolitana SUB2"),
				),
			).rejects.toMatchObject({ statusCode: 403 });
			expect(documentsMock.upsertDocument).not.toHaveBeenCalled();
		});

		it("técnico novo (ainda não existe) — regional do payload é forçada pro supervisor", async () => {
			const atendimentoService = require(servicePath);
			documentsMock.getDocument.mockResolvedValue(null);
			await atendimentoService.updateTechnician(
				"5511999999999",
				{ name: "Fulano", regional: "Interior SUB1" },
				fakeUser("supervisor", "Metropolitana SUB2"),
			);
			const [{ data: savedData }] = documentsMock.upsertDocument.mock.calls[0];
			expect(savedData.regional).toBe("Metropolitana SUB2");
		});
	});
});
