// Testes de regressao de autenticacao/autorizacao para apps/finan/backend.
//
// Cobre especificamente os endpoints que tinham a vulnerabilidade
// corrigida na auditoria anterior (GET protegido apenas por
// `requireFinanAuth`, sem checar a permissao que o PUT/POST irmao exige) e
// confirma que segredos (token/secret/clientSecret) nunca voltam em texto
// puro. Nenhum valor usado aqui e uma credencial real.
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	FAKE_SECRETS,
	adminSession,
	createFinanDbMock,
	loadFinanApp,
	sessionWithPermissions,
} from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

// Endpoint | permissao exigida hoje | asserts extras no corpo da resposta
const REGRESSION_ENDPOINTS = [
	{
		name: "GET /admin/hubsoft/config",
		method: "get",
		path: "/api/admin/hubsoft/config",
		permission: "finan.integracoes.view",
		assertNoSecret: (body) => {
			expect(body.config.token).not.toBe(FAKE_SECRETS.integrationToken);
			expect(body.config.secret).not.toBe(FAKE_SECRETS.integrationSecret);
		},
	},
	{
		name: "GET /admin/cvortex/config",
		method: "get",
		path: "/api/admin/cvortex/config",
		permission: "finan.integracoes.view",
		assertNoSecret: (body) => {
			expect(body.config.token).not.toBe(FAKE_SECRETS.integrationToken);
			expect(body.config.secret).not.toBe(FAKE_SECRETS.integrationSecret);
		},
	},
	{
		name: "GET /admin/senior/config",
		method: "get",
		path: "/api/admin/senior/config",
		permission: "finan.integracoes.view",
		assertNoSecret: (body) => {
			expect(body.config.token).not.toBe(FAKE_SECRETS.integrationToken);
			expect(body.config.secret).not.toBe(FAKE_SECRETS.integrationSecret);
		},
	},
	{
		name: "GET /admin/oauth/:provider",
		method: "get",
		path: "/api/admin/oauth/google",
		permission: "finan.configuracoes.view",
		assertNoSecret: (body) => {
			expect(body.config.clientSecret).not.toBe(FAKE_SECRETS.oauthClientSecret);
		},
	},
	{
		name: "GET /admin/api-status",
		method: "get",
		path: "/api/admin/api-status",
		permission: "finan.configuracoes.view",
	},
	{
		name: "GET /admin/database/backups",
		method: "get",
		path: "/api/admin/database/backups",
		permission: "finan.configuracoes.view",
	},
	{
		name: "GET /admin/email/config",
		method: "get",
		path: "/api/admin/email/config",
		permission: "finan.configuracoes.view",
	},
	{
		name: "GET /admin/email/logs",
		method: "get",
		path: "/api/admin/email/logs",
		permission: "finan.configuracoes.view",
	},
	{
		name: "GET /admin/audit-logs",
		method: "get",
		path: "/api/admin/audit-logs",
		permission: "finan.configuracoes.view",
	},
	{
		name: "GET /admin/audit-logs/options",
		method: "get",
		path: "/api/admin/audit-logs/options",
		permission: "finan.configuracoes.view",
	},
	{
		name: "GET /admin/audit-logs/:id",
		method: "get",
		path: "/api/admin/audit-logs/audit-1",
		permission: "finan.configuracoes.view",
	},
];

describe("regressao: autorizacao dos endpoints /admin/* corrigidos", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	}, 30000); // primeira chamada carrega argon2 (binding nativo) + toda a arvore de rotas

	afterEach(() => {
		dbMock = null;
		app = null;
	});

	for (const endpoint of REGRESSION_ENDPOINTS) {
		describe(endpoint.name, () => {
			it("sem autenticacao -> 401", async () => {
				const response = await request(app)[endpoint.method](endpoint.path);
				expect(response.status).toBe(401);
				expect(response.body.ok).toBe(false);
			});

			it("autenticado sem a permissao exigida -> 403", async () => {
				dbMock.setSession(sessionWithPermissions([]));
				const response = await request(app)[endpoint.method](endpoint.path).set(
					"Authorization",
					BEARER,
				);
				expect(response.status).toBe(403);
				expect(response.body.ok).toBe(false);
			});

			it("autenticado com a permissao exigida -> acesso permitido", async () => {
				dbMock.setSession(sessionWithPermissions([endpoint.permission]));
				const response = await request(app)[endpoint.method](endpoint.path).set(
					"Authorization",
					BEARER,
				);
				expect(response.status).toBe(200);
				expect(response.body.ok).toBe(true);
				endpoint.assertNoSecret?.(response.body);
			});

			it("administrador -> acesso permitido mesmo sem a permissao especifica na lista", async () => {
				dbMock.setSession(adminSession());
				const response = await request(app)[endpoint.method](endpoint.path).set(
					"Authorization",
					BEARER,
				);
				expect(response.status).toBe(200);
				expect(response.body.ok).toBe(true);
				endpoint.assertNoSecret?.(response.body);
			});
		});
	}
});

describe("regressao: sessao invalida/expirada", () => {
	it("token presente mas sem sessao correspondente -> 401 (nao 500)", async () => {
		const dbMock = createFinanDbMock({ session: null });
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.get("/api/admin/hubsoft/config")
			.set("Authorization", "Bearer token-que-nao-existe-mais");
		expect(response.status).toBe(401);
	});
});

describe("smoke test: outro router protegido (nao fazia parte da vulnerabilidade original)", () => {
	it("GET /api/finan/usuarios sem permissao -> 403", async () => {
		const dbMock = createFinanDbMock({ session: sessionWithPermissions([]) });
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.get("/api/finan/usuarios")
			.set("Authorization", BEARER);
		expect(response.status).toBe(403);
	});

	it("GET /api/finan/usuarios com finan.usuarios.manage -> 200", async () => {
		const dbMock = createFinanDbMock({
			session: sessionWithPermissions(["finan.usuarios.manage"]),
		});
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.get("/api/finan/usuarios")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
	});
});
