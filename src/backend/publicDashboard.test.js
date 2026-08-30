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
			getCollectionLatestUpdatedAt: vi.fn(async () => null),
			listAllDocuments: vi.fn(async () => []),
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

	it("reconstroi mapa e match por colecao quando snapshot normalizado esta antigo", async () => {
		const dbQuery = vi.fn(async (_sql, params = []) => {
			const key = params[0];
			if (key === "mapa_meta/ultima_atualizacao") {
				return { rows: [{ data: { data: "2026-08-30T17:00:00.000Z" } }] };
			}
			if (key === "match_os_meta/ultima_atualizacao") {
				return { rows: [{ data: { data: "2026-08-30T17:00:00.000Z" } }] };
			}
			return { rows: [] };
		});
		const ordensRepository = {
			isOrdersCollection: vi.fn((collectionPath) =>
				[
					"ordens_abertas",
					"match_os_abertas",
					"public_dashboard",
					"mapa_meta",
					"match_os_meta",
				].includes(collectionPath),
			),
			getDocument: vi.fn(async (documentPath) => {
				if (documentPath === "public_dashboard/mapa_os") {
					return {
						data: {
							summary: { totalOrdens: 1 },
							meta: { data: "2026-08-28T11:13:43.211Z" },
						},
					};
				}
				if (documentPath === "public_dashboard/match_os") {
					return {
						data: {
							data: { resumo: { totalMatches: 1 } },
							meta: { data: "2026-08-28T12:34:17.649Z" },
						},
					};
				}
				return null;
			}),
			getCollectionLatestUpdatedAt: vi.fn(async () =>
				new Date("2026-08-30T17:22:37.000Z"),
			),
			listAllDocuments: vi.fn(async (collectionPath) => [
				{
					documentId: `${collectionPath}-1`,
					data: {
						num_os: "123",
						cidade: "Belo Horizonte",
						regional: "METROPOLITANA",
					},
				},
			]),
		};
		const publicDashboard = loadPublicDashboard({ dbQuery, ordensRepository });

		const payload = await publicDashboard.buildPublicDashboard();

		expect(payload.mapa.ordens).toHaveLength(1);
		expect(payload.matchOS.ordens).toHaveLength(1);
		expect(ordensRepository.listAllDocuments).toHaveBeenCalledWith(
			"ordens_abertas",
		);
		expect(ordensRepository.listAllDocuments).toHaveBeenCalledWith(
			"match_os_abertas",
		);
	});
});
