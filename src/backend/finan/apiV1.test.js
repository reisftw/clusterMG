// API interna oficial do Finan /api/v1 (Roteiro Finan #26, Fase 4A —
// primeiro lote). Cobre: envelope de sucesso `{ok,data,meta?}` uniforme,
// envelope de erro `{ok,error:{code,message}}` tipado, paginação real
// (page/pageSize/total) no histórico de jobs, 403 sem permissão, e que o
// spec OpenAPI serve um JSON válido com os paths esperados.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock({ execucoes = [], execucoesTotal = 0 } = {}) {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/select distinct on \(job_key\)/i.test(sql)) return { rows: [] };
		if (/count\(\*\) filter \(where status = 'success'\)/i.test(sql)) return { rows: [] };
		if (/count\(\*\)::int as total\s+from finan_job_execucoes/i.test(sql)) {
			return { rows: [{ total: execucoesTotal }] };
		}
		if (/from finan_job_execucoes/i.test(sql)) return { rows: execucoes };
		if (/finan_observabilidade_metricas/i.test(sql)) return { rows: [] };
		if (/count\(\*\)::int as total, count\(\*\) filter \(where cnpj/i.test(sql)) {
			return { rows: [{ total: 0, sem_cnpj: 0 }] };
		}
		if (/select id, nome, cnpj from finan_fornecedores/i.test(sql)) return { rows: [] };
		if (/sem_classe/i.test(sql)) return { rows: [{ total: 0, sem_classe: 0 }] };
		if (/join finan_orcamento_lancamentos b/i.test(sql)) return { rows: [{ total: 0 }] };
		if (/^select count\(\*\)::int as total\s+from finan_orcamento_lancamentos$/i.test(sql.trim())) {
			return { rows: [{ total: 0 }] };
		}
		if (/sem_fornecedor/i.test(sql)) return { rows: [{ total: 0, sem_fornecedor: 0 }] };
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("GET /api/v1/health", () => {
	it("é público (sem Authorization) e devolve envelope {ok,data}", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/v1/health");
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		expect(response.body.data.postgres).toBe("up");
	});
});

describe("GET /api/v1/qualidade-dados", () => {
	it("devolve {ok,data:{score,checks}}", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/v1/qualidade-dados").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		expect(typeof response.body.data.score).toBe("number");
		expect(Array.isArray(response.body.data.checks)).toBe(true);
	});

	it("sem finan.qualidade_dados.view, devolve envelope de erro {ok:false,error:{code,message}}", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.dashboard.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/v1/qualidade-dados").set("Authorization", BEARER);
		expect(response.status).toBe(403);
		expect(response.body.ok).toBe(false);
		expect(response.body.error).toBeTypeOf("object");
	});
});

describe("GET /api/v1/jobs/:jobKey/execucoes — paginação real", () => {
	it("devolve meta.page/pageSize/total/totalPages calculados a partir do COUNT", async () => {
		const execucoes = Array.from({ length: 5 }, (_, i) => ({
			id: `jobexec_${i}`,
			job_key: "backup_database",
			status: "success",
			trigger_type: "scheduled",
			started_at: new Date().toISOString(),
			finished_at: new Date().toISOString(),
			duration_ms: 1000,
			records_processed: null,
			error_message: null,
			summary: {},
			triggered_by_id: null,
			triggered_by_name: null,
		}));
		const app = loadFinanApp(buildDbMock({ execucoes, execucoesTotal: 47 }));
		const response = await request(app)
			.get("/api/v1/jobs/backup_database/execucoes?page=2&pageSize=5")
			.set("Authorization", BEARER);

		expect(response.status).toBe(200);
		expect(response.body.data).toHaveLength(5);
		expect(response.body.meta).toEqual({ page: 2, pageSize: 5, total: 47, totalPages: 10 });
	});
});

describe("POST /api/v1/jobs/:jobKey/reprocessar", () => {
	it("import_orcamento não é reprocessável — 400 com envelope de erro tipado", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.post("/api/v1/jobs/import_orcamento/reprocessar")
			.set("Authorization", BEARER);

		expect(response.status).toBe(400);
		expect(response.body.ok).toBe(false);
		expect(response.body.error.code).toBe("VALIDATION_ERROR");
	});

	it("jobKey desconhecido é rejeitado pelo DTO antes do handler — 400", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.post("/api/v1/jobs/job-que-nao-existe/reprocessar")
			.set("Authorization", BEARER);
		expect(response.status).toBe(400);
	});
});

describe("GET /api/v1/rota-que-nao-existe", () => {
	it("404 dentro do próprio envelope v1 (não cai no handler legado)", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/v1/rota-que-nao-existe").set("Authorization", BEARER);
		expect(response.status).toBe(404);
		expect(response.body.ok).toBe(false);
		expect(response.body.error.code).toBe("NOT_FOUND");
	});
});

describe("GET /api/v1/docs/openapi.json", () => {
	it("serve um spec OpenAPI válido com os paths do primeiro lote", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/v1/docs/openapi.json").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.openapi).toBe("3.0.3");
		expect(response.body.paths).toHaveProperty("/health");
		expect(response.body.paths).toHaveProperty("/jobs/{jobKey}/execucoes");
		expect(response.body.paths).toHaveProperty("/observabilidade/overview");
	});

	it("sem finan.configuracoes.view, 403", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.dashboard.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/v1/docs/openapi.json").set("Authorization", BEARER);
		expect(response.status).toBe(403);
	});
});
