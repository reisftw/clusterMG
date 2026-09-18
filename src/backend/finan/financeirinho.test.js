// Financeirinho v2 (assistente com IA real via Gemini, tool use restrito
// aos dados do Finan). Cobre: exige autenticacao/permissao, responde 503
// amigavel sem a chave configurada, e o fluxo feliz com o Gemini mockado
// (sem bater na API real em teste).
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("POST /api/finan/financeirinho/chat", { timeout: 15000 }, () => {
	let dbMock;
	let app;
	const originalApiKey = process.env.FINAN_GEMINI_API_KEY;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		const baseQuery = dbMock.query;
		dbMock.query = async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/insert into finan_financeirinho_conversas/i.test(sql)) {
				return { rows: [{ id: "fchat-teste", user_id: params?.[1] || null, titulo: "Conversa com o Financeirinho", created_at: new Date(), updated_at: new Date() }] };
			}
			return baseQuery(text, params);
		};
		app = loadFinanApp(dbMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		if (originalApiKey === undefined) delete process.env.FINAN_GEMINI_API_KEY;
		else process.env.FINAN_GEMINI_API_KEY = originalApiKey;
	});

	it("exige autenticacao", async () => {
		dbMock.setSession(null);
		const response = await request(app).post("/api/finan/financeirinho/chat").set("Authorization", BEARER).send({ mensagem: "oi" });
		expect(response.status).toBe(401);
	});

	it("sem FINAN_GEMINI_API_KEY configurada, responde 503 amigavel (nao derruba o processo)", async () => {
		delete process.env.FINAN_GEMINI_API_KEY;
		dbMock.setSession(adminSession());
		const response = await request(app).post("/api/finan/financeirinho/chat").set("Authorization", BEARER).send({ mensagem: "quanto temos pendente?" });
		expect(response.status).toBe(503);
		expect(response.body.ok).toBe(false);
	});

	it("com a chave configurada e o Gemini respondendo texto direto, salva e retorna a resposta", async () => {
		process.env.FINAN_GEMINI_API_KEY = "fake-key-de-teste";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					candidates: [{ content: { parts: [{ text: "Você tem 2 contas vencidas." }] } }],
				}),
			})),
		);
		dbMock.setSession(adminSession());
		const response = await request(app).post("/api/finan/financeirinho/chat").set("Authorization", BEARER).send({ mensagem: "tenho pendencia?" });
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		expect(response.body.resposta).toBe("Você tem 2 contas vencidas.");
		expect(response.body.conversaId).toBeTruthy();
	});

	it("quando o Gemini pede uma ferramenta, executa a tool e faz uma segunda chamada antes de responder", async () => {
		process.env.FINAN_GEMINI_API_KEY = "fake-key-de-teste";
		let call = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				call += 1;
				if (call === 1) {
					return {
						ok: true,
						json: async () => ({
							candidates: [{ content: { parts: [{ functionCall: { name: "consultarPendencias", args: {} } }] } }],
						}),
					};
				}
				return {
					ok: true,
					json: async () => ({
						candidates: [{ content: { parts: [{ text: "Encontrei 0 pendências." }] } }],
					}),
				};
			}),
		);
		dbMock.setSession(adminSession());
		const response = await request(app).post("/api/finan/financeirinho/chat").set("Authorization", BEARER).send({ mensagem: "tenho pendencia?" });
		expect(response.status).toBe(200);
		expect(response.body.resposta).toBe("Encontrei 0 pendências.");
		expect(response.body.ferramentasUsadas).toContain("consultarPendencias");
		expect(call).toBe(2);
	});

	it("rejeita mensagem vazia (400) e mensagem gigante alem do limite", async () => {
		process.env.FINAN_GEMINI_API_KEY = "fake-key-de-teste";
		dbMock.setSession(adminSession());
		const vazia = await request(app).post("/api/finan/financeirinho/chat").set("Authorization", BEARER).send({ mensagem: "" });
		expect(vazia.status).toBe(400);

		const gigante = await request(app)
			.post("/api/finan/financeirinho/chat")
			.set("Authorization", BEARER)
			.send({ mensagem: "a".repeat(3000) });
		expect(gigante.status).toBe(400);
	});

	it("usuario sem finan.dashboard.view leva 403", async () => {
		process.env.FINAN_GEMINI_API_KEY = "fake-key-de-teste";
		dbMock.setSession(sessionWithPermissions([]));
		const response = await request(app).post("/api/finan/financeirinho/chat").set("Authorization", BEARER).send({ mensagem: "oi" });
		expect(response.status).toBe(403);
	});
});
