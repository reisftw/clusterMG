const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const servicePath = require.resolve("../serviceOrderCancellationsService");
const routesPath = require.resolve("./serviceOrderCancellationsRoutes");

function buildApp() {
	const fakeService = {
		VIEW_PERMISSIONS: ["cancellations.view"],
		MANAGE_PERMISSIONS: ["cancellations.manage"],
		getSyncRun: async (id) =>
			id === "known" ? { id, status: "RUNNING" } : null,
		startSync: async (body, user) => ({
			run: { id: "run-1", competencia: body.competencia, status: "RUNNING" },
			user: user.uid,
		}),
	};
	const originalService = require.cache[servicePath];
	const originalRoutes = require.cache[routesPath];
	require.cache[servicePath] = { exports: fakeService };
	delete require.cache[routesPath];
	const createRouter = require(routesPath);

	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		req.user = { uid: "user-1", role: req.get("x-role") || "supervisor" };
		next();
	});
	const pass = (_req, _res, next) => next();
	app.use(
		createRouter({
			fallbackRoles: ["admin"],
			requireAnyPermission: () => pass,
			requireAuthenticated: pass,
			requireCsrfToken: pass,
			requireRoles: (roles) => (req, res, next) => {
				if (!roles.includes(req.user.role)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}
				next();
			},
		}),
	);

	return {
		app,
		restore() {
			delete require.cache[routesPath];
			if (originalRoutes) require.cache[routesPath] = originalRoutes;
			if (originalService) require.cache[servicePath] = originalService;
			else delete require.cache[servicePath];
		},
	};
}

test("somente admin inicia sincronizacao nativa", async () => {
	const context = buildApp();
	try {
		await request(context.app)
			.post("/sync")
			.set("x-role", "supervisor")
			.send({ competencia: "2026-10" })
			.expect(403);
		const response = await request(context.app)
			.post("/sync")
			.set("x-role", "admin")
			.send({ competencia: "2026-10" })
			.expect(202);
		assert.equal(response.body.run.status, "RUNNING");
		assert.equal(response.body.user, "user-1");
	} finally {
		context.restore();
	}
});

test("consulta o andamento sem expor uma execucao inexistente", async () => {
	const context = buildApp();
	try {
		await request(context.app).get("/sync/known").expect(200);
		await request(context.app).get("/sync/missing").expect(404);
	} finally {
		context.restore();
	}
});
