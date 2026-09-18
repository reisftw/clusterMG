// Versionamento de orçamento (Roteiro Finan #37, Fase 4C, usa #36).
// Cobre: GET /versoes sempre inclui a versão "Original" (budget)
// sintetizada mesmo sem nenhuma versão extra criada; criar uma versão
// nova copia os valores orçados da versão-base sem apagar/alterar a
// original; excluir a versão "budget" é bloqueado (400); e GET /resumo
// filtra a matriz pela versão pedida (corrige o bug latente de dupla
// contagem entre versões).
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock() {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	const versoes = [];
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/select status, snapshot, fechado_em from finan_fechamentos_mensais/i.test(sql)) return { rows: [] };
		if (/from finan_orcamento_matriz[\s\S]*cross join lancamentos/i.test(sql)) {
			// versaoId e o 3o parametro — devolve orcado diferente por versao
			// pra provar que o filtro realmente muda o resultado.
			const orcado = params[2] === "budget" ? 100000 : 40000;
			return { rows: [{ orcado, realizado: 87500, linhas: 42 }] };
		}
		if (/select \* from finan_orcamento_versoes where ano = \$1 and mes = \$2 order by created_at/i.test(sql)) {
			return { rows: versoes.filter((v) => v.ano === params[0] && v.mes === params[1]) };
		}
		if (/insert into finan_orcamento_versoes/i.test(sql)) {
			const row = {
				id: params[0],
				ano: params[1],
				mes: params[2],
				nome: params[3],
				versao_base_id: params[4],
				is_padrao: false,
				created_by_id: params[5],
				created_by_nome: params[6],
				created_at: new Date().toISOString(),
			};
			versoes.push(row);
			return { rows: [row] };
		}
		if (/insert into finan_orcamento_matriz[\s\S]*gen_random_uuid/i.test(sql)) {
			return { rowCount: 12 };
		}
		if (/^\s*(begin|commit|rollback)\s*$/i.test(sql)) return { rows: [] };
		return baseQuery(text, params);
	};
	// db.connect() (usado pela transacao de createVersao) devolve um client
	// fechado sobre a query ORIGINAL do mock compartilhado, nao sobre o
	// override acima — precisa apontar explicitamente pra dbMock.query, ou
	// as queries dentro da transacao nunca batem com os regex daqui.
	dbMock.connect = async () => ({ query: (...args) => dbMock.query(...args), release: () => {} });
	return dbMock;
}

describe("GET /api/finan/orcamento/versoes", () => {
	it("sempre inclui a versão Original (budget) sintetizada, mesmo sem versão extra", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.get("/api/finan/orcamento/versoes?ano=2026&mes=8")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.versoes).toEqual([
			expect.objectContaining({ id: "budget", nome: "Original", isPadrao: true }),
		]);
	});
});

describe("POST /api/finan/orcamento/versoes", () => {
	it("cria uma versão nova copiando os valores da versão-base (não apaga a original)", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.post("/api/finan/orcamento/versoes")
			.set("Authorization", BEARER)
			.send({ ano: "2026", mes: "8", nome: "Revisão 1", versaoBaseId: "budget" });

		expect(response.status).toBe(201);
		expect(response.body.versao.nome).toBe("Revisão 1");
		expect(response.body.linhasCopiadas).toBe(12);
	});
});

describe("DELETE /api/finan/orcamento/versoes/budget", () => {
	it("nunca deixa excluir a versão Original", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.delete("/api/finan/orcamento/versoes/budget")
			.set("Authorization", BEARER);
		expect(response.status).toBe(400);
	});
});

describe("GET /api/finan/orcamento/resumo?versaoId=", () => {
	it("versao 'budget' (padrao) e uma versao alternativa devolvem orcado diferente — o filtro funciona", async () => {
		const app = loadFinanApp(buildDbMock());
		const budget = await request(app)
			.get("/api/finan/orcamento/resumo?ano=2026&mes=8")
			.set("Authorization", BEARER);
		const revisao = await request(app)
			.get("/api/finan/orcamento/resumo?ano=2026&mes=8&versaoId=orcver_123")
			.set("Authorization", BEARER);

		expect(budget.body.resumo.orcado).toBe(100000);
		expect(revisao.body.resumo.orcado).toBe(40000);
		expect(revisao.body.versaoId).toBe("orcver_123");
	});
});
