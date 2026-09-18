// Refatoração do menu lateral do Finan — contadores agregados dos badges
// (Pendências/Caixa de Entrada/Notificações). Cobre: exige autenticação,
// cada chave só aparece se o usuário tiver a permissão de visualização
// correspondente, e "notificacoes" sempre vem (já é filtrado por usuário
// dentro do proprio notificationsService).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("GET /api/finan/navegacao/contadores", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	});

	it("exige autenticacao", async () => {
		dbMock.setSession(null);
		const response = await request(app).get("/api/finan/navegacao/contadores").set("Authorization", BEARER);
		expect(response.status).toBe(401);
	});

	it("sem nenhuma permissao, so retorna o contador de notificacoes", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const response = await request(app).get("/api/finan/navegacao/contadores").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		expect(response.body.contadores).toHaveProperty("notificacoes");
		expect(response.body.contadores).not.toHaveProperty("pendencias");
		expect(response.body.contadores).not.toHaveProperty("caixaEntrada");
	});

	it("com finan.pendencias.view, retorna o contador de pendencias", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.pendencias.view"]));
		const response = await request(app).get("/api/finan/navegacao/contadores").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.contadores).toHaveProperty("pendencias");
		expect(response.body.contadores).not.toHaveProperty("caixaEntrada");
	});

	it("com finan.notas.view, retorna o contador de caixa de entrada", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.notas.view"]));
		const response = await request(app).get("/api/finan/navegacao/contadores").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.contadores).toHaveProperty("caixaEntrada");
		expect(response.body.contadores).not.toHaveProperty("pendencias");
	});

	it("admin ve os 3 contadores", async () => {
		dbMock.setSession(adminSession());
		const response = await request(app).get("/api/finan/navegacao/contadores").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.contadores).toHaveProperty("pendencias");
		expect(response.body.contadores).toHaveProperty("caixaEntrada");
		expect(response.body.contadores).toHaveProperty("notificacoes");
	});
});
