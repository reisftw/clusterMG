// Roteiro Finan (Fase 1) — cobre o RBAC dos modulos novos: sem a
// permissao certa, 403 em qualquer rota; com a permissao, a rota
// responde (sem precisar validar o conteudo de negocio, que ja tem
// cobertura propria nos testes de cada dominio existente). Mesmo padrao
// de pinAdmin.test.js.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("RBAC dos modulos novos do roteiro Finan", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		// createFinanDbMock nao conhece finan_contratos (modulo novo) — sem
		// isso, "insert ... returning *" cairia no fallback {rows: []} e
		// publicContrato(undefined) quebraria a rota com 500 em vez do 200
		// esperado quando a permissao esta correta.
		const baseQuery = dbMock.query;
		dbMock.query = async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/insert into finan_contratos/i.test(sql)) {
				return {
					rows: [
						{
							id: "contrato-teste",
							fornecedor_id: null,
							nome: params?.[2] || "Contrato teste",
							valor: params?.[3] || 0,
							periodicidade: params?.[4] || "mensal",
							data_inicio: null,
							data_renovacao: null,
							indice_reajuste: null,
							responsavel_id: null,
							responsavel_nome: null,
							ativo: true,
							observacoes: null,
							created_at: new Date(),
							updated_at: new Date(),
						},
					],
				};
			}
			return baseQuery(text, params);
		};
		app = loadFinanApp(dbMock);
	});

	it("GET /pendencias exige finan.pendencias.view", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const semPermissao = await request(app).get("/api/finan/pendencias").set("Authorization", BEARER);
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const admin = await request(app).get("/api/finan/pendencias").set("Authorization", BEARER);
		expect(admin.status).toBe(200);
		expect(admin.body.ok).toBe(true);
	});

	it("GET /contratos exige finan.contratos.view; POST exige finan.contratos.manage", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const semPermissaoGet = await request(app).get("/api/finan/contratos").set("Authorization", BEARER);
		expect(semPermissaoGet.status).toBe(403);

		dbMock.setSession(sessionWithPermissions(["finan.contratos.view"]));
		const somenteView = await request(app).get("/api/finan/contratos").set("Authorization", BEARER);
		expect(somenteView.status).toBe(200);

		const somenteViewPost = await request(app)
			.post("/api/finan/contratos")
			.set("Authorization", BEARER)
			.send({ nome: "Contrato teste", valor: 100, periodicidade: "mensal" });
		expect(somenteViewPost.status).toBe(403);

		dbMock.setSession(adminSession());
		const adminPost = await request(app)
			.post("/api/finan/contratos")
			.set("Authorization", BEARER)
			.send({ nome: "Contrato teste", valor: 100, periodicidade: "mensal" });
		expect(adminPost.status).toBe(200);
	});

	it("POST /fechamento/fechar e /reabrir exigem finan.gestao_orcamentaria.manage", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.gestao_orcamentaria.view"]));
		const semPermissao = await request(app)
			.post("/api/finan/fechamento/fechar")
			.set("Authorization", BEARER)
			.send({ ano: 2026, mes: 9 });
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const admin = await request(app)
			.post("/api/finan/fechamento/fechar")
			.set("Authorization", BEARER)
			.send({ ano: 2026, mes: 9 });
		expect(admin.status).toBe(200);
	});

	it("POST /fechamento/reabrir exige motivo (validacao de DTO, nao so RBAC)", async () => {
		dbMock.setSession(adminSession());
		const semMotivo = await request(app)
			.post("/api/finan/fechamento/reabrir")
			.set("Authorization", BEARER)
			.send({ ano: 2026, mes: 9 });
		expect(semMotivo.status).toBe(400);

		const comMotivo = await request(app)
			.post("/api/finan/fechamento/reabrir")
			.set("Authorization", BEARER)
			.send({ ano: 2026, mes: 9, motivo: "Correção de lançamento retroativo" });
		expect(comMotivo.status).toBe(200);
	});

	it("POST /metas e /indicadores exigem finan.gestao_orcamentaria.manage pra criar", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.gestao_orcamentaria.view"]));
		const metaSemPermissao = await request(app)
			.post("/api/finan/metas")
			.set("Authorization", BEARER)
			.send({ titulo: "Reduzir custo", valorBase: 1000, valorAlvo: 900 });
		expect(metaSemPermissao.status).toBe(403);

		const indicadorSemPermissao = await request(app)
			.post("/api/finan/indicadores")
			.set("Authorization", BEARER)
			.send({ nome: "Teste", metricaA: "despesas_totais_ano", operador: "/", metricaB: "total_fornecedores" });
		expect(indicadorSemPermissao.status).toBe(403);
	});

	it("rotas de preferencias/favoritos e busca global so exigem autenticacao (sem permissao extra)", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const favoritos = await request(app).get("/api/finan/preferencias/favoritos").set("Authorization", BEARER);
		expect(favoritos.status).toBe(200);

		const busca = await request(app).get("/api/finan/busca?q=teste").set("Authorization", BEARER);
		expect(busca.status).toBe(200);
	});
});
