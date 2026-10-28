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
});
