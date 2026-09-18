// categoria: rate-limit
// Prova que /auth/login tem um limite dedicado (mais restrito que o
// rateLimit global de 600/min do app.js), impedindo um brute-force
// pratico de senha. Nao usa nenhuma credencial real — todas as tentativas
// usam corpo invalido de proposito, o que basta pra provar que o limite
// dispara antes mesmo de qualquer lookup no banco.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import process from "node:process";
import { createFinanDbMock, loadFinanApp, sessionWithPermissions } from "../testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("security/rate-limit: POST /auth/login", () => {
	let app;

	beforeEach(() => {
		process.env.FINAN_LOGIN_RATE_LIMIT = "3";
		const dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	}, 30000);

	it("bloqueia com 429 depois do limite de tentativas, mesmo com credenciais nunca validas", async () => {
		const attempt = () =>
			request(app).post("/api/finan/auth/login").send({ email: "", password: "" });

		const first = await attempt();
		const second = await attempt();
		const third = await attempt();
		const fourth = await attempt();

		// as 3 primeiras (limite configurado) caem no 400 normal de "informe
		// e-mail e senha" — o rate limit ainda nao bloqueou.
		expect(first.status).toBe(400);
		expect(second.status).toBe(400);
		expect(third.status).toBe(400);
		// a 4a estoura o limite antes de a rota nem rodar.
		expect(fourth.status).toBe(429);
		expect(fourth.body.ok).toBe(false);
	});
});

describe("security/rate-limit: POST /auth/pin/verify", () => {
	let app;

	beforeEach(() => {
		process.env.FINAN_PIN_RATE_LIMIT = "3";
		const dbMock = createFinanDbMock({ session: sessionWithPermissions([]) });
		app = loadFinanApp(dbMock);
	}, 30000);

	it("bloqueia com 429 depois do limite, mesmo com PIN sempre invalido", async () => {
		const attempt = () =>
			request(app)
				.post("/api/finan/auth/pin/verify")
				.set("Authorization", BEARER)
				.send({ pin: "abc" }); // formato invalido -> 400 normal ate o limite estourar

		const first = await attempt();
		const second = await attempt();
		const third = await attempt();
		const fourth = await attempt();

		expect(first.status).toBe(400);
		expect(second.status).toBe(400);
		expect(third.status).toBe(400);
		expect(fourth.status).toBe(429);
		expect(fourth.body.ok).toBe(false);
	});
});

describe("security/rate-limit: POST /auth/pin/recover/request", () => {
	let app;

	beforeEach(() => {
		process.env.FINAN_PIN_RECOVERY_RATE_LIMIT = "3";
		const dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	}, 30000);

	it("bloqueia com 429 depois do limite, mesmo sem e-mail informado", async () => {
		const attempt = () =>
			request(app).post("/api/finan/auth/pin/recover/request").send({});

		const first = await attempt();
		const second = await attempt();
		const third = await attempt();
		const fourth = await attempt();

		expect(first.status).toBe(400);
		expect(second.status).toBe(400);
		expect(third.status).toBe(400);
		expect(fourth.status).toBe(429);
		expect(fourth.body.ok).toBe(false);
	});
});
