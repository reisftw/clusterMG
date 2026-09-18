// categoria: estabilidade / tratamento de erro
// Auditoria completa do Finan (2026-09-09): 22 rotas async faziam
// await db.query/argon2/email sem try/catch. Em Express 4, uma promise
// rejeitada sem tratamento vira unhandled rejection e DERRUBA O PROCESSO
// NODE INTEIRO (nao so a request) — foi a causa raiz de um crash loop
// real de producao (27 restarts/24h em 2026-09-05, ver CLAUDE.md). As
// rotas mais graves eram POST /login, POST /mfa/email/verify,
// POST /password/forgot, POST /password/reset, GET /me, POST /logout
// (auth/routes.js) e GET /, GET /roles, GET /migration-snapshots
// (users/routes.js) — a MAIS critica de todas era o proprio login.
//
// Este teste prova que um erro de banco durante o login agora vira uma
// resposta HTTP tratada (500, JSON), em vez de propagar como unhandled
// rejection. Antes da correcao, esse mesmo cenario derrubava o processo
// inteiro (supertest nunca chegaria a receber resposta nenhuma).
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "../testUtils.js";

describe("estabilidade — erro de banco nao derruba o processo (rotas de auth/users)", { timeout: 15000 }, () => {
	it("POST /auth/login: erro de banco na consulta do usuario vira 500 tratado, nao um crash", async () => {
		const dbMock = createFinanDbMock({ session: null });
		dbMock.query = vi.fn(async () => {
			throw new Error("connection terminated unexpectedly");
		});
		const app = loadFinanApp(dbMock);

		const response = await request(app)
			.post("/api/finan/auth/login")
			.send({ email: "usuario@example.com", password: "senha12345" });

		// O que importa aqui NAO e o status exato, e sim que supertest
		// recebeu uma resposta HTTP de verdade (o processo continuou vivo
		// pra responder) em vez do erro propagar sem handler.
		expect(response.status).toBeGreaterThanOrEqual(500);
		expect(response.body.ok).toBe(false);
	});

	it("GET /finan/usuarios: erro de banco vira 500 tratado, nao um crash", async () => {
		const dbMock = createFinanDbMock({ session: adminSession() });
		const baseQuery = dbMock.query;
		dbMock.query = vi.fn(async (text, params) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			// Deixa a autenticacao (select ... from finan_sessions) passar
			// normalmente pelo mock padrao — so a listagem de usuarios falha.
			if (/from finan_users u\s*$/im.test(sql) || /select[\s\S]*from finan_users u\s*\n\s*order by/i.test(sql)) {
				throw new Error("connection terminated unexpectedly");
			}
			return baseQuery(text, params);
		});
		const app = loadFinanApp(dbMock);

		const response = await request(app).get("/api/finan/usuarios").set("Authorization", "Bearer qualquer-token-de-teste");

		expect(response.status).toBeGreaterThanOrEqual(500);
		expect(response.body.ok).toBe(false);
	});
});
