import { createRequire } from "node:module";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/rot/backend/package.json"));
// express nao e dependencia do pacote raiz (so do backend da Operação) —
// resolve pelo require escopado ao package.json do apps/rot/backend, igual
// aos demais modulos deste teste.
const express = require("express");

const middlewarePath = require.resolve("./src/auth/middleware.js");
const dbPath = require.resolve("./src/db.js");
const companiesRoutesPath = require.resolve("./src/companies/routes.js");
const techniciansRoutesPath = require.resolve("./src/technicians/routes.js");

function clearCache() {
	for (const key of [middlewarePath, dbPath, companiesRoutesPath, techniciansRoutesPath]) {
		delete require.cache[key];
	}
}

// SEC-002: monta o router real (companies ou technicians) com o middleware
// de auth real (requireRegionalOwnership, scopeRegionalFilter) mas com
// requireRotAuth/requireRotPermission substituidos por um double simples
// controlado pelo header x-test-user — evita precisar de um JWT real so
// para testar isolamento por regional.
function loadRouterWithUser(routesPath, dbQuery) {
	clearCache();
	const dbClient = { query: dbQuery, release: () => {} };
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query: dbQuery, connect: async () => dbClient },
	};

	const realMiddleware = require("./src/auth/middleware.js");
	const fakeMiddleware = {
		...realMiddleware,
		requireRotAuth: (req, res, next) => {
			const raw = req.headers["x-test-user"];
			req.rotUser = raw ? JSON.parse(raw) : null;
			req.user = req.rotUser;
			if (!req.rotUser) {
				res.status(401).json({ ok: false, error: "sem usuario de teste" });
				return;
			}
			next();
		},
		requireRotPermission: () => (req, res, next) => next(),
	};
	require.cache[middlewarePath] = { id: middlewarePath, filename: middlewarePath, loaded: true, exports: fakeMiddleware };

	delete require.cache[routesPath];
	const router = require(routesPath);
	const app = express();
	app.use(express.json());
	app.use("/resource", router);
	return app;
}

function userHeader(user) {
	return { "x-test-user": JSON.stringify(user) };
}

const regionalA = { id: "user-a", is_global: false, regional_id: "regional-a", permissions: ["*"] };
const regionalB = { id: "user-b", is_global: false, regional_id: "regional-b", permissions: ["*"] };
const globalUser = { id: "user-admin", is_global: true, regional_id: null, permissions: ["*"] };

describe("SEC-002: isolamento por regional em companies e technicians (Operação)", () => {
	afterEach(() => {
		clearCache();
		vi.restoreAllMocks();
	});

	describe("technicians (coluna direta regional_id)", () => {
		function makeDb() {
			const tech = { id: "tech-1", regional_id: "regional-a", nome: "Tecnico A", status: "Ativo" };
			return vi.fn(async (sql, params = []) => {
				const text = String(sql).replace(/\s+/g, " ").toLowerCase();
				if (text.includes("select regional_id from operacao_tecnicos where id")) {
					return { rows: params[0] === tech.id ? [{ regional_id: tech.regional_id }] : [] };
				}
				if (text.includes("update operacao_tecnicos") || text.includes("delete from operacao_tecnico_operation_scopes") || text.includes("insert into operacao_tecnico_operation_scopes")) {
					return { rows: [], rowCount: 1 };
				}
				if (text.startsWith("select") && text.includes("from operacao_tecnicos t")) {
					return { rows: [{ ...tech, operation_scopes: [] }] };
				}
				if (text.includes("begin") || text.includes("commit") || text.includes("rollback")) return { rows: [] };
				return { rows: [] };
			});
		}

		it("bloqueia PUT de tecnico de outra regional com 403", async () => {
			const app = loadRouterWithUser(techniciansRoutesPath, makeDb());
			const res = await request(app)
				.put("/resource/tech-1")
				.set(userHeader(regionalB))
				.send({ name: "Tentativa maliciosa" });
			expect(res.status).toBe(403);
		});

		it("bloqueia DELETE de tecnico de outra regional com 403", async () => {
			const app = loadRouterWithUser(techniciansRoutesPath, makeDb());
			const res = await request(app).delete("/resource/tech-1").set(userHeader(regionalB));
			expect(res.status).toBe(403);
		});

		it("permite PUT/DELETE quando o tecnico e da propria regional", async () => {
			const app = loadRouterWithUser(techniciansRoutesPath, makeDb());
			const put = await request(app)
				.put("/resource/tech-1")
				.set(userHeader(regionalA))
				.send({ name: "Atualização legítima" });
			expect(put.status).toBe(200);

			const del = await request(app).delete("/resource/tech-1").set(userHeader(regionalA));
			expect(del.status).toBe(200);
		});

		it("usuario global sempre passa, independente da regional do tecnico", async () => {
			const app = loadRouterWithUser(techniciansRoutesPath, makeDb());
			const res = await request(app)
				.put("/resource/tech-1")
				.set(userHeader(globalUser))
				.send({ name: "Ajuste do admin" });
			expect(res.status).toBe(200);
		});

		it("retorna 404 (nao 403) para tecnico inexistente", async () => {
			const app = loadRouterWithUser(techniciansRoutesPath, makeDb());
			const res = await request(app)
				.put("/resource/nao-existe")
				.set(userHeader(regionalA))
				.send({ name: "x" });
			expect(res.status).toBe(404);
		});
	});

	describe("companies (N:N via operacao_empresa_regionais)", () => {
		function makeDb() {
			const company = { id: "company-1", nome: "Empresa A", status: "Ativa" };
			const links = [{ empresa_id: "company-1", regional_id: "regional-a" }];
			return vi.fn(async (sql, params = []) => {
				const text = String(sql).replace(/\s+/g, " ").toLowerCase();
				if (text.includes("select id from operacao_empresas where id")) {
					return { rows: params[0] === company.id ? [{ id: company.id }] : [] };
				}
				if (text.includes("select regional_id from operacao_empresa_regionais where empresa_id")) {
					return { rows: links.filter((l) => l.empresa_id === params[0]) };
				}
				if (text.includes("from regionais where id = any")) {
					return { rows: [{ total: (params[0] || []).length }] };
				}
				if (text.includes("from operacao_agentes where id::text = any")) {
					return { rows: [{ total: (params[0] || []).length }] };
				}
				if (text.includes("update operacao_empresas") || text.includes("delete from operacao_empresa") || text.includes("insert into operacao_empresa")) {
					return { rows: [], rowCount: 1 };
				}
				if (text.startsWith("select") && text.includes("from operacao_empresas e")) {
					return { rows: [{ ...company, regional_ids: [], regional_names: [], agent_ids: [], agent_names: [], operation_scopes: [], technicians: [] }] };
				}
				if (text.includes("begin") || text.includes("commit") || text.includes("rollback")) return { rows: [] };
				return { rows: [] };
			});
		}

		it("bloqueia PUT de empresa de outra regional com 403", async () => {
			const app = loadRouterWithUser(companiesRoutesPath, makeDb());
			const res = await request(app)
				.put("/resource/company-1")
				.set(userHeader(regionalB))
				.send({ name: "Tentativa maliciosa" });
			expect(res.status).toBe(403);
		});

		it("bloqueia DELETE de empresa de outra regional com 403", async () => {
			const app = loadRouterWithUser(companiesRoutesPath, makeDb());
			const res = await request(app).delete("/resource/company-1").set(userHeader(regionalB));
			expect(res.status).toBe(403);
		});

		it("permite PUT quando a empresa pertence a regional do usuario", async () => {
			const app = loadRouterWithUser(companiesRoutesPath, makeDb());
			const res = await request(app)
				.put("/resource/company-1")
				.set(userHeader(regionalA))
				.send({ name: "Atualização legítima" });
			expect(res.status).toBe(200);
		});

		it("usuario global sempre passa, independente da regional da empresa", async () => {
			const app = loadRouterWithUser(companiesRoutesPath, makeDb());
			const res = await request(app)
				.put("/resource/company-1")
				.set(userHeader(globalUser))
				.send({ name: "Ajuste do admin" });
			expect(res.status).toBe(200);
		});

		it("retorna 404 (nao 403) para empresa inexistente", async () => {
			const app = loadRouterWithUser(companiesRoutesPath, makeDb());
			const res = await request(app)
				.put("/resource/nao-existe")
				.set(userHeader(regionalA))
				.send({ name: "x" });
			expect(res.status).toBe(404);
		});
	});
});
