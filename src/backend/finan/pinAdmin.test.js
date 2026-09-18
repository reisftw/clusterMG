// Testes do gerenciamento de PIN de TERCEIROS (RBAC + hierarquia de
// cargos): so quem tem "finan.pin.manage" pode agir, e so sobre usuarios
// estritamente abaixo na hierarquia (nunca cargo igual/superior, nunca
// contra si mesmo). Nenhum PIN/hash usado aqui e uma credencial real.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const dbPath = finanRequire.resolve("./src/db.js");
const appPath = finanRequire.resolve("./src/app.js");

const BEARER = "Bearer qualquer-token-de-teste";

function clearFinanModuleCache() {
	for (const key of Object.keys(finanRequire.cache)) {
		if (key.includes(`${path.sep}apps${path.sep}finan${path.sep}backend${path.sep}`)) {
			delete finanRequire.cache[key];
		}
	}
}

function loadFinanApp(dbMock) {
	clearFinanModuleCache();
	finanRequire.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbMock };
	process.env.FINAN_RATE_LIMIT_PER_MINUTE = "100000";
	const { createApp } = finanRequire(appPath);
	return createApp();
}

function createPinAdminDbMock({ actor, targets = [] }) {
	const usersById = new Map([[actor.id, actor], ...targets.map((t) => [t.id, t])]);

	const query = vi.fn(async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/from finan_sessions/i.test(sql)) {
			return { rows: [actor] };
		}
		if (/from finan_users u\s+left join finan_roles r on r\.id = u\.role_id\s+where u\.id = \$1/i.test(sql)) {
			const target = usersById.get(params[0]);
			return {
				rows: target
					? [
							{
								id: target.id,
								name: target.name,
								email: target.email,
								pin_hash: target.pin_hash ?? null,
								pin_locked_at: target.pin_locked_at ?? null,
								hierarchy_level: target.hierarchy_level ?? 999,
							},
						]
					: [],
			};
		}
		if (/from finan_users u\s+left join finan_roles r on r\.id = u\.role_id\s+where u\.id != \$1/i.test(sql)) {
			const actorLevel = Number(params[1]);
			const rows = targets
				.filter((t) => Number(t.hierarchy_level ?? 999) > actorLevel)
				.map((t) => ({
					id: t.id,
					name: t.name,
					email: t.email,
					role_id: t.role_id || null,
					pin_configured: Boolean(t.pin_hash),
					pin_locked: Boolean(t.pin_locked_at),
					hierarchy_level: t.hierarchy_level ?? 999,
					role_name: t.role_name || null,
				}));
			return { rows };
		}
		if (/set pin_locked_at = null, pin_failed_attempts = 0 where id/i.test(sql)) {
			const target = usersById.get(params[0]);
			if (target) {
				target.pin_locked_at = null;
				target.pin_failed_attempts = 0;
			}
			return { rows: [] };
		}
		if (/set pin_hash = null, pin_secret_word_hash = null/i.test(sql)) {
			const target = usersById.get(params[0]);
			if (target) {
				target.pin_hash = null;
				target.pin_secret_word_hash = null;
				target.pin_configured_at = null;
				target.pin_failed_attempts = 0;
				target.pin_locked_at = null;
			}
			return { rows: [] };
		}
		if (/insert into finan_audit_logs/i.test(sql)) {
			return { rows: [] };
		}
		return { rows: [] };
	});

	return {
		query,
		connect: vi.fn(async () => ({ query, release: vi.fn() })),
		closePool: vi.fn(async () => {}),
	};
}

function actorWithPermission({ id = "gerente-1", hierarchyLevel = 10, permissions = ["finan.pin.manage"], isAdmin = false } = {}) {
	return {
		id,
		name: "Gerente",
		email: "gerente@example.com",
		role_id: "gerente",
		status: "ativo",
		permissions,
		is_admin: isAdmin,
		hierarchy_level: hierarchyLevel,
	};
}

function targetUser({ id = "subordinado-1", hierarchyLevel = 500, pinHash = "hash-fake", pinLockedAt = new Date() } = {}) {
	return {
		id,
		name: "Subordinado",
		email: "subordinado@example.com",
		role_id: "analista",
		hierarchy_level: hierarchyLevel,
		pin_hash: pinHash,
		pin_locked_at: pinLockedAt,
	};
}

// timeout maior: loadFinanApp re-requer a arvore inteira de apps/finan/
// backend (app.js hoje monta ~20 routers) a cada teste, pra isolamento —
// o default de 5s fica justo sob contencao de CPU (suite completa/CI).
describe("Gerenciamento de PIN de terceiros: permissao RBAC", { timeout: 15000 }, () => {
	let app;

	afterEach(() => {
		app = null;
	});

	it("sem a permissao finan.pin.manage -> 403 em qualquer rota", async () => {
		const actor = actorWithPermission({ permissions: [] });
		const target = targetUser();
		app = loadFinanApp(createPinAdminDbMock({ actor, targets: [target] }));

		const responses = await Promise.all([
			request(app).get("/api/finan/pin-admin/users").set("Authorization", BEARER),
			request(app).post(`/api/finan/pin-admin/${target.id}/unlock`).set("Authorization", BEARER),
			request(app).post(`/api/finan/pin-admin/${target.id}/reset`).set("Authorization", BEARER),
		]);
		for (const response of responses) {
			expect(response.status).toBe(403);
		}
	});

	it("com a permissao mas alvo em cargo igual/superior (hierarchy_level <= do ator) -> 403", async () => {
		const actor = actorWithPermission({ hierarchyLevel: 10 });
		const peer = targetUser({ id: "colega-1", hierarchyLevel: 10 }); // mesmo nivel
		const boss = targetUser({ id: "chefe-1", hierarchyLevel: 1 }); // nivel superior (numero menor)
		app = loadFinanApp(createPinAdminDbMock({ actor, targets: [peer, boss] }));

		const peerResponse = await request(app)
			.post(`/api/finan/pin-admin/${peer.id}/unlock`)
			.set("Authorization", BEARER);
		expect(peerResponse.status).toBe(403);

		const bossResponse = await request(app)
			.post(`/api/finan/pin-admin/${boss.id}/unlock`)
			.set("Authorization", BEARER);
		expect(bossResponse.status).toBe(403);
	});

	it("nao pode gerenciar o proprio PIN por esta rota (mesmo com a permissao) -> 400", async () => {
		const actor = actorWithPermission();
		app = loadFinanApp(createPinAdminDbMock({ actor, targets: [] }));

		const response = await request(app)
			.post(`/api/finan/pin-admin/${actor.id}/reset`)
			.set("Authorization", BEARER);
		expect(response.status).toBe(400);
	});

	it("com a permissao e alvo estritamente abaixo na hierarquia -> desbloqueia e reseta com sucesso", async () => {
		const actor = actorWithPermission({ hierarchyLevel: 10 });
		const target = targetUser({ hierarchyLevel: 500, pinLockedAt: new Date() });
		app = loadFinanApp(createPinAdminDbMock({ actor, targets: [target] }));

		const unlock = await request(app)
			.post(`/api/finan/pin-admin/${target.id}/unlock`)
			.set("Authorization", BEARER);
		expect(unlock.status).toBe(200);
		expect(unlock.body.ok).toBe(true);
		expect(target.pin_locked_at).toBeNull();

		const reset = await request(app)
			.post(`/api/finan/pin-admin/${target.id}/reset`)
			.set("Authorization", BEARER);
		expect(reset.status).toBe(200);
		expect(target.pin_hash).toBeNull();
		expect(target.pin_secret_word_hash).toBeNull();
	});

	it("GET /pin-admin/users so lista quem esta estritamente abaixo na hierarquia", async () => {
		const actor = actorWithPermission({ hierarchyLevel: 10 });
		const subordinate = targetUser({ id: "sub-1", hierarchyLevel: 500 });
		const peer = targetUser({ id: "peer-1", hierarchyLevel: 10 });
		const boss = targetUser({ id: "boss-1", hierarchyLevel: 1 });
		app = loadFinanApp(
			createPinAdminDbMock({ actor, targets: [subordinate, peer, boss] }),
		);

		const response = await request(app)
			.get("/api/finan/pin-admin/users")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		const ids = response.body.users.map((user) => user.id);
		expect(ids).toEqual(["sub-1"]);
	});

	it("nenhuma resposta vaza pin_hash/pin_secret_word_hash", async () => {
		const actor = actorWithPermission({ hierarchyLevel: 10 });
		const target = targetUser({ hierarchyLevel: 500 });
		app = loadFinanApp(createPinAdminDbMock({ actor, targets: [target] }));

		const usersResponse = await request(app)
			.get("/api/finan/pin-admin/users")
			.set("Authorization", BEARER);
		const bodyText = JSON.stringify(usersResponse.body);
		expect(bodyText).not.toMatch(/pin_hash":"/);
		expect(bodyText).not.toMatch(/pin_secret_word_hash/);
	});
});
