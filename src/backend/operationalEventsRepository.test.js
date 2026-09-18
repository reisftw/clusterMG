import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/operationalEventsRepository.js");
const dbPath = require.resolve("./api/src/db.js");

function clearModules() {
	delete require.cache[repositoryPath];
	delete require.cache[dbPath];
}

function loadRepository(query) {
	clearModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query },
	};
	return require("./api/src/operationalEventsRepository.js");
}

describe("operationalEventsRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("registra evento de runtime em tabela normalizada", async () => {
		const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
		const repository = loadRepository(query);

		await repository.recordRuntimeEvent({
			id: "runtime-1",
			type: "startup",
			pid: 123,
			nodeVersion: "v24.0.0",
			uptimeSeconds: 5,
			createdAt: "2026-08-31T10:00:00.000Z",
			details: { port: 3001 },
		});

		expect(query.mock.calls[0][0]).toContain("insert into api_runtime_events");
		expect(query.mock.calls[0][0]).not.toContain("app_documents");
	});

	it("lista eventos de servico preservando o contrato usado pelo status da API", async () => {
		const query = vi.fn(async () => ({
			rows: [
				{
					id: "service-1",
					type: "status_change",
					service_id: "database",
					service_name: "API do Banco de Dados",
					status: "online",
					previous_status: "offline",
					reason: "",
					response_ms: "15",
					checked_at: "2026-08-31T10:00:00.000Z",
					created_at: "2026-08-31T10:00:01.000Z",
					payload: { extra: true },
				},
			],
		}));
		const repository = loadRepository(query);

		const events = await repository.listServiceEvents();

		expect(query.mock.calls[0][0]).toContain("from api_service_events");
		expect(events[0]).toMatchObject({
			id: "service-1",
			serviceId: "database",
			serviceName: "API do Banco de Dados",
			status: "online",
			previousStatus: "offline",
			extra: true,
		});
	});
});
