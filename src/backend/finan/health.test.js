// Healthcheck agora confirma tambem o Postgres (nao so "processo vivo").
// Nunca deve vazar host/porta/DATABASE_URL/stack.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createFinanDbMock, loadFinanApp } from "./testUtils.js";

// timeout maior: loadFinanApp re-requer a arvore inteira de apps/finan/
// backend (app.js hoje monta ~20 routers) a cada teste, pra isolamento —
// o default de 5s fica justo sob contencao de CPU (suite completa/CI).
describe("GET /api/finan/health", { timeout: 15000 }, () => {
	it("reporta ok:true e postgres:up quando o banco responde", async () => {
		const dbMock = createFinanDbMock({ session: null });
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/health");
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		expect(response.body.postgres).toBe("up");
		expect(response.body).not.toHaveProperty("stack");
		expect(JSON.stringify(response.body)).not.toMatch(/postgres:\/\/|DATABASE_URL/i);
	});

	it("reporta ok:false e postgres:down (503) quando o banco falha, sem vazar detalhe do erro", async () => {
		const dbMock = createFinanDbMock({ session: null });
		dbMock.query.mockRejectedValueOnce(new Error("connection refused at 10.0.0.5:5432"));
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/health");
		expect(response.status).toBe(503);
		expect(response.body.ok).toBe(false);
		expect(response.body.postgres).toBe("down");
		expect(JSON.stringify(response.body)).not.toMatch(/10\.0\.0\.5/);
	});
});
