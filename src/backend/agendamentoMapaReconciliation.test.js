import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const reconciliationPath = require.resolve(
	"./api/src/agendamentoMapaReconciliation.js",
);
const dbPath = require.resolve("./api/src/db.js");
const documentsPath = require.resolve("./api/src/documents.js");
const agendamentosRepositoryPath = require.resolve(
	"./api/src/agendamentosRepository.js",
);
const notificationsPath = require.resolve("./api/src/notificationsService.js");

function clearModules() {
	delete require.cache[reconciliationPath];
	delete require.cache[dbPath];
	delete require.cache[documentsPath];
	delete require.cache[agendamentosRepositoryPath];
	delete require.cache[notificationsPath];
}

function setMock(modulePath, exports) {
	require.cache[modulePath] = {
		id: modulePath,
		filename: modulePath,
		loaded: true,
		exports,
	};
}

// Fase F (docs/TECHNICAL-AUDIT.md, achado #9): a reconciliacao agora abre
// uma transacao (db.connect()) por registro pra agrupar
// saveAppointment+recordAppointmentLog atomicamente — precisa de um mock
// de db.js (nao existia antes, porque o arquivo so usava
// agendamentosRepository/documents/notificationsService).
function makeDbMock() {
	const query = vi.fn(async () => ({ rows: [] }));
	return {
		query,
		connect: vi.fn(async () => ({
			query: vi.fn(async (text) => {
				const sql = String(typeof text === "string" ? text : "").toLowerCase();
				if (sql === "begin" || sql === "commit" || sql === "rollback") return { rows: [] };
				return query(text);
			}),
			release: vi.fn(),
		})),
	};
}

function loadReconciliation({ documents, agendamentosRepository, notifications, db }) {
	clearModules();
	setMock(dbPath, db || makeDbMock());
	setMock(documentsPath, documents);
	setMock(agendamentosRepositoryPath, agendamentosRepository);
	setMock(notificationsPath, notifications);
	return require("./api/src/agendamentoMapaReconciliation.js");
}

describe("agendamentoMapaReconciliation", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("le agendamentos pelo repositorio de dominio e mantem ordens no legado", async () => {
		const documents = {
			listAllDocuments: vi.fn(async (collectionPath) => {
				expect(collectionPath).toBe("ordens_abertas");
				return [
					{
						documentId: "os-1",
						data: {
							codigo_cliente: "456",
							nome_cliente: "Cliente ainda no mapa",
							num_os: "OS-456",
						},
					},
				];
			}),
		};
		const agendamentosRepository = {
			listAllAppointmentDocuments: vi.fn(async () => [
				{
					documentId: "ag-123",
					data: {
						codigo_cliente: "123",
						cliente_nome: "Cliente recolhido",
						data: "2026-08-01",
						status: "Aguardando dia",
					},
				},
				{
					documentId: "ag-456",
					data: {
						codigo_cliente: "456",
						cliente_nome: "Cliente ainda no mapa",
						data: "2026-08-01",
						status: "Aguardando dia",
					},
				},
			]),
			deleteAppointmentLogsByType: vi.fn(async () => 0),
			recordAppointmentLog: vi.fn(async () => ({})),
			saveAppointment: vi.fn(async () => ({})),
		};
		const notifications = {
			createNotification: vi.fn(async () => ({})),
		};
		const { reconcileAppointmentsWithMapa } = loadReconciliation({
			documents,
			agendamentosRepository,
			notifications,
		});

		const summary = await reconcileAppointmentsWithMapa({
			monthsBack: null,
			reason: "teste",
			user: { uid: "admin-1", nome: "Admin", role: "admin" },
		});

		expect(documents.listAllDocuments).toHaveBeenCalledTimes(1);
		expect(documents.listAllDocuments).toHaveBeenCalledWith("ordens_abertas");
		expect(
			agendamentosRepository.listAllAppointmentDocuments,
		).toHaveBeenCalledTimes(1);
		expect(agendamentosRepository.saveAppointment).toHaveBeenCalledTimes(2);
		expect(agendamentosRepository.saveAppointment.mock.calls[0][1].status).toBe(
			"Concluido",
		);
		expect(agendamentosRepository.saveAppointment.mock.calls[1][1].status).toBe(
			"Nao recolhido",
		);
		expect(agendamentosRepository.recordAppointmentLog).toHaveBeenCalledTimes(2);
		expect(notifications.createNotification).toHaveBeenCalledTimes(1);
		expect(summary).toMatchObject({
			checked: 2,
			recolhidos: 1,
			naoRecolhidos: 1,
			mapOrders: 1,
		});
	});

	it("agrupa atualizacao do agendamento + log da reconciliacao numa transacao (Fase F)", async () => {
		const documents = { listAllDocuments: vi.fn(async () => []) };
		const agendamentosRepository = {
			listAllAppointmentDocuments: vi.fn(async () => [
				{
					documentId: "ag-1",
					data: {
						codigo_cliente: "1",
						cliente_nome: "Cliente",
						data: "2026-08-01",
						status: "Aguardando dia",
					},
				},
			]),
			deleteAppointmentLogsByType: vi.fn(async () => 0),
			recordAppointmentLog: vi.fn(async () => ({})),
			saveAppointment: vi.fn(async () => ({})),
		};
		const notifications = { createNotification: vi.fn(async () => ({})) };
		const dbClientQuery = vi.fn(async (text) => {
			const sql = String(typeof text === "string" ? text : "").toLowerCase();
			if (["begin", "commit", "rollback"].includes(sql)) return { rows: [] };
			return { rows: [] };
		});
		const release = vi.fn();
		const db = {
			query: vi.fn(async () => ({ rows: [] })),
			connect: vi.fn(async () => ({ query: dbClientQuery, release })),
		};

		const { reconcileAppointmentsWithMapa } = loadReconciliation({
			documents,
			agendamentosRepository,
			notifications,
			db,
		});

		await reconcileAppointmentsWithMapa({ reason: "teste" });

		expect(db.connect).toHaveBeenCalledTimes(1);
		expect(dbClientQuery.mock.calls.map((call) => String(call[0]).toLowerCase())).toEqual([
			"begin",
			"commit",
		]);
		expect(release).toHaveBeenCalledTimes(1);
		// saveAppointment/recordAppointmentLog recebem o MESMO client da
		// transacao (segundo argumento de options), nao um client diferente.
		const [, , saveOptions] = agendamentosRepository.saveAppointment.mock.calls[0];
		expect(saveOptions?.client?.query).toBe(dbClientQuery);
		const [, logOptions] = agendamentosRepository.recordAppointmentLog.mock.calls[0];
		expect(logOptions?.client?.query).toBe(dbClientQuery);
	});

	it("reverte a transacao (rollback) se a gravacao do log falhar", async () => {
		const documents = { listAllDocuments: vi.fn(async () => []) };
		const agendamentosRepository = {
			listAllAppointmentDocuments: vi.fn(async () => [
				{
					documentId: "ag-1",
					data: {
						codigo_cliente: "1",
						cliente_nome: "Cliente",
						data: "2026-08-01",
						status: "Aguardando dia",
					},
				},
			]),
			deleteAppointmentLogsByType: vi.fn(async () => 0),
			recordAppointmentLog: vi.fn(async () => {
				throw new Error("falha simulada ao gravar log");
			}),
			saveAppointment: vi.fn(async () => ({})),
		};
		const notifications = { createNotification: vi.fn(async () => ({})) };
		const dbClientQuery = vi.fn(async () => ({ rows: [] }));
		const release = vi.fn();
		const db = {
			query: vi.fn(async () => ({ rows: [] })),
			connect: vi.fn(async () => ({ query: dbClientQuery, release })),
		};

		const { reconcileAppointmentsWithMapa } = loadReconciliation({
			documents,
			agendamentosRepository,
			notifications,
			db,
		});

		await expect(
			reconcileAppointmentsWithMapa({ reason: "teste" }),
		).rejects.toThrow("falha simulada ao gravar log");

		expect(dbClientQuery.mock.calls.map((call) => String(call[0]).toLowerCase())).toEqual([
			"begin",
			"rollback",
		]);
		expect(release).toHaveBeenCalledTimes(1);
	});
});
