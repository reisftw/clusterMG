import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const { assertIsTestDatabase } = finanRequire("./scripts/testDatabaseGuard.js");

describe("scripts/testDatabaseGuard", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("aceita banco de teste local com NODE_ENV=test", () => {
		process.env.NODE_ENV = "test";
		expect(() =>
			assertIsTestDatabase({ connectionString: "postgres://finan_test:x@127.0.0.1:55432/finan_test" }),
		).not.toThrow();
	});

	it("recusa quando NODE_ENV nao e test, mesmo com nome de banco de teste", () => {
		process.env.NODE_ENV = "production";
		expect(() =>
			assertIsTestDatabase({ connectionString: "postgres://x:y@127.0.0.1:55432/finan_test" }),
		).toThrow(/Recusando operar/);
	});

	it("recusa banco de producao mesmo com NODE_ENV=test (protecao contra URL errada no ambiente)", () => {
		process.env.NODE_ENV = "test";
		expect(() =>
			assertIsTestDatabase({ connectionString: "postgres://finan:x@db.producao.internal:5432/finan" }),
		).toThrow(/Recusando operar/);
	});

	it("recusa host remoto mesmo com nome de banco contendo 'test'", () => {
		process.env.NODE_ENV = "test";
		expect(() =>
			assertIsTestDatabase({ connectionString: "postgres://x:y@vps-producao.example.com:5432/finan_test" }),
		).toThrow(/Recusando operar/);
	});
});
