// categoria: error-handling (regressao)
//
// Antes da correcao, GET /resumo e /detalhes em orcamento/routes.js nao
// tinham try/catch: um erro do Postgres virava uma rejeicao de Promise
// nao tratada e derrubava o processo inteiro (foi exatamente o que
// aconteceu em producao com "column e.codigo does not exist", 27 restarts
// em 24h). Este teste prova que agora QUALQUER erro do banco nessas duas
// rotas vira uma resposta HTTP normal (500, sanitizada), nunca uma
// excecao que escapa do handler.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "../testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("security/error-handling: orcamento/routes.js nao derruba o processo", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: adminSession() });
		app = loadFinanApp(dbMock);
	}, 30000);

	it("GET /orcamento/resumo com erro de banco responde 500 sanitizado, nao lanca excecao", async () => {
		const pgError = new Error('column e.codigo does not exist');
		pgError.code = "42703";
		pgError.severity = "ERROR";
		pgError.table = undefined;
		dbMock.query.mockRejectedValueOnce(pgError);

		const response = await request(app)
			.get("/api/finan/orcamento/resumo")
			.set("Authorization", BEARER);

		expect(response.status).toBe(500);
		expect(response.body.ok).toBe(false);
		// erro cru do Postgres nunca deve chegar ao cliente (ver security/errors.js)
		expect(response.body.error).not.toMatch(/e\.codigo|does not exist|42703/);
	});

	it("GET /orcamento/detalhes com erro de banco responde 500 sanitizado, nao lanca excecao", async () => {
		const pgError = new Error("column e.codigo does not exist");
		pgError.code = "42703";
		pgError.severity = "ERROR";
		dbMock.query.mockRejectedValueOnce(pgError);

		const response = await request(app)
			.get("/api/finan/orcamento/detalhes")
			.set("Authorization", BEARER);

		expect(response.status).toBe(500);
		expect(response.body.ok).toBe(false);
		expect(response.body.error).not.toMatch(/e\.codigo|does not exist|42703/);
	});

	it("GET /orcamento/detalhes com erro em QUALQUER uma das 6 queries paralelas tambem responde 500 (nao trava)", async () => {
		// /detalhes dispara 6 queries via Promise.all — o bug real estava na
		// 5a (empresas). Simula falha so nessa posicao para confirmar que o
		// try/catch cobre o Promise.all inteiro, nao so a primeira query.
		let orcamentoCall = 0;
		const original = dbMock.query.getMockImplementation();
		dbMock.query.mockImplementation(async (text, params) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			// deixa a checagem de sessao (auth) passar pelo comportamento
			// normal do mock — so intercepta as queries do proprio /detalhes.
			if (/from finan_sessions/i.test(sql)) return original(text, params);
			orcamentoCall += 1;
			if (orcamentoCall === 5) {
				const error = new Error("column e.codigo does not exist");
				error.code = "42703";
				error.severity = "ERROR";
				throw error;
			}
			return { rows: [] };
		});

		const response = await request(app)
			.get("/api/finan/orcamento/detalhes")
			.set("Authorization", BEARER);

		expect(response.status).toBe(500);
		expect(response.body.ok).toBe(false);
	});

	it("GET /orcamento/resumo e /detalhes continuam funcionando normalmente sem erro (nao regrediu o caminho feliz)", async () => {
		const resumo = await request(app)
			.get("/api/finan/orcamento/resumo")
			.set("Authorization", BEARER);
		expect(resumo.status).toBe(200);
		expect(resumo.body.ok).toBe(true);

		const detalhes = await request(app)
			.get("/api/finan/orcamento/detalhes")
			.set("Authorization", BEARER);
		expect(detalhes.status).toBe(200);
		expect(detalhes.body.ok).toBe(true);
		expect(detalhes.body.detalhes).toHaveProperty("empresas");
	});
});
