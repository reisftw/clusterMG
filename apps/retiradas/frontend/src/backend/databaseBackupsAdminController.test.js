// Testes de auditoria (Fase D — docs/TECHNICAL-AUDIT.md, achado #5) do
// controller de backups administrativos
// (vps/api/src/databaseBackupsAdmin/controllers/databaseBackupsAdminController.js).
// Restauração de backup é a ação administrativa mais sensível do sistema
// (reverte o banco inteiro) e não deixava nenhum rastro de auditoria.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const apiDir = path.join(process.cwd(), "apps/retiradas/backend/api/src");
const controllerPath = require.resolve(
	path.join(apiDir, "databaseBackupsAdmin/controllers/databaseBackupsAdminController.js"),
);
const auditLogPath = require.resolve(path.join(apiDir, "auditLog.js"));

let auditLogMock;

function setMock(resolvedPath, exports) {
	require.cache[resolvedPath] = { id: resolvedPath, filename: resolvedPath, loaded: true, exports };
}

function installMocks() {
	auditLogMock = { recordAuditLog: vi.fn(async () => undefined) };
	setMock(auditLogPath, auditLogMock);
	delete require.cache[controllerPath];
}

function fakeReqRes(overrides = {}) {
	const req = { user: { uid: "admin-1", email: "admin@example.com" }, params: {}, body: {}, ...overrides };
	const res = { json: vi.fn() };
	const next = vi.fn();
	return { req, res, next };
}

describe("databaseBackupsAdminController — auditoria", () => {
	beforeEach(() => {
		installMocks();
	});

	afterEach(() => {
		delete require.cache[controllerPath];
		delete require.cache[auditLogPath];
	});

	it("createBackup registra auditoria após criar o backup", async () => {
		const { createDatabaseBackupsAdminController } = require(controllerPath);
		const databaseBackups = {
			createBackup: vi.fn(async () => ({ latestBackup: { fileName: "backup-1.dump" } })),
		};
		const notificationsService = { createNotification: vi.fn(async () => undefined) };
		const controller = createDatabaseBackupsAdminController({ databaseBackups, notificationsService });

		const { req, res, next } = fakeReqRes();
		await controller.createBackup(req, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(auditLogMock.recordAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({ action: "create", module: "configuracao", entity: "database_backups" }),
		);
	});

	it("restoreBackup exige a frase de confirmação exata (comportamento preservado)", async () => {
		const { createDatabaseBackupsAdminController } = require(controllerPath);
		const databaseBackups = { restoreBackup: vi.fn(async () => ({ ok: true })) };
		const notificationsService = { createNotification: vi.fn(async () => undefined) };
		const controller = createDatabaseBackupsAdminController({ databaseBackups, notificationsService });

		const { req, res, next } = fakeReqRes({
			params: { fileName: "backup-1.dump" },
			body: { confirmation: "texto errado" },
		});
		await controller.restoreBackup(req, res, next);

		expect(res.json).not.toHaveBeenCalled();
		expect(databaseBackups.restoreBackup).not.toHaveBeenCalled();
		expect(auditLogMock.recordAuditLog).not.toHaveBeenCalled();
	});

	it("restoreBackup registra auditoria (ação crítica) quando confirmado corretamente", async () => {
		const { createDatabaseBackupsAdminController } = require(controllerPath);
		const databaseBackups = { restoreBackup: vi.fn(async () => ({ ok: true })) };
		const notificationsService = { createNotification: vi.fn(async () => undefined) };
		const controller = createDatabaseBackupsAdminController({ databaseBackups, notificationsService });

		const { req, res, next } = fakeReqRes({
			params: { fileName: "backup-1.dump" },
			body: { confirmation: "RESTAURAR BANCO" },
		});
		await controller.restoreBackup(req, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(databaseBackups.restoreBackup).toHaveBeenCalledWith("backup-1.dump", expect.objectContaining({ user: req.user }));
		expect(auditLogMock.recordAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "restore",
				module: "configuracao",
				entity: "database_backups",
				recordId: "backup-1.dump",
			}),
		);
	});
});
