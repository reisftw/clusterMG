// Regras financeiras configuráveis (Roteiro Finan #40, Fase 4D, v1
// restrito). Cobre: catálogo fixo de tipos, CRUD, e que avaliar uma
// regra ativa contra dados que violam o limiar gera notificação (mas
// uma regra sem violação nenhuma não gera nada).
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock({ lancamentos = [], notificationInserted = { count: 0 } } = {}) {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	const regras = [];
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/insert into finan_regras_financeiras/i.test(sql)) {
			const row = {
				id: params[0],
				tipo: params[1],
				nome: params[2],
				parametros: JSON.parse(params[3]),
				ativa: true,
				created_by_id: params[4],
				created_by_nome: params[5],
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
			regras.push(row);
			return { rows: [row] };
		}
		if (/select \* from finan_regras_financeiras where ativa = true/i.test(sql)) {
			return { rows: regras.filter((r) => r.ativa) };
		}
		if (/select \* from finan_regras_financeiras order by created_at/i.test(sql)) {
			return { rows: regras };
		}
		if (/from finan_orcamento_lancamentos ol/i.test(sql)) return { rows: lancamentos };
		if (/from finan_contas_pagar cp/i.test(sql)) return { rows: [] };
		if (/insert into finan_notifications/i.test(sql)) {
			notificationInserted.count += 1;
			return { rows: [] };
		}
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("GET /api/finan/regras-financeiras/tipos", () => {
	it("devolve o catálogo fixo de tipos de regra", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/regras-financeiras/tipos").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		const tipos = response.body.tipos.map((t) => t.tipo);
		expect(tipos).toEqual(
			expect.arrayContaining(["despesa_acima_limite", "conta_sem_nf_acima_limite"]),
		);
	});
});

describe("CRUD de regras", () => {
	it("cria uma regra e ela aparece na listagem", async () => {
		const app = loadFinanApp(buildDbMock());
		const created = await request(app)
			.post("/api/finan/regras-financeiras")
			.set("Authorization", BEARER)
			.send({ tipo: "despesa_acima_limite", nome: "Despesa alta", parametros: { limiteValor: 50000 } });
		expect(created.status).toBe(201);

		const list = await request(app).get("/api/finan/regras-financeiras").set("Authorization", BEARER);
		expect(list.body.regras).toHaveLength(1);
	});

	it("tipo desconhecido é rejeitado na criação", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.post("/api/finan/regras-financeiras")
			.set("Authorization", BEARER)
			.send({ tipo: "tipo_que_nao_existe", nome: "X", parametros: {} });
		expect(response.status).toBe(400);
	});

	it("sem finan.configuracoes.manage, criar regra devolve 403", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.configuracoes.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.post("/api/finan/regras-financeiras")
			.set("Authorization", BEARER)
			.send({ tipo: "despesa_acima_limite", nome: "X", parametros: { limiteValor: 1 } });
		expect(response.status).toBe(403);
	});
});

describe("POST /api/finan/jobs/regras_financeiras/reprocessar — avaliação", () => {
	it("regra violada gera notificação (1 lançamento acima do limite)", async () => {
		const notificationInserted = { count: 0 };
		const dbMock = buildDbMock({
			lancamentos: [{ id: "l1", data: "2026-08-01", realizado: 90000, fornecedor_nome: "Fornecedor X", conta_nome: "Conta Y" }],
			notificationInserted,
		});
		const app = loadFinanApp(dbMock);
		await request(app)
			.post("/api/finan/regras-financeiras")
			.set("Authorization", BEARER)
			.send({ tipo: "despesa_acima_limite", nome: "Despesa alta", parametros: { limiteValor: 50000 } });

		const response = await request(app)
			.post("/api/finan/jobs/regras_financeiras/reprocessar")
			.set("Authorization", BEARER);

		expect(response.status).toBe(200);
		expect(response.body.summary.recordsProcessed).toBe(1);
		expect(notificationInserted.count).toBe(1);
	});

	it("regra sem nenhuma violação não gera notificação nenhuma", async () => {
		const notificationInserted = { count: 0 };
		const dbMock = buildDbMock({ lancamentos: [], notificationInserted });
		const app = loadFinanApp(dbMock);
		await request(app)
			.post("/api/finan/regras-financeiras")
			.set("Authorization", BEARER)
			.send({ tipo: "despesa_acima_limite", nome: "Despesa alta", parametros: { limiteValor: 50000 } });

		const response = await request(app)
			.post("/api/finan/jobs/regras_financeiras/reprocessar")
			.set("Authorization", BEARER);

		expect(response.body.summary.recordsProcessed).toBe(0);
		expect(notificationInserted.count).toBe(0);
	});
});
