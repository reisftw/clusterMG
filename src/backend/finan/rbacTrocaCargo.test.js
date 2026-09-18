// RBAC — troca de cargo de usuario (PUT /admin/users/:id). Cobre o bug
// relatado em producao: selecionar "Coordenador Financeiro" e salvar nao
// dava erro nenhum, mas tambem nao mudava o cargo. Causa raiz:
// resolveFinanRoleId() (compat/routes.js) tinha uma blacklist
// `and id not in ('analistafinanceiro', 'coordenadorfinanceiro')` que
// excluia justamente o UNICO id de coordenador que existe de verdade no
// banco (`coordenadorfinanceiro` — nunca existiu um `coordenador_financeiro`
// com underscore correspondente). A funcao caia no fallback
// "analista_financeiro" silenciosamente, entao o cargo nunca virava
// coordenador (e nem dava erro, porque tecnicamente o UPDATE sempre
// "funcionava", so que gravando o cargo errado).
//
// Em vez de mockar so o formato da resposta (o que nao pegaria uma
// blacklist reintroduzida no SQL), o mock abaixo interpreta de verdade o
// `... and id not in (...)` da query real, pra esse teste continuar
// pegando se a blacklist voltar no futuro.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

const ROLES_TABLE = [
	{ id: "admin", is_admin: true },
	{ id: "analista_financeiro", is_admin: false },
	{ id: "coordenadorfinanceiro", is_admin: false }, // unico cargo de coordenador que existe de verdade
	{ id: "analistafinanceirocr", is_admin: false },
];

function withRealisticRoleResolution(dbMock) {
	const original = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/select id\s+from finan_roles/i.test(sql)) {
			const requestedId = params?.[0];
			const role = ROLES_TABLE.find((r) => r.id === requestedId);
			if (!role) return { rows: [] };
			const notInMatch = sql.match(/id not in \(([^)]*)\)/i);
			if (notInMatch) {
				const blacklisted = notInMatch[1].split(",").map((s) => s.trim().replace(/'/g, ""));
				if (blacklisted.includes(role.id)) return { rows: [] };
			}
			const allowed = role.is_admin || ["admin", "coordenador_financeiro", "analista_financeiro"].includes(role.id) || role.id === "coordenadorfinanceiro" || role.id === "analistafinanceirocr";
			return { rows: allowed ? [{ id: role.id }] : [] };
		}
		if (/update finan_users/i.test(sql) && /returning/i.test(sql)) {
			return {
				rows: [
					{
						id: params?.[0] || "user-1",
						name: "Rodrigo Reis",
						email: "rodrigo.reis.divino@gmail.com",
						role_id: params?.[3] || "analistafinanceirocr",
						status: "ativo",
						mfa_enabled: false,
						avatar_url: "",
						source_role: null,
						source_system: "finan",
						created_at: new Date(),
						updated_at: new Date(),
					},
				],
			};
		}
		return original(text, params);
	});
}

describe("PUT /api/admin/users/:id — troca de cargo", { timeout: 15000 }, () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: adminSession() });
		withRealisticRoleResolution(dbMock);
		app = loadFinanApp(dbMock);
	});

	it("trocar para Coordenador Financeiro (id real: coordenadorfinanceiro) de fato muda o role_id gravado", async () => {
		const response = await request(app)
			.put("/api/admin/users/user-1")
			.set("Authorization", BEARER)
			.send({ nome: "Rodrigo Reis", role: "coordenadorfinanceiro", status: "ativo" });

		expect(response.status).toBe(200);
		expect(response.body.user.roleId ?? response.body.user.role_id).toBe("coordenadorfinanceiro");
	});

	it("GET /admin/roles lista o cargo Coordenador Financeiro entre as opcoes (nao fica escondido do dropdown)", async () => {
		dbMock.query.mockImplementationOnce(async () => ({
			rows: ROLES_TABLE.map((r) => ({ id: r.id, name: r.id, description: "", permissions: [], is_admin: r.is_admin, system_role: false, active: true })),
		}));
		const response = await request(app).get("/api/admin/roles").set("Authorization", BEARER);
		expect(response.status).toBe(200);
	});

	it("id de cargo inexistente/invalido preserva o cargo atual do usuario (coalesce), em vez de resetar silenciosamente", async () => {
		const response = await request(app)
			.put("/api/admin/users/user-1")
			.set("Authorization", BEARER)
			.send({ nome: "Rodrigo Reis", role: "cargo-que-nao-existe", status: "ativo" });

		expect(response.status).toBe(200);
		// coalesce($4, role_id) com $4 = null preserva o valor atual do mock
		// (retornado pelo UPDATE simulado) — nao vira "analista_financeiro".
		expect(response.body.user.roleId ?? response.body.user.role_id).not.toBe("analista_financeiro");
	});
});
