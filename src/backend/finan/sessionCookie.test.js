// SEC-004: sessao do Finan passa a viajar em cookie HttpOnly em vez de
// token Bearer guardado em localStorage. Testa isoladamente as funcoes de
// cookie/token de apps/finan/backend/src/auth/middleware.js (mesmo padrao
// unitario ja usado e revisado em apps/rot/backend).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));

const middlewarePath = require.resolve("./src/auth/middleware.js");
const dbPath = require.resolve("./src/db.js");

const originalEnv = { ...process.env };

function loadMiddleware(dbQuery) {
	delete require.cache[middlewarePath];
	delete require.cache[dbPath];
	require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: dbQuery } };
	return require("./src/auth/middleware.js");
}

function fakeRes() {
	const cookies = {};
	const cleared = [];
	return {
		cookie: vi.fn((name, value, options) => {
			cookies[name] = { value, options };
		}),
		clearCookie: vi.fn((name) => {
			cleared.push(name);
			delete cookies[name];
		}),
		cookies,
		cleared,
	};
}

function reqWithCookie(token) {
	return { headers: { cookie: `finan_session=${encodeURIComponent(token)}` } };
}

function reqWithBearer(token) {
	return { headers: { authorization: `Bearer ${token}` } };
}

describe("SEC-004: sessão do Finan em cookie HttpOnly", () => {
	afterEach(() => {
		delete require.cache[middlewarePath];
		delete require.cache[dbPath];
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
	});

	it("setFinanSessionCookie grava um cookie HttpOnly/Secure/SameSite=Strict", () => {
		process.env.NODE_ENV = "production";
		const auth = loadMiddleware(vi.fn());
		const res = fakeRes();

		auth.setFinanSessionCookie(res, "token-abc");

		expect(res.cookie).toHaveBeenCalledWith(
			"finan_session",
			"token-abc",
			expect.objectContaining({
				httpOnly: true,
				secure: true,
				sameSite: "strict",
				path: "/",
			}),
		);
	});

	it("clearFinanSessionCookie remove o cookie de sessão", () => {
		const auth = loadMiddleware(vi.fn());
		const res = fakeRes();

		auth.clearFinanSessionCookie(res);

		expect(res.clearCookie).toHaveBeenCalledWith("finan_session", expect.any(Object));
	});

	it("findUserByBearer autentica pelo cookie finan_session", async () => {
		const user = { id: "user-1", name: "Fulano", status: "ativo", permissions: [] };
		let expectedHash = "";
		const dbQuery = vi.fn(async (sql, params = []) => {
			const text = String(sql).toLowerCase();
			if (text.includes("from finan_sessions")) {
				expect(params[0]).toBe(expectedHash);
				return { rows: [user] };
			}
			return { rows: [] };
		});
		const auth = loadMiddleware(dbQuery);
		expectedHash = auth.tokenHash("token-abc");

		const found = await auth.findUserByBearer(reqWithCookie("token-abc"));
		expect(found).toEqual(expect.objectContaining({ id: "user-1" }));
	});

	it("cai para Authorization Bearer quando não há cookie (fallback legado)", async () => {
		const user = { id: "user-2", name: "Ciclana", status: "ativo", permissions: [] };
		const dbQuery = vi.fn(async () => ({ rows: [user] }));
		const auth = loadMiddleware(dbQuery);

		const found = await auth.findUserByBearer(reqWithBearer("token-legado"));
		expect(found).toEqual(expect.objectContaining({ id: "user-2" }));
	});

	it("ignora Authorization Bearer quando FINAN_ALLOW_LEGACY_BEARER=false, mas cookie continua funcionando", async () => {
		process.env.FINAN_ALLOW_LEGACY_BEARER = "false";
		const user = { id: "user-3", name: "Beltrano", status: "ativo", permissions: [] };
		const dbQuery = vi.fn(async () => ({ rows: [user] }));
		const auth = loadMiddleware(dbQuery);

		const viaBearer = await auth.findUserByBearer(reqWithBearer("token-x"));
		expect(viaBearer).toBeNull();

		const viaCookie = await auth.findUserByBearer(reqWithCookie("token-x"));
		expect(viaCookie).toEqual(expect.objectContaining({ id: "user-3" }));
	});

	it("sem cookie e sem header, não autentica", async () => {
		const auth = loadMiddleware(vi.fn(async () => ({ rows: [] })));
		const found = await auth.findUserByBearer({ headers: {} });
		expect(found).toBeNull();
	});
});
