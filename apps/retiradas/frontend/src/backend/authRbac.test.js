import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const authPath = require.resolve("./api/src/auth.js");
const dbPath = require.resolve("./api/src/db.js");
const rolePermissionsPath = require.resolve("./api/src/rolePermissions.js");
const usersRepositoryPath = require.resolve("./api/src/usersRepository.js");

const originalEnv = { ...process.env };

function createReq({ token = "", role = "admin", headers = {} } = {}) {
	const normalizedHeaders = Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
	);
	if (token) normalizedHeaders.authorization = `Bearer ${token}`;
	return {
		get(name) {
			return normalizedHeaders[String(name || "").toLowerCase()] || "";
		},
		user: role ? { role } : null,
	};
}

function createRes() {
	return {
		statusCode: 200,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = payload;
			return this;
		},
	};
}

function clearAuthModules() {
	delete require.cache[authPath];
	delete require.cache[dbPath];
	delete require.cache[rolePermissionsPath];
	delete require.cache[usersRepositoryPath];
}

function loadAuthWithDb(dbQuery) {
	clearAuthModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: {
			query: dbQuery,
			runWithRequestContext: (_user, callback) => callback(),
		},
	};
	require.cache[rolePermissionsPath] = {
		id: rolePermissionsPath,
		filename: rolePermissionsPath,
		loaded: true,
		exports: {
			enrichUserWithPermissions: vi.fn(async (user) => ({
				...user,
				permissions: user.role === "admin" ? ["*"] : ["view_dashboard"],
			})),
		},
	};
	return require("./api/src/auth.js");
}

function buildDbQuery({ user, profile, sessionActive = true }) {
	return vi.fn(async (sql, params = []) => {
		const text = String(sql).replace(/\s+/g, " ").toLowerCase();
		const normalizedUser = {
			...user,
			imported_profile: profile,
		};
		if (
			text.includes("from app_users") &&
			text.includes("lower(trim(email))")
		) {
			return { rows: params[0] === user.email ? [normalizedUser] : [] };
		}
		if (text.includes("from app_users") && text.includes("where uid = $1")) {
			return { rows: params[0] === user.uid ? [normalizedUser] : [] };
		}
		if (text.includes("update app_users") && text.includes("last_login_at")) {
			return {
				rows: [
					{
						last_login_at: "2026-08-25T10:00:00.000Z",
						last_login_ip: "",
						last_login_user_agent: "",
					},
				],
			};
		}
		if (text.includes("insert into app_sessions")) return { rows: [] };
		if (text.includes("delete from app_sessions")) return { rows: [] };
		if (text.includes("insert into app_documents")) return { rows: [] };
		if (text.includes("from app_sessions"))
			return { rows: sessionActive ? [{ jti: params[0] }] : [] };
		return { rows: [] };
	});
}

describe("auth/RBAC isolated security tests", () => {
	beforeEach(() => {
		process.env = {
			...originalEnv,
			APP_AUTH_SECRET: "01234567890123456789012345678901",
			APP_AUTH_SECRET_ID: "test",
			AUTH_REQUEST_CACHE_TTL_MS: "0",
		};
	});

	afterEach(() => {
		clearAuthModules();
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
	});

	it("login accepts valid credentials and rejects invalid credentials", async () => {
		let auth = loadAuthWithDb(vi.fn(async () => ({ rows: [] })));
		const passwordData = await auth.hashPassword("SenhaForte123!");
		const user = {
			uid: "user-1",
			email: "admin@example.com",
			display_name: "Admin",
			role: "admin",
			regional: "Metropolitana SUB2",
			session_version: 1,
			disabled: false,
			must_change_password: false,
			password_hash: passwordData.passwordHash,
			password_salt: passwordData.passwordSalt,
			password_algorithm: passwordData.passwordAlgorithm,
		};
		const profile = {
			id: "user-1",
			email: user.email,
			nome: "Admin",
			role: "admin",
		};
		auth = loadAuthWithDb(buildDbQuery({ user, profile }));

		await expect(
			auth.loginWithPassword(user.email, "SenhaForte123!"),
		).resolves.toMatchObject({
			expiresIn: auth.TOKEN_TTL_SECONDS,
			user: { id: "user-1", role: "admin" },
		});
		await expect(
			auth.loginWithPassword(user.email, "senha-errada"),
		).rejects.toThrow("E-mail ou senha invalidos.");
	});

	it("requireAuthenticated blocks missing, invalid and revoked sessions", async () => {
		let auth = loadAuthWithDb(vi.fn(async () => ({ rows: [] })));
		const passwordData = await auth.hashPassword("SenhaForte123!");
		const user = {
			uid: "user-1",
			email: "admin@example.com",
			display_name: "Admin",
			role: "admin",
			regional: "Metropolitana SUB2",
			session_version: 1,
			disabled: false,
			must_change_password: false,
			password_hash: passwordData.passwordHash,
			password_salt: passwordData.passwordSalt,
			password_algorithm: passwordData.passwordAlgorithm,
		};
		const profile = {
			id: "user-1",
			email: user.email,
			nome: "Admin",
			role: "admin",
		};
		auth = loadAuthWithDb(buildDbQuery({ user, profile }));
		const session = await auth.loginWithPassword(user.email, "SenhaForte123!");

		const missingRes = createRes();
		await auth.requireAuthenticated(
			createReq({ token: "" }),
			missingRes,
			vi.fn(),
		);
		expect(missingRes.statusCode).toBe(401);

		const invalidRes = createRes();
		await auth.requireAuthenticated(
			createReq({ token: "token-invalido" }),
			invalidRes,
			vi.fn(),
		);
		expect(invalidRes.statusCode).toBe(401);

		auth = loadAuthWithDb(
			buildDbQuery({ user, profile, sessionActive: false }),
		);
		const revokedRes = createRes();
		await auth.requireAuthenticated(
			createReq({ token: session.token }),
			revokedRes,
			vi.fn(),
		);
		expect(revokedRes.statusCode).toBe(401);
	});

	it("requireAuthenticated accepts active sessions and requireRoles blocks privilege escalation", async () => {
		let auth = loadAuthWithDb(vi.fn(async () => ({ rows: [] })));
		const passwordData = await auth.hashPassword("SenhaForte123!");
		const user = {
			uid: "user-1",
			email: "user@example.com",
			display_name: "Visitante",
			role: "visitante",
			regional: "Metropolitana SUB2",
			session_version: 1,
			disabled: false,
			must_change_password: false,
			password_hash: passwordData.passwordHash,
			password_salt: passwordData.passwordSalt,
			password_algorithm: passwordData.passwordAlgorithm,
		};
		const profile = {
			id: "user-1",
			email: user.email,
			nome: "Visitante",
			role: "visitante",
		};
		auth = loadAuthWithDb(buildDbQuery({ user, profile }));
		const session = await auth.loginWithPassword(user.email, "SenhaForte123!");

		const req = createReq({ token: session.token, role: "" });
		const res = createRes();
		const next = vi.fn();
		await auth.requireAuthenticated(req, res, next);
		expect(next).toHaveBeenCalledTimes(1);
		expect(req.user).toMatchObject({ uid: user.uid, role: "visitante" });

		const deniedRes = createRes();
		auth.requireRoles(["admin"])(req, deniedRes, vi.fn());
		expect(deniedRes.statusCode).toBe(403);

		const allowedNext = vi.fn();
		auth.requireRoles(["visitante", "admin"])(req, createRes(), allowedNext);
		expect(allowedNext).toHaveBeenCalledTimes(1);
	});
});
