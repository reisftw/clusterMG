// Proxy da BrasilAPI (cards "reais e financeiros" da Dashboard + consulta
// de CNPJ ativo no modal de Nota Fiscal). Testa so o proxy do Finan (auth,
// validacao, formato da resposta) com fetch global mockado — nunca bate
// na BrasilAPI real em teste.
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("GET /api/finan/brasilapi/*", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("exige autenticacao", async () => {
		dbMock.setSession(null);
		const response = await request(app).get("/api/finan/brasilapi/taxas").set("Authorization", BEARER);
		expect(response.status).toBe(401);
	});

	it("GET /cnpj/:cnpj rejeita CNPJ com menos de 14 digitos (400, nunca bate na API externa)", async () => {
		dbMock.setSession(adminSession());
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const response = await request(app).get("/api/finan/brasilapi/cnpj/123").set("Authorization", BEARER);
		expect(response.status).toBe(400);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("GET /cnpj/:cnpj devolve dados normalizados (razaoSocial, ativa)", async () => {
		dbMock.setSession(adminSession());
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					cnpj: "18236120000158",
					razao_social: "EMPRESA TESTE LTDA",
					nome_fantasia: "Teste",
					descricao_situacao_cadastral: "ATIVA",
					data_situacao_cadastral: "2013-06-04",
					municipio: "SAO PAULO",
					uf: "SP",
				}),
			})),
		);
		const response = await request(app).get("/api/finan/brasilapi/cnpj/18236120000158").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.empresa.razaoSocial).toBe("EMPRESA TESTE LTDA");
		expect(response.body.empresa.ativa).toBe(true);
	});

	it("GET /cnpj/:cnpj devolve 404 amigavel quando a BrasilAPI nao acha o CNPJ", async () => {
		dbMock.setSession(adminSession());
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
		const response = await request(app).get("/api/finan/brasilapi/cnpj/99999999000199").set("Authorization", BEARER);
		expect(response.status).toBe(404);
	});

	it("GET /cnpj/:cnpj devolve 400 com a mensagem real quando o CNPJ tem digito verificador invalido (14 digitos, mas invalido) — bug relatado em producao", async () => {
		// Reportado pelo usuario: CNPJ 13126784404402 (14 digitos numericos,
		// passa na validacao de formato) mas com digito verificador errado.
		// A BrasilAPI responde 400 com uma mensagem clara — antes da
		// correcao, qualquer status != 404 virava "502 indisponivel",
		// escondendo que o problema era o CNPJ digitado, nao o servico.
		dbMock.setSession(adminSession());
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 400,
				json: async () => ({ message: "CNPJ 13.126.784/4044-02 inválido.", type: "bad_request" }),
			})),
		);
		const response = await request(app).get("/api/finan/brasilapi/cnpj/13126784404402").set("Authorization", BEARER);
		expect(response.status).toBe(400);
		expect(response.body.error).toMatch(/inválido/);
	});

	it("GET /cnpj/:cnpj devolve 502 amigavel (sem vazar o status cru) quando a BrasilAPI bloqueia com 403", async () => {
		dbMock.setSession(adminSession());
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));
		const response = await request(app).get("/api/finan/brasilapi/cnpj/24605227000129").set("Authorization", BEARER);
		expect(response.status).toBe(502);
		expect(response.body.error).not.toMatch(/403/);
	});

	it("manda um User-Agent nas chamadas pra BrasilAPI (sem isso, o fetch nativo do Node leva 403 da protecao anti-bot dela)", async () => {
		dbMock.setSession(adminSession());
		const fetchSpy = vi.fn(async () => ({
			ok: true,
			json: async () => ({ razao_social: "X", descricao_situacao_cadastral: "ATIVA" }),
		}));
		vi.stubGlobal("fetch", fetchSpy);
		await request(app).get("/api/finan/brasilapi/cnpj/24605227000129").set("Authorization", BEARER);
		const [, options] = fetchSpy.mock.calls[0];
		expect(options.headers["User-Agent"]).toBeTruthy();
	});

	it("GET /taxas devolve a lista normalizada", async () => {
		dbMock.setSession(adminSession());
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => [{ nome: "Selic", valor: 14 }, { nome: "CDI", valor: 13.9 }],
			})),
		);
		const response = await request(app).get("/api/finan/brasilapi/taxas").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.taxas).toEqual([{ nome: "Selic", valor: 14 }, { nome: "CDI", valor: 13.9 }]);
	});

	it("GET /bancos filtra entradas sem codigo/nome e ordena", async () => {
		dbMock.setSession(adminSession());
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => [
					{ code: 1, name: "BCO DO BRASIL S.A.", fullName: "Banco do Brasil S.A.", ispb: "00000000" },
					{ code: null, name: "SEM CODIGO", fullName: "Sem código", ispb: "111" },
					{ code: 260, name: "NU PAGAMENTOS S.A.", fullName: "Nu Pagamentos S.A.", ispb: "222" },
				],
			})),
		);
		const response = await request(app).get("/api/finan/brasilapi/bancos").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.bancos).toHaveLength(2);
		expect(response.body.bancos[0].nome).toBe("Banco do Brasil S.A.");
	});

	it("GET /cambio usa moedas padrao quando nao informado", async () => {
		dbMock.setSession(adminSession());
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ cotacoes: [{ cotacao_compra: 5.08, cotacao_venda: 5.09, data_hora_cotacao: "2026-09-08 12:00", tipo_boletim: "FECHAMENTO" }] }),
			})),
		);
		const response = await request(app).get("/api/finan/brasilapi/cambio").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.cotacoes).toHaveLength(5);
		expect(response.body.cotacoes[0].moeda).toBe("USD");
	});
});
