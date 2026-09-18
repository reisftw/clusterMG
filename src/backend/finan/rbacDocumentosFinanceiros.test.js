// Roteiro Finan Fase 3 (pré-requisito: Notas/Contas a Pagar/Contas a
// Receber + Caixa de Entrada) — cobre o RBAC dos 4 modulos novos: sem a
// permissao certa, 403 em qualquer rota; "vencida" e sempre calculado,
// nunca um status gravado (ver publicConta em contasPagar/routes.js e
// contasReceber/routes.js).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function withInsertReturning(baseQuery, table, buildRow) {
	return async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (new RegExp(`insert into ${table}`, "i").test(sql)) {
			return { rows: [buildRow(params)] };
		}
		return baseQuery(text, params);
	};
}

describe("RBAC de Notas/Contas a Pagar/Contas a Receber/Caixa de Entrada (Fase 3)", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		let query = dbMock.query;
		query = withInsertReturning(query, "finan_notas_fiscais", (params) => ({
			id: "nota-teste",
			numero: params?.[1] || null,
			serie: null,
			cnpj_emissor: null,
			fornecedor_id: null,
			descricao: params?.[5] || null,
			valor: params?.[6] || 0,
			valor_impostos: 0,
			data_emissao: null,
			data_vencimento: null,
			status: "pendente",
			observacoes: null,
			created_at: new Date(),
		}));
		query = withInsertReturning(query, "finan_contas_pagar", (params) => ({
			id: "cpagar-teste",
			descricao: params?.[1] || "",
			fornecedor_id: null,
			nota_id: null,
			conta_id: null,
			centro_custo_id: null,
			valor: params?.[6] || 0,
			data_vencimento: params?.[7] || new Date(),
			data_pagamento: null,
			forma_pagamento: null,
			status: "pendente",
			observacoes: null,
			created_at: new Date(),
		}));
		query = withInsertReturning(query, "finan_contas_receber", (params) => ({
			id: "creceber-teste",
			descricao: params?.[1] || "",
			cliente_nome: params?.[2] || "",
			valor: params?.[3] || 0,
			data_vencimento: params?.[4] || new Date(),
			data_recebimento: null,
			status: "pendente",
			observacoes: null,
			created_at: new Date(),
		}));
		dbMock.query = query;
		app = loadFinanApp(dbMock);
	});

	it("GET/POST /notas exigem finan.notas.view/manage", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const semPermissao = await request(app).get("/api/finan/notas").set("Authorization", BEARER);
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(sessionWithPermissions(["finan.notas.view"]));
		const somenteView = await request(app).get("/api/finan/notas").set("Authorization", BEARER);
		expect(somenteView.status).toBe(200);
		const somenteViewPost = await request(app).post("/api/finan/notas").set("Authorization", BEARER).send({ valor: 100 });
		expect(somenteViewPost.status).toBe(403);

		dbMock.setSession(adminSession());
		const adminPost = await request(app).post("/api/finan/notas").set("Authorization", BEARER).send({ valor: 100 });
		expect(adminPost.status).toBe(200);
	});

	it("GET/POST /contas-pagar exigem finan.contas_pagar.view/manage", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const semPermissao = await request(app).get("/api/finan/contas-pagar").set("Authorization", BEARER);
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const adminPost = await request(app)
			.post("/api/finan/contas-pagar")
			.set("Authorization", BEARER)
			.send({ descricao: "Aluguel", valor: 1000, dataVencimento: "2026-10-05" });
		expect(adminPost.status).toBe(200);
	});

	it("GET/POST /contas-receber exigem finan.contas_receber.view/manage", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const semPermissao = await request(app).get("/api/finan/contas-receber").set("Authorization", BEARER);
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const adminPost = await request(app)
			.post("/api/finan/contas-receber")
			.set("Authorization", BEARER)
			.send({ descricao: "Serviço X", clienteNome: "Cliente Y", valor: 500, dataVencimento: "2026-10-05" });
		expect(adminPost.status).toBe(200);
	});

	it("POST /documentos (caixa de entrada) exige finan.notas.manage e valida presença de arquivo", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.notas.view"]));
		const semPermissao = await request(app).post("/api/finan/documentos").set("Authorization", BEARER);
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const semArquivo = await request(app).post("/api/finan/documentos").set("Authorization", BEARER);
		expect(semArquivo.status).toBe(400);
	});

	it("PATCH /documentos/:id/status rejeita status fora do catalogo fechado", async () => {
		dbMock.setSession(adminSession());
		const invalido = await request(app)
			.patch("/api/finan/documentos/doc-1/status")
			.set("Authorization", BEARER)
			.send({ status: "arquivado" });
		expect(invalido.status).toBe(400);
	});

	it("POST /documentos/:id/gerar-nota (roteiro #15/#16) exige permissao e valor > 0 explicito no body", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.notas.view"]));
		const semPermissao = await request(app)
			.post("/api/finan/documentos/doc-1/gerar-nota")
			.set("Authorization", BEARER)
			.send({ valor: 100 });
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const semValor = await request(app).post("/api/finan/documentos/doc-1/gerar-nota").set("Authorization", BEARER).send({});
		expect(semValor.status).toBe(400);

		const valorZero = await request(app)
			.post("/api/finan/documentos/doc-1/gerar-nota")
			.set("Authorization", BEARER)
			.send({ valor: 0 });
		expect(valorZero.status).toBe(400);
	});

	it("POST /documentos/gerar-notas-lote (conferir varios de uma vez) exige permissao, limita tamanho e e best-effort por item", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.notas.view"]));
		const semPermissao = await request(app)
			.post("/api/finan/documentos/gerar-notas-lote")
			.set("Authorization", BEARER)
			.send({ itens: [{ documentoId: "doc-1", valor: 100 }] });
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const vazio = await request(app).post("/api/finan/documentos/gerar-notas-lote").set("Authorization", BEARER).send({ itens: [] });
		expect(vazio.status).toBe(400);

		const demais = Array.from({ length: 101 }, (_v, i) => ({ documentoId: `doc-${i}`, valor: 10 }));
		const tooMany = await request(app).post("/api/finan/documentos/gerar-notas-lote").set("Authorization", BEARER).send({ itens: demais });
		expect(tooMany.status).toBe(400);

		// doc-1 tem valor valido mas nao existe no mock (select devolve
		// vazio) -> falha individual, sem quebrar a resposta (best-effort).
		const misto = await request(app)
			.post("/api/finan/documentos/gerar-notas-lote")
			.set("Authorization", BEARER)
			.send({ itens: [{ documentoId: "doc-1", valor: 100 }, { documentoId: "", valor: 50 }] });
		expect(misto.status).toBe(200);
		expect(misto.body.total).toBe(2);
		expect(misto.body.sucesso).toBe(0);
		expect(misto.body.resultados).toHaveLength(2);
		expect(misto.body.resultados[0].ok).toBe(false);
		expect(misto.body.resultados[1].erro).toBe("documentoId ausente.");
	});
});
