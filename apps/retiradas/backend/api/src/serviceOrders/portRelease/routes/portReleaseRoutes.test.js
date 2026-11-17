process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const request = require("supertest");
const service = require("../portReleaseService");
const createRouter = require("./portReleaseRoutes");

function app() {
	const server = express();
	server.use(express.json());
	server.use("/api", createRouter({
		requireAuthenticated(req, res, next) {
			if (req.get("x-user") !== "yes") return res.status(401).json({ error: "Não autenticado" });
			req.user = { uid: "user-1", nome: "Teste" };
			next();
		},
		requireCsrfToken(_req, _res, next) { next(); },
		requireAnyPermission(required) {
			return (req, res, next) => {
				const granted = new Set((req.get("x-permissions") || "").split(","));
				if (!required.some((permission) => granted.has(permission))) return res.status(403).json({ error: "Sem permissão" });
				next();
			};
		},
	}));
	server.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: error.message }));
	return server;
}

test("bloqueia consulta sem autenticação", async () => {
	const response = await request(app()).post("/api/search").send({ codes: "1" });
	assert.equal(response.status, 401);
});

test("bloqueia consulta sem permissão de pesquisa", async () => {
	const response = await request(app()).post("/api/search").set("x-user", "yes").set("x-permissions", "liberacao_portas.view").send({ codes: "1" });
	assert.equal(response.status, 403);
});

test("usuário com permissão somente de consulta não executa lote", async () => {
	const response = await request(app()).post("/api/batches").set("x-user", "yes").set("x-permissions", "liberacao_portas.search").send({});
	assert.equal(response.status, 403);
});

test("reenvio de falha exige permissão de execução", async () => {
	const response = await request(app()).post("/api/operations/op-1/retry").set("x-user", "yes").set("x-permissions", "liberacao_portas.history");
	assert.equal(response.status, 403);
});

test("usuário autorizado consegue reenviar uma falha", async () => {
	const original = service.retryOperation;
	service.retryOperation = async () => ({ id: "batch-retry", status: "QUEUED" });
	try {
		const response = await request(app()).post("/api/operations/op-1/retry").set("x-user", "yes").set("x-permissions", "liberacao_portas.execute");
		assert.equal(response.status, 202);
		assert.equal(response.body.id, "batch-retry");
	} finally { service.retryOperation = original; }
});

test("exportação exige permissão própria", async () => {
	const response = await request(app()).get("/api/export.csv").set("x-user", "yes").set("x-permissions", "liberacao_portas.history");
	assert.equal(response.status, 403);
});

test("usuário autorizado consegue consultar sem expor credenciais", async () => {
	const original = service.search;
	service.search = async () => ({ items: [], pagination: { total: 0 } });
	try {
		const response = await request(app()).post("/api/search").set("x-user", "yes").set("x-permissions", "liberacao_portas.search").send({ codes: "1" });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body.items, []);
	} finally { service.search = original; }
});
