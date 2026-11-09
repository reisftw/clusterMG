import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const modulePath = require.resolve("./api/src/operationalImports.js");
const dbPath = require.resolve("./api/src/db.js");

function loadOperationalImports() {
	delete require.cache[modulePath];
	delete require.cache[dbPath];
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query: vi.fn(), connect: vi.fn() },
	};
	return require("./api/src/operationalImports.js");
}

describe("operationalImports estoque Onnet", () => {
	afterEach(() => {
		delete require.cache[modulePath];
		delete require.cache[dbPath];
		vi.restoreAllMocks();
	});

	it("aceita e preserva identificador alfanumerico Onnet", () => {
		const { formatOnnetStockIdentifier, normalizeOnnetStockIdentifier } =
			loadOperationalImports();

		expect(normalizeOnnetStockIdentifier("fhtt99f06b30")).toBe("FHTT99F06B30");
		expect(formatOnnetStockIdentifier("fhtt99f06b30")).toBe("FHTT99F06B30");
	});

	it("continua formatando MAC hexadecimal em pares", () => {
		const { formatOnnetStockIdentifier } = loadOperationalImports();
		expect(formatOnnetStockIdentifier("a8-32-9a-00-00-00")).toBe(
			"A8:32:9A:00:00:00",
		);
	});

	it("contabiliza somente lançamentos elegíveis no mês correto", () => {
		const { buildOnnetStockManualSnapshot } = loadOperationalImports();
		const snapshot = buildOnnetStockManualSnapshot([
			{ data: { cidade: "Betim", dataEntrega: "2026-11-03", mac: "A8329A000001", tecnicoNome: "Técnico A" } },
			{ data: { cidade: "Betim", dataEntrega: "2026-11-04", mac: "A8329A000002", tecnicoNome: "Técnico A" } },
			{ data: { cidade: "Betim", dataEntrega: "2026-10-31", mac: "A8329A000003", tecnicoNome: "Técnico B" } },
			{ data: { cidade: "", dataEntrega: "2026-11-05", mac: "A8329A000004", tecnicoNome: "Técnico B" } },
		], "Novembro", 2026);

		expect(snapshot.total).toBe(2);
		expect(snapshot.rawDays).toEqual([
			expect.objectContaining({ dia: 3, equipe: 1, totalDia: 1 }),
			expect.objectContaining({ dia: 4, equipe: 1, totalDia: 1 }),
		]);
		expect(snapshot.technicians[0]).toEqual(expect.objectContaining({ name: "Técnico A", total: 2 }));
	});
});
