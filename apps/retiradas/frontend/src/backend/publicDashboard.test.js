import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
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
		vi.useRealTimers();
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

	it("preserva snapshots publicados sem reconstruir colecoes operacionais", async () => {
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
				new Date("2026-08-28T12:34:17.000Z"),
			),
			listAllDocuments: vi.fn(async () => {
				throw new Error("nao deve varrer colecao operacional");
			}),
		};
		const publicDashboard = loadPublicDashboard({ dbQuery, ordensRepository });

		const payload = await publicDashboard.buildPublicDashboard();

		expect(payload.mapa.summary.totalOrdens).toBe(1);
		expect(payload.matchOS.data.resumo.totalMatches).toBe(1);
		expect(payload.matchOS.meta.data).toBe("2026-08-28T12:34:17.649Z");
		expect(ordensRepository.listAllDocuments).not.toHaveBeenCalledWith(
			"ordens_abertas",
		);
		expect(ordensRepository.listAllDocuments).not.toHaveBeenCalledWith(
			"match_os_abertas",
		);
	});

	it("reconstroi match publico quando snapshot salvo esta mais antigo que a tabela normalizada", async () => {
		const dbQuery = vi.fn(async () => ({ rows: [] }));
		const ordensRepository = {
			COLLECTIONS: { match: "match_os_abertas" },
			isOrdersCollection: vi.fn((collectionPath) =>
				["match_os_abertas", "public_dashboard"].includes(collectionPath),
			),
			getDocument: vi.fn(async (documentPath) => {
				if (documentPath === "public_dashboard/match_os") {
					return {
						data: {
							data: { resumo: { totalMatches: 99 } },
							meta: { data: "2026-08-28T12:34:17.649Z" },
						},
					};
				}
				if (documentPath === "public_dashboard/agentes_match_os") {
					return {
						data: {
							data: { resumo: { totalMatches: 99 } },
							meta: { data: "2026-08-28T12:34:17.649Z" },
						},
					};
				}
				return null;
			}),
			getCollectionLatestUpdatedAt: vi.fn(async () =>
				new Date("2026-08-31T18:00:00.000Z"),
			),
			listAllDocuments: vi.fn(async (collectionPath) => {
				if (collectionPath !== "match_os_abertas") return [];
				return [
					{
						documentId: "servico-1",
						data: {
							id: "servico-1",
							num_os: "1",
							tipo: "INSTALACAO",
							cidade: "Belo Horizonte",
							regional: "METROPOLITANA",
							endereco: "Rua A, 10",
							latitude: -19.92,
							longitude: -43.94,
							fonte: "sempre",
						},
					},
					{
						documentId: "retirada-1",
						data: {
							id: "retirada-1",
							num_os: "2",
							tipo: "RETIRADA FTTH",
							cidade: "Belo Horizonte",
							regional: "METROPOLITANA",
							endereco: "Rua A, 12",
							latitude: -19.9201,
							longitude: -43.9401,
							fonte: "onnet",
						},
					},
				];
			}),
		};
		const publicDashboard = loadPublicDashboard({ dbQuery, ordensRepository });

		const payload = await publicDashboard.buildPublicDashboard({
			matchDetail: true,
		});

		expect(payload.matchOS.data.resumo.totalMatches).toBe(1);
		expect(payload.matchOS.meta.data).toBe("2026-08-31T18:00:00.000Z");
		expect(payload.matchOS.meta.rebuiltFrom).toBe("match_os_abertas");
		expect(payload.matchOS.meta.totalSempre).toBe(1);
		expect(payload.matchOS.meta.totalOnnet).toBe(1);
		expect(ordensRepository.listAllDocuments).toHaveBeenCalledWith(
			"match_os_abertas",
		);
	});

	it("nao reconstroi match enquanto a tabela normalizada ainda esta recebendo importacao", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-31T18:00:30.000Z"));
		const dbQuery = vi.fn(async () => ({ rows: [] }));
		const ordensRepository = {
			COLLECTIONS: { match: "match_os_abertas" },
			isOrdersCollection: vi.fn((collectionPath) =>
				["match_os_abertas", "public_dashboard"].includes(collectionPath),
			),
			getDocument: vi.fn(async (documentPath) => {
				if (documentPath === "public_dashboard/match_os") {
					return {
						data: {
							data: { resumo: { totalMatches: 99 } },
							meta: { data: "2026-08-28T12:34:17.649Z" },
						},
					};
				}
				if (documentPath === "public_dashboard/agentes_match_os") {
					return {
						data: {
							data: { resumo: { totalMatches: 7 } },
							meta: { data: "2026-08-28T12:34:17.649Z" },
						},
					};
				}
				return null;
			}),
			getCollectionLatestUpdatedAt: vi.fn(async () =>
				new Date("2026-08-31T18:00:00.000Z"),
			),
			listAllDocuments: vi.fn(async () => {
				throw new Error("nao deve reconstruir durante importacao ativa");
			}),
		};
		const publicDashboard = loadPublicDashboard({ dbQuery, ordensRepository });

		const payload = await publicDashboard.buildPublicDashboard({
			matchDetail: true,
		});

		expect(payload.matchOS.data.resumo.totalMatches).toBe(99);
		expect(payload.agentesMatchOS.data.resumo.totalMatches).toBe(7);
		expect(ordensRepository.listAllDocuments).not.toHaveBeenCalled();
	});
});
