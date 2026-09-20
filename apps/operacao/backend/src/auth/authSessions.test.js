const assert = require("node:assert/strict");
const test = require("node:test");

const middlewarePath = require.resolve("./middleware.js");
const dbPath = require.resolve("../db.js");

const originalEnv = { ...process.env };

function loadMiddleware(dbQuery) {
	delete require.cache[middlewarePath];
	delete require.cache[dbPath];
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query: dbQuery },
	};
	return require("./middleware.js");
}

function reqWithToken(token) {
	return {
		headers: { authorization: `Bearer ${token}` },
	};
}

function reqWithCookie(token) {
	return {
		headers: { cookie: `operacao_session=${encodeURIComponent(token)}` },
	};
}

test("revokes a server-side session on logout", async () => {
	process.env = {
		...originalEnv,
		NODE_ENV: "test",
		ROT_JWT_SECRET: "01234567890123456789012345678901",
		ROT_JWT_TTL: "1h",
		// Bearer e desabilitado por padrao (so cookie HttpOnly) — habilita
		// aqui de proposito pra continuar cobrindo o transporte legado.
		ROT_ALLOW_LEGACY_BEARER: "true",
	};

	try {
		const user = {
			id: "user-1",
			name: "Tecnico",
			username: "tecnico",
			email: "tecnico@example.com",
			role_id: "tech",
			role_name: "Tecnico",
			role_level: 10,
			is_global: false,
			regional_id: "regional-1",
			city_id: null,
			status: "ativo",
			permissions: ["rot.dashboard.view"],
			operation_scopes: ["ROT"],
			mfa_enabled: true,
		};
		const sessions = [];
		async function dbQuery(sql, params = []) {
			const text = String(sql).replace(/\s+/g, " ").toLowerCase();
			if (text.includes("insert into rot_sessions")) {
				sessions.push({
					id: params[0],
					userId: params[1],
					revoked: false,
				});
				return { rows: [] };
			}
			if (text.includes("delete from rot_sessions")) return { rows: [] };
			if (text.includes("update rot_sessions")) {
				const session = sessions.find(
					(item) => item.id === params[0] && item.userId === params[1],
				);
				if (session) session.revoked = true;
				return { rows: [] };
			}
			if (text.includes("from rot_sessions")) {
				const session = sessions.find(
					(item) => item.id === params[0] && item.userId === params[1],
				);
				return { rows: session && !session.revoked ? [{ id: session.id }] : [] };
			}
			if (text.includes("from rot_users u")) {
				return { rows: params[0] === user.id ? [user] : [] };
			}
			return { rows: [] };
		}
		const auth = loadMiddleware(dbQuery);

		const token = await auth.signSession(user);
		const byBearer = await auth.findUserByBearer(reqWithToken(token));
		assert.equal(byBearer.id, user.id);
		const byCookie = await auth.findUserByBearer(reqWithCookie(token));
		assert.equal(byCookie.id, user.id);

		await auth.revokeRotSession(reqWithCookie(token));

		assert.equal(await auth.findUserByBearer(reqWithToken(token)), null);
		assert.equal(await auth.findUserByBearer(reqWithCookie(token)), null);
	} finally {
		delete require.cache[middlewarePath];
		delete require.cache[dbPath];
		process.env = { ...originalEnv };
	}
});
