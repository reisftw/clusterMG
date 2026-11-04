import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const documentsPath = require.resolve("./api/src/documents.js");

function mockModule(relativePath, exports) {
	const modulePath = require.resolve(`./api/src/${relativePath}`);
	require.cache[modulePath] = {
		id: modulePath,
		filename: modulePath,
		loaded: true,
		exports,
	};
	return modulePath;
}

describe("documents read cache", () => {
	const mockedPaths = [];

	afterEach(() => {
		delete require.cache[documentsPath];
		mockedPaths.splice(0).forEach((modulePath) => delete require.cache[modulePath]);
		delete process.env.DOCUMENTS_READ_CACHE_TTL_MS;
		delete process.env.DOCUMENTS_STALE_CACHE_TTL_MS;
		vi.useRealTimers();
	});

	it("reutiliza o ultimo resultado durante saturacao temporaria do pool", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z"));
		process.env.DOCUMENTS_READ_CACHE_TTL_MS = "100";
		process.env.DOCUMENTS_STALE_CACHE_TTL_MS = "1000";
		let databaseAvailable = true;
		const query = vi.fn(async () => {
			if (!databaseAvailable) throw new Error("timeout exceeded when trying to connect");
			return { rows: [{ documentId: "Novembro", data: { total: 12 } }] };
		});

		mockedPaths.push(
			mockModule("db.js", { query }),
			mockModule("auditLog.js", {}),
			mockModule("imoveisRepository.js", { isImoveisCollection: () => false }),
			mockModule("ordensRepository.js", { isOrdersCollection: () => false }),
			mockModule("normalizedDualWrite.js", {}),
			mockModule("realtime.js", { broadcastRealtime: vi.fn() }),
			mockModule("publicDashboard.js", { invalidatePublicDashboardCache: vi.fn() }),
		);
		delete require.cache[documentsPath];
		const documents = require("./api/src/documents.js");

		const initial = await documents.listDocuments({
			collectionPath: "dashboardagentes",
			limit: 36,
			offset: 0,
		});
		databaseAvailable = false;
		vi.advanceTimersByTime(101);

		await expect(
			documents.listDocuments({ collectionPath: "dashboardagentes", limit: 36, offset: 0 }),
		).resolves.toEqual(initial);
		await expect(
			documents.listDocuments({ collectionPath: "dashboardagentes", limit: 36, offset: 0 }),
		).resolves.toEqual(initial);
		expect(query).toHaveBeenCalledTimes(3);
	});
});
