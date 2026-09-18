import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const reconciliationPath = require.resolve(
	"./api/src/agendamentoMapaReconciliation.js",
);
const documentsPath = require.resolve("./api/src/documents.js");
const agendamentosRepositoryPath = require.resolve(
	"./api/src/agendamentosRepository.js",
);
const notificationsPath = require.resolve("./api/src/notificationsService.js");

function clearModules() {
	delete require.cache[reconciliationPath];
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

function loadReconciliation({ documents, agendamentosRepository, notifications }) {
	clearModules();
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
});
