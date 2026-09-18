// Testes do PIN de bloqueio de app (auto-atendimento): configurar, verificar,
// bloquear apos 3 erros e impedir login enquanto a conta estiver bloqueada.
// Nenhum PIN/senha usado aqui e uma credencial real — sao valores fixos so
// para o teste.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const dbPath = finanRequire.resolve("./src/db.js");
const appPath = finanRequire.resolve("./src/app.js");
// argon2 so existe como dependencia do workspace apps/finan/backend, nao na
// raiz — precisa ser resolvido pelo mesmo require apontado pra la.
const argon2 = finanRequire("argon2");

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
	process.env.FINAN_LOGIN_RATE_LIMIT = "100000";
	process.env.FINAN_PIN_RATE_LIMIT = "100000";
	process.env.FINAN_PIN_SETUP_RATE_LIMIT = "100000";
	process.env.FINAN_PIN_RECOVERY_RATE_LIMIT = "100000";
	process.env.FINAN_MFA_EMAIL_ENABLED = "false"; // simplifica o teste de login: sem 2a etapa de MFA
	const { createApp } = finanRequire(appPath);
	return createApp();
}

// Mock de banco dedicado a este arquivo: o mock generico de testUtils.js nao
// modela finan_users/finan_pin_recovery, entao construimos um aqui que
// mantem um unico "usuario" mutavel e reage as queries que as rotas de PIN
// realmente emitem.
function createPinDbMock(user) {
	let current = user;

	const query = vi.fn(async (text) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/from finan_sessions/i.test(sql)) {
			return { rows: current ? [current] : [] };
		}
		if (/where lower\(u\.email\) = lower\(\$1\)/i.test(sql)) {
			return { rows: current ? [current] : [] };
		}
		if (/set pin_failed_attempts = pin_failed_attempts \+ 1/i.test(sql)) {
			if (current) current.pin_failed_attempts = (current.pin_failed_attempts || 0) + 1;
			return { rows: [{ pin_failed_attempts: current?.pin_failed_attempts || 0 }] };
		}
		if (/set pin_failed_attempts = 0 where id/i.test(sql)) {
			if (current) current.pin_failed_attempts = 0;
			return { rows: [] };
		}
		if (/set pin_locked_at = now\(\) where id/i.test(sql)) {
			if (current) current.pin_locked_at = new Date();
			return { rows: [] };
		}
		if (/update finan_sessions set revoked_at/i.test(sql)) {
			return { rows: [] };
		}
		if (/insert into finan_pin_recovery/i.test(sql)) {
			return { rows: [] };
		}
		if (/set pin_hash = \$1, pin_secret_word_hash = \$2/i.test(sql)) {
			return { rows: [] };
		}
		if (/select value from finan_settings/i.test(sql)) {
			return { rows: [] };
		}
		if (/insert into finan_email_logs/i.test(sql)) {
			return { rows: [] };
		}
		return { rows: [] };
	});

	return {
		query,
		connect: vi.fn(async () => ({ query, release: vi.fn() })),
		closePool: vi.fn(async () => {}),
		setUser(next) {
			current = next;
		},
	};
}

function baseUser(overrides = {}) {
	return {
		id: "user-1",
		name: "Usuario Teste",
		email: "teste@example.com",
		role_id: "analista_financeiro",
		status: "ativo",
		permissions: [],
		is_admin: false,
		hierarchy_level: 999,
		pin_hash: null,
		pin_secret_word_hash: null,
		pin_failed_attempts: 0,
		pin_locked_at: null,
		...overrides,
	};
}

describe("PIN de bloqueio: auto-atendimento", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createPinDbMock(baseUser());
		app = loadFinanApp(dbMock);
	}, 30000);

	afterEach(() => {
		dbMock = null;
		app = null;
	});

	it("GET /pin/status -> configured false quando ainda nao ha PIN", async () => {
		const response = await request(app)
			.get("/api/finan/auth/pin/status")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.configured).toBe(false);
	});

	it("GET /pin/status -> configured true quando ja existe pin_hash", async () => {
		dbMock.setUser(baseUser({ pin_hash: "hash-qualquer" }));
		const response = await request(app)
			.get("/api/finan/auth/pin/status")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.configured).toBe(true);
	});

	it("POST /pin/setup rejeita PIN fora do padrao de 6 digitos", async () => {
		const response = await request(app)
			.post("/api/finan/auth/pin/setup")
			.set("Authorization", BEARER)
			.send({ pin: "123", secretWord: "palavra" });
		expect(response.status).toBe(400);
	});

	it("POST /pin/setup cria o PIN quando ainda nao existe (sem exigir currentPin)", async () => {
		const response = await request(app)
			.post("/api/finan/auth/pin/setup")
			.set("Authorization", BEARER)
			.send({ pin: "123456", secretWord: "palavra-secreta" });
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
	});

	it("POST /pin/setup exige o PIN atual correto quando ja existe um configurado", async () => {
		const existingHash = await argon2.hash("111111");
		dbMock.setUser(baseUser({ pin_hash: existingHash }));

		const wrongCurrent = await request(app)
			.post("/api/finan/auth/pin/setup")
			.set("Authorization", BEARER)
			.send({ pin: "222222", secretWord: "nova-palavra", currentPin: "999999" });
		expect(wrongCurrent.status).toBe(401);

		const rightCurrent = await request(app)
			.post("/api/finan/auth/pin/setup")
			.set("Authorization", BEARER)
			.send({ pin: "222222", secretWord: "nova-palavra", currentPin: "111111" });
		expect(rightCurrent.status).toBe(200);
	});

	it("POST /pin/verify: PIN correto libera; PIN errado 3x bloqueia a conta", async () => {
		const pinHash = await argon2.hash("654321");
		dbMock.setUser(baseUser({ pin_hash: pinHash }));

		const ok = await request(app)
			.post("/api/finan/auth/pin/verify")
			.set("Authorization", BEARER)
			.send({ pin: "654321" });
		expect(ok.status).toBe(200);
		expect(ok.body.ok).toBe(true);

		for (let attempt = 1; attempt <= 2; attempt += 1) {
			const wrong = await request(app)
				.post("/api/finan/auth/pin/verify")
				.set("Authorization", BEARER)
				.send({ pin: "000000" });
			expect(wrong.status).toBe(401);
			expect(wrong.body.attemptsRemaining).toBe(3 - attempt);
		}

		const thirdWrong = await request(app)
			.post("/api/finan/auth/pin/verify")
			.set("Authorization", BEARER)
			.send({ pin: "000000" });
		expect(thirdWrong.status).toBe(423);
		expect(thirdWrong.body.pinLocked).toBe(true);

		const afterLock = await request(app)
			.post("/api/finan/auth/pin/verify")
			.set("Authorization", BEARER)
			.send({ pin: "654321" }); // ate o PIN certo nao passa mais
		expect(afterLock.status).toBe(423);
	});

	it("POST /pin/recover/request sempre responde generico (sem confirmar se o e-mail existe)", async () => {
		const response = await request(app)
			.post("/api/finan/auth/pin/recover/request")
			.send({ email: "nao-existe@example.com" });
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
	});
});

describe("PIN de bloqueio: login bloqueado quando a conta esta com pin_locked_at", () => {
	let passwordHash;

	beforeAll(async () => {
		passwordHash = await argon2.hash("Senha-Forte-123");
	}, 30000);

	it("POST /login retorna 423 e nao dispara MFA quando pin_locked_at esta setado", async () => {
		const dbMock = createPinDbMock(
			baseUser({ password_hash: passwordHash, pin_locked_at: new Date() }),
		);
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.post("/api/finan/auth/login")
			.send({ email: "teste@example.com", password: "Senha-Forte-123" });
		expect(response.status).toBe(423);
		expect(response.body.pinLocked).toBe(true);
	});

	it("POST /login funciona normalmente quando pin_locked_at e nulo", async () => {
		const dbMock = createPinDbMock(
			baseUser({ password_hash: passwordHash, pin_locked_at: null }),
		);
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.post("/api/finan/auth/login")
			.send({ email: "teste@example.com", password: "Senha-Forte-123" });
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
	});
});
