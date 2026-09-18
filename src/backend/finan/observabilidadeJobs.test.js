// Central de Jobs e Integrações + Observabilidade (Roteiro Finan #27 e
// #28, Fase 4A). Cobre: overview de jobs monta a partir do registro
// estático mesmo sem nenhuma execução ainda, reprocessar um job não
// reprocessável (import_orcamento) devolve 400 sem tentar rodar nada, e
// as duas rotas exigem finan.configuracoes.view.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock({ execucoes = [] } = {}) {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/select distinct on \(job_key\)/i.test(sql)) {
			return { rows: execucoes };
		}
		if (/count\(\*\) filter \(where status = 'success'\)/i.test(sql)) {
			return { rows: [] };
		}
		if (/from finan_job_execucoes/i.test(sql)) {
			return { rows: execucoes };
		}
		if (/finan_observabilidade_metricas/i.test(sql)) {
			return { rows: [] };
		}
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("GET /api/finan/jobs", () => {
	it("monta a Central de Jobs a partir do registro estático mesmo sem nenhuma execução", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/jobs").set("Authorization", BEARER);

		expect(response.status).toBe(200);
		const jobKeys = response.body.jobs.map((job) => job.jobKey);
		expect(jobKeys).toEqual(
			expect.arrayContaining(["backup_database", "calendario_alertas", "import_orcamento"]),
		);
		const backupJob = response.body.jobs.find((job) => job.jobKey === "backup_database");
		expect(backupJob.lastExecution).toBeNull();
		expect(backupJob.reprocessable).toBe(true);
		const importJob = response.body.jobs.find((job) => job.jobKey === "import_orcamento");
		expect(importJob.reprocessable).toBe(false);
	});

	it("sem finan.configuracoes.view, a rota responde 403", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.dashboard.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/jobs").set("Authorization", BEARER);
		expect(response.status).toBe(403);
	});
});

describe("POST /api/finan/jobs/:jobKey/reprocessar", () => {
	it("import_orcamento não é reprocessável (depende de upload) — 400, não tenta rodar nada", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.post("/api/finan/jobs/import_orcamento/reprocessar")
			.set("Authorization", BEARER);

		expect(response.status).toBe(400);
		expect(response.body.ok).toBe(false);
	});

	it("job desconhecido é rejeitado pela validação de rota antes de chegar no handler", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.post("/api/finan/jobs/job-que-nao-existe/reprocessar")
			.set("Authorization", BEARER);

		expect(response.status).toBe(400);
	});
});

describe("GET /api/finan/observabilidade/overview", () => {
	it("devolve uptime, postgres, requests e jobs sem quebrar com base vazia", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.get("/api/finan/observabilidade/overview")
			.set("Authorization", BEARER);

		expect(response.status).toBe(200);
		expect(response.body.process.uptimeSeconds).toBeGreaterThanOrEqual(0);
		expect(response.body.requests.last24h.requestsTotal).toBe(0);
		expect(response.body.requests.last24h.errorRatePct).toBe(0);
		expect(Array.isArray(response.body.jobs)).toBe(true);
	});

	it("sem finan.configuracoes.view, a rota responde 403", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.dashboard.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.get("/api/finan/observabilidade/overview")
			.set("Authorization", BEARER);
		expect(response.status).toBe(403);
	});
});
