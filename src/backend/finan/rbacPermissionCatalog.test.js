// RBAC — catalogo canonico de permissoes (rbac/permissionCatalog.js).
// Cobre o bug relatado pelo usuario: a tela de Cargos e Permissoes
// oferecia opcoes (Notas > Gerenciar, Central de Pendencias, Contratos)
// que o backend nao reconhecia como validas — salvar um cargo com
// qualquer uma delas marcada falhava com "Dados invalidos." (400),
// porque a whitelist do DTO (roleDto.js) nao tinha essas 4 permissoes,
// mesmo elas ja sendo aplicadas de verdade em rotas reais
// (requireFinanPermission("finan.notas.manage") etc).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
const { PERMISSION_CATALOG, isKnownPermission } = finanRequire("./src/rbac/permissionCatalog.js");

const BEARER = "Bearer qualquer-token-de-teste";

describe("RBAC — catalogo de permissoes", () => {
	it("conhece as 4 permissoes que faltavam (bug relatado em producao)", () => {
		expect(isKnownPermission("finan.notas.manage")).toBe(true);
		expect(isKnownPermission("finan.pendencias.view")).toBe(true);
		expect(isKnownPermission("finan.contratos.view")).toBe(true);
		expect(isKnownPermission("finan.contratos.manage")).toBe(true);
	});

	it("todo permission id do catalogo e unico (sem duplicata acidental)", () => {
		const ids = PERMISSION_CATALOG.map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("PUT /api/admin/roles/:id — salvar cargo com as permissoes antes rejeitadas", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: adminSession() });
		const baseQuery = dbMock.query;
		dbMock.query = async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/insert into finan_roles/i.test(sql)) {
				return {
					rows: [
						{
							id: params?.[0],
							name: params?.[1],
							description: params?.[2],
							permissions: JSON.parse(params?.[3] || "[]"),
							is_admin: params?.[4],
							system_role: false,
							active: params?.[5],
						},
					],
				};
			}
			return baseQuery(text, params);
		};
		app = loadFinanApp(dbMock);
	});

	it("aceita finan.notas.manage, finan.pendencias.view e finan.contratos.view/.manage juntos (200, nao 400)", async () => {
		const response = await request(app)
			.put("/api/admin/roles/analista-completo")
			.set("Authorization", BEARER)
			.send({
				name: "Analista Completo",
				permissions: ["finan.notas.view", "finan.notas.manage", "finan.pendencias.view", "finan.contratos.view", "finan.contratos.manage"],
			});
		expect(response.status).toBe(200);
		expect(response.body.role.permissions).toContain("finan.notas.manage");
		expect(response.body.role.permissions).toContain("finan.pendencias.view");
	});

	it("GET /api/admin/roles devolve o catalogo com as 4 permissoes (mesma fonte do DTO — sem mais divergencia)", async () => {
		const response = await request(app).get("/api/admin/roles").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		const ids = response.body.permissions.map((item) => item.id);
		expect(ids).toContain("finan.notas.manage");
		expect(ids).toContain("finan.pendencias.view");
		expect(ids).toContain("finan.contratos.view");
		expect(ids).toContain("finan.contratos.manage");
	});
});
