// Pendencias — alerta de CNPJ inativo na Receita (BrasilAPI), item 5 dos
// "proximos passos". Cobre: CNPJ inativo vira pendencia critica, CNPJ
// ativo nao aparece, e falha da BrasilAPI nunca quebra a rota inteira
// (best-effort de verdade).
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("GET /api/finan/pendencias — CNPJ inativo", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		const baseQuery = dbMock.query;
		dbMock.query = async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/distinct on \(cnpj_emissor\)/i.test(sql)) {
				return { rows: [{ cnpj_emissor: "24605227000129", fornecedor_nome: "Sempre Telecom" }] };
			}
			return baseQuery(text, params);
		};
		app = loadFinanApp(dbMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("CNPJ inativo na Receita vira pendencia critica com link pra Notas", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ razao_social: "SEMPRE TELECOM LTDA", descricao_situacao_cadastral: "BAIXADA" }),
			})),
		);
		dbMock.setSession(adminSession());
		const response = await request(app).get("/api/finan/pendencias").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		const item = response.body.items.find((i) => i.tipo === "cnpj_inativo");
		expect(item).toBeTruthy();
		expect(item.severidade).toBe("critico");
		expect(item.link).toBe("/notas");
		expect(item.titulo).toContain("Sempre Telecom");
	});

	it("CNPJ ativo na Receita nao vira pendencia", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ razao_social: "SEMPRE TELECOM LTDA", descricao_situacao_cadastral: "ATIVA" }),
			})),
		);
		dbMock.setSession(adminSession());
		const response = await request(app).get("/api/finan/pendencias").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.items.some((i) => i.tipo === "cnpj_inativo")).toBe(false);
	});

	it("BrasilAPI fora do ar nao quebra a rota de pendencias (best-effort)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, status: 503 })),
		);
		dbMock.setSession(adminSession());
		const response = await request(app).get("/api/finan/pendencias").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.items.some((i) => i.tipo === "cnpj_inativo")).toBe(false);
	});
});
