// Conciliação inteligente (#48) + Webhooks (#47) + extrato bancário
// via Importador Universal (#35). Cobre: parsing de data/valor
// flexível (planilha de extrato bancário real pode vir formatada de
// jeitos diferentes) e a pontuação de confiança da conciliação.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

process.env.FINAN_PGHOST = process.env.FINAN_PGHOST || "localhost";
process.env.FINAN_PGUSER = process.env.FINAN_PGUSER || "test";
process.env.FINAN_PGDATABASE = process.env.FINAN_PGDATABASE || "test";
const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
const BEARER = "Bearer qualquer-token-de-teste";

describe("importador/service — parsing flexivel de extrato bancario (#48)", () => {
	const { __testables } = finanRequire("./src/importador/service.js");
	const { parseCurrencyFlexible, parseDateFlexible } = __testables;

	it("valor em formato BR ('1.234,56') e US ('1234.56') dao o mesmo numero", () => {
		expect(parseCurrencyFlexible("1.234,56")).toBeCloseTo(1234.56, 2);
		expect(parseCurrencyFlexible("1234.56")).toBeCloseTo(1234.56, 2);
	});
	it("valor negativo (saida do banco) preserva o sinal", () => {
		expect(parseCurrencyFlexible("-500,00")).toBeCloseTo(-500, 2);
	});
	it("data BR (DD/MM/AAAA) vira ISO", () => {
		expect(parseDateFlexible("10/08/2026")).toBe("2026-08-10");
	});
	it("data ja em ISO passa direto", () => {
		expect(parseDateFlexible("2026-08-10")).toBe("2026-08-10");
	});
	it("texto que nao e nem data nem serial do Excel devolve null (nao inventa data)", () => {
		expect(parseDateFlexible("não é uma data")).toBeNull();
	});
});

function buildDbMock({ contasPagar = [], contasReceber = [], extratoRows = [] } = {}) {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	const conciliados = [];
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/from finan_extrato_bancario where conciliado = false/i.test(sql)) return { rows: extratoRows };
		if (/from finan_contas_pagar where status = 'pendente'/i.test(sql)) return { rows: contasPagar };
		if (/from finan_contas_receber where status = 'pendente'/i.test(sql)) return { rows: contasReceber };
		if (/update finan_contas_pagar set status/i.test(sql) || /update finan_contas_receber set status/i.test(sql)) {
			return { rows: [{ id: params[0] }] };
		}
		if (/update finan_extrato_bancario set/i.test(sql)) {
			conciliados.push(params[0]);
			return { rows: [] };
		}
		if (/^\s*(begin|commit|rollback)\s*$/i.test(sql)) return { rows: [] };
		return baseQuery(text, params);
	};
	dbMock.connect = async () => ({ query: (...args) => dbMock.query(...args), release: () => {} });
	dbMock.__conciliados = conciliados;
	return dbMock;
}

describe("GET /api/finan/conciliacao/sugestoes", () => {
	it("extrato com valor e data proximos de uma conta a pagar pendente vira sugestao de alta confianca", async () => {
		const dbMock = buildDbMock({
			extratoRows: [{ id: "ext1", data: "2026-08-10", descricao: "PIX CEMIG", valor: -500 }],
			contasPagar: [{ id: "cp1", descricao: "Energia Cemig", valor: 500, data_vencimento: "2026-08-10" }],
		});
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/conciliacao/sugestoes").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.sugestoes).toHaveLength(1);
		expect(response.body.sugestoes[0].candidatos[0]).toMatchObject({ tipo: "contas_pagar", id: "cp1", confianca: 100 });
	});

	it("valor diferente nunca vira candidato (nem com data igual)", async () => {
		const dbMock = buildDbMock({
			extratoRows: [{ id: "ext1", data: "2026-08-10", descricao: "PIX X", valor: -500 }],
			contasPagar: [{ id: "cp1", descricao: "Outra conta", valor: 999, data_vencimento: "2026-08-10" }],
		});
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/conciliacao/sugestoes").set("Authorization", BEARER);
		expect(response.body.sugestoes).toHaveLength(0);
	});
});

describe("POST /api/finan/conciliacao/:id/confirmar", () => {
	it("confirma a conciliacao: marca o titulo como pago e o extrato como conciliado", async () => {
		const dbMock = buildDbMock();
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.post("/api/finan/conciliacao/ext1/confirmar")
			.set("Authorization", BEARER)
			.send({ tipo: "contas_pagar", id: "cp1" });
		expect(response.status).toBe(200);
		expect(dbMock.__conciliados).toContain("ext1");
	});
});

function buildWebhookDbMock() {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	const webhooks = [];
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/insert into finan_webhooks/i.test(sql)) {
			const row = { id: params[0], url: params[1], eventos: params[2], secreto: params[3], ativo: true, created_by_id: params[4], created_by_nome: params[5], created_at: new Date().toISOString() };
			webhooks.push(row);
			return { rows: [row] };
		}
		if (/select \* from finan_webhooks order by created_at/i.test(sql)) return { rows: webhooks };
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("Webhooks (#47) — CRUD", () => {
	it("cria um webhook e devolve o secreto so na criacao", async () => {
		const app = loadFinanApp(buildWebhookDbMock());
		const response = await request(app)
			.post("/api/finan/webhooks")
			.set("Authorization", BEARER)
			.send({ url: "https://example.com/hook", eventos: ["month.closed"] });
		expect(response.status).toBe(201);
		expect(response.body.webhook.secreto).toBeTruthy();
		expect(response.body.webhook.eventos).toEqual(["month.closed"]);
	});

	it("sem finan.configuracoes.manage, criar webhook devolve 403", async () => {
		const dbMock = buildWebhookDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.configuracoes.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.post("/api/finan/webhooks")
			.set("Authorization", BEARER)
			.send({ url: "https://example.com/hook", eventos: ["month.closed"] });
		expect(response.status).toBe(403);
	});
});
