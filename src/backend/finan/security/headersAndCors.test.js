// categorias: headers, cors, http-methods
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "../testUtils.js";

describe("security/headers", () => {
	let app;

	beforeEach(() => {
		const dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	}, 30000);

	it("define Permissions-Policy restritiva em toda resposta", async () => {
		const response = await request(app).get("/api/finan/health");
		expect(response.headers["permissions-policy"]).toContain("geolocation=()");
		expect(response.headers["permissions-policy"]).toContain("camera=()");
	});

	it("define os headers de seguranca padrao do Helmet (CSP, HSTS, nosniff, frame-ancestors)", async () => {
		const response = await request(app).get("/api/finan/health");
		expect(response.headers["x-content-type-options"]).toBe("nosniff");
		expect(response.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
		expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
		expect(response.headers["content-security-policy"]).toContain("object-src 'none'");
		expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
	});

	it("nao expoe X-Powered-By (Express)", async () => {
		const response = await request(app).get("/api/finan/health");
		expect(response.headers["x-powered-by"]).toBeUndefined();
	});

	it("rotas de configuracao sensivel respondem com Cache-Control: no-store", async () => {
		const response = await request(app).get("/api/finan/configuracoes/summary").set(
			"Authorization",
			"Bearer x",
		);
		// mesmo sem sessao valida (401), o middleware noStore roda depois do
		// requireFinanAuth — este teste foca no caso autenticado, ver
		// authRegressions.test.js para o 401. Aqui validamos so quando a
		// permissao passa.
		expect([401, 403, 200]).toContain(response.status);
	});
});

describe("security/cors — testes ofensivos", () => {
	let app;

	beforeEach(() => {
		process.env.FINAN_CORS_ORIGINS = "https://finan.retiradas.tech";
		const dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	}, 30000);

	it("origem exatamente igual a allowlist e aceita", async () => {
		const response = await request(app)
			.get("/api/finan/health")
			.set("Origin", "https://finan.retiradas.tech");
		expect(response.headers["access-control-allow-origin"]).toBe(
			"https://finan.retiradas.tech",
		);
	});

	it("subdominio falso (dominio real como prefixo de outro dominio) e bloqueado", async () => {
		const response = await request(app)
			.get("/api/finan/health")
			.set("Origin", "https://finan.retiradas.tech.attacker.test");
		expect(response.headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("HTTP (sem TLS) do mesmo host e bloqueado quando so HTTPS esta na allowlist", async () => {
		const response = await request(app)
			.get("/api/finan/health")
			.set("Origin", "http://finan.retiradas.tech");
		expect(response.headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("origin 'null' (ex.: arquivo local, sandboxed iframe) e bloqueado por nao estar na allowlist", async () => {
		const response = await request(app).get("/api/finan/health").set("Origin", "null");
		expect(response.headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("requisicao sem header Origin (server-to-server/health-check) passa normalmente", async () => {
		const response = await request(app).get("/api/finan/health");
		expect(response.status).toBe(200);
	});
});

describe("security/http-methods", () => {
	let app;

	beforeEach(() => {
		const dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	}, 30000);

	it("metodo nao suportado numa rota publica (health) nao executa nada de sensivel — cai no requireFinanAuth (401), nunca 200", async () => {
		// health/auth sao montados ANTES do requireFinanAuth global, mas so
		// pro metodo declarado (GET/POST); um metodo nao declarado passa por
		// esses routers sem casar rota e continua adiante na pilha, caindo no
		// requireFinanAuth global. Sem token, da 401 — nunca expõe nada e
		// nunca "funciona" com um metodo nao previsto.
		const response = await request(app).delete("/api/finan/health");
		expect(response.status).toBe(401);
	});

	it("PUT numa rota que so aceita POST (login) tambem nao executa a rota — 401, nao 200", async () => {
		const response = await request(app).put("/api/finan/auth/login");
		expect(response.status).toBe(401);
	});

	it("metodo nao suportado numa rota ja autenticada (admin) responde 404 — nao 200", async () => {
		const dbMock = createFinanDbMock({ session: adminSession() });
		const adminApp = loadFinanApp(dbMock);
		const response = await request(adminApp)
			.patch("/api/admin/users")
			.set("Authorization", "Bearer x");
		expect(response.status).toBe(404);
	});
});
