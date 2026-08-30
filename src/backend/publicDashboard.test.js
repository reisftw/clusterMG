import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const dashboardPath = require.resolve("./api/src/publicDashboard.js");
const dbPath = require.resolve("./api/src/db.js");
const ordensRepositoryPath = require.resolve("./api/src/ordensRepository.js");

function clearModules() {
	delete require.cache[dashboardPath];
	delete require.cache[dbPath];
	delete require.cache[ordensRepositoryPath];
}

function loadPublicDashboard({ dbQuery, ordensRepository }) {
	clearModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query: dbQuery },
	};
	require.cache[ordensRepositoryPath] = {
		id: ordensRepositoryPath,
		filename: ordensRepositoryPath,
		loaded: true,
		exports: ordensRepository,
	};
	return require("./api/src/publicDashboard.js");
}

describe("publicDashboard", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("usa snapshots normalizados de ordens antes de consultar app_documents", async () => {
		const dbQuery = vi.fn(async () => ({ rows: [] }));
		const ordensRepository = {
			isOrdersCollection: vi.fn((collectionPath) =>
				["public_dashboard", "mapa_meta", "match_os_meta"].includes(
					collectionPath,
				),
			),
			getDocument: vi.fn(async (documentPath) => {
				if (documentPath === "public_dashboard/mapa_os") {
					return {
						data: {
							summary: { totalOrdens: 7 },
							meta: { data: "2026-08-30T17:30:00.000Z" },
						},
					};
				}
				return null;
			}),
			listDocuments: vi.fn(async () => []),
		};
		const publicDashboard = loadPublicDashboard({ dbQuery, ordensRepository });

		const payload = await publicDashboard.buildSnapshotDomain("operacional");

		expect(payload.mapa).toMatchObject({
			summary: { totalOrdens: 7 },
			meta: { data: "2026-08-30T17:30:00.000Z" },
		});
		expect(ordensRepository.getDocument).toHaveBeenCalledWith(
			"public_dashboard/mapa_os",
		);
		expect(dbQuery).not.toHaveBeenCalledWith(
			expect.stringContaining("from app_documents"),
			["public_dashboard/mapa_os"],
		);
	});
});
