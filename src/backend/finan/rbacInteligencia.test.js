// Fase 2 do Roteiro Finan — cobre o RBAC do modulo de inteligencia
// (comparador, anomalias, forecast, score, simulador): sem
// finan.gestao_orcamentaria.view/finan.dashboard.view, 403 em qualquer
// rota. Tambem cobre a validacao de entrada do simulador (nunca deve
// aceitar tipo/percentual fora do esperado).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

describe("RBAC do modulo de inteligencia (Fase 2)", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: null });
		app = loadFinanApp(dbMock);
	});

	it("GET /inteligencia/comparador, /anomalias, /forecast, /score exigem permissao de orcamento", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const rotas = ["/api/finan/inteligencia/comparador", "/api/finan/inteligencia/anomalias", "/api/finan/inteligencia/forecast", "/api/finan/inteligencia/score"];
		for (const rota of rotas) {
			// eslint-disable-next-line no-await-in-loop
			const response = await request(app).get(rota).set("Authorization", BEARER);
			expect(response.status).toBe(403);
		}

		dbMock.setSession(adminSession());
		for (const rota of rotas) {
			// eslint-disable-next-line no-await-in-loop
			const response = await request(app).get(rota).set("Authorization", BEARER);
			expect(response.status).toBe(200);
			expect(response.body.ok).toBe(true);
		}
	});

	it("POST /inteligencia/simulador exige permissao e valida tipo/percentual", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const semPermissao = await request(app)
			.post("/api/finan/inteligencia/simulador")
			.set("Authorization", BEARER)
			.send({ tipo: "fornecedor", id: "f1", percentual: 10 });
		expect(semPermissao.status).toBe(403);

		dbMock.setSession(adminSession());
		const tipoInvalido = await request(app)
			.post("/api/finan/inteligencia/simulador")
			.set("Authorization", BEARER)
			.send({ tipo: "usuario", id: "f1", percentual: 10 });
		expect(tipoInvalido.status).toBe(400);

		const semId = await request(app)
			.post("/api/finan/inteligencia/simulador")
			.set("Authorization", BEARER)
			.send({ tipo: "fornecedor", percentual: 10 });
		expect(semId.status).toBe(400);

		const valido = await request(app)
			.post("/api/finan/inteligencia/simulador")
			.set("Authorization", BEARER)
			.send({ tipo: "fornecedor", id: "f1", percentual: 10 });
		expect(valido.status).toBe(200);
		expect(valido.body.ok).toBe(true);
	});
});
