// categoria: mass-assignment
// Confirma que PATCH/PUT de usuario/cargo nao aceita campos extras que
// aumentariam privilegio (is_admin, permissions, password_hash, role_id
// direto sem passar pela resolucao de cargo).
//
// Ate a introducao dos DTOs (`apps/finan/backend/src/dtos/`), o backend so
// evitava isso por acidente de implementacao: cada rota fazia
// `coalesce($n, coluna)` explicito por campo em vez de espalhar `req.body`,
// entao campos extras eram silenciosamente IGNORADOS (a requisicao
// terminava em 200, so que sem efeito nenhum dos campos indevidos). Isso
// funcionava, mas nao dava nenhum sinal de que algo suspeito foi tentado.
//
// Com os DTOs (`userDto.js`, `roleDto.js`, `unknownKeys: "reject"`), o mesmo
// payload agora e REJEITADO com 400/VALIDATION_ERROR antes de chegar perto
// do SQL — mudanca deliberada, documentada em `docs/DTO-MAPPING.md`. Um
// payload legitimo (sem os campos extras) continua funcionando normalmente;
// os testes abaixo cobrem os dois casos.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "../testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

/**
 * O dbMock generico (testUtils.js) nao conhece o UPDATE de finan_users —
 * so os endpoints ja cobertos pela regressao de autorizacao. Aqui
 * simulamos "usuario encontrado e atualizado" pra chegar ate a parte que
 * realmente queremos testar: quais colunas o SQL de fato usa.
 */
function withUserUpdateFound(dbMock) {
	const original = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/select id\s+from finan_roles/i.test(sql)) {
			return { rows: [{ id: params?.[0] }] };
		}
		if (/update finan_users/i.test(sql) && /returning/i.test(sql)) {
			return {
				rows: [
					{
						id: params?.[0] || "user-1",
						name: "Nome Legitimo",
						email: "user1@example.com",
						role_id: "analista_financeiro",
						status: "ativo",
						mfa_enabled: false,
						avatar_url: "",
						source_role: null,
						source_system: "finan",
						source_permissions: [],
						created_at: new Date(),
						updated_at: new Date(),
					},
				],
			};
		}
		return original(text, params);
	});
}

describe("security/mass-assignment", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: adminSession() });
		withUserUpdateFound(dbMock);
		app = loadFinanApp(dbMock);
	}, 30000);

	it("PUT /admin/users/:id rejeita is_admin/permissions/password_hash no corpo (400 VALIDATION_ERROR)", async () => {
		const response = await request(app)
			.put("/api/admin/users/user-1")
			.set("Authorization", BEARER)
			.send({
				nome: "Nome Legitimo",
				is_admin: true,
				permissions: ["*"],
				password_hash: "hash-forjado",
				role_id: "admin",
			});

		expect(response.status).toBe(400);
		expect(response.body.ok).toBe(false);
		expect(response.body.code).toBe("VALIDATION_ERROR");
		expect(response.body.fields).toMatchObject({
			is_admin: expect.any(String),
			permissions: expect.any(String),
			password_hash: expect.any(String),
		});
		// nunca chega a executar update algum com esses campos
		const updateCall = dbMock.query.mock.calls.find(([sql]) =>
			String(sql).includes("update finan_users"),
		);
		expect(updateCall).toBeUndefined();
	});

	it("PUT /admin/users/:id com payload legítimo (sem campos extras) é aceito normalmente", async () => {
		const response = await request(app)
			.put("/api/admin/users/user-1")
			.set("Authorization", BEARER)
			.send({ nome: "Nome Legitimo", role_id: "admin", status: "ativo" });

		expect(response.status).toBe(200);
		const updateCall = dbMock.query.mock.calls.find(([sql]) =>
			String(sql).includes("update finan_users"),
		);
		expect(updateCall).toBeDefined();
		const [sql, params] = updateCall;
		expect(sql).not.toMatch(/is_admin\s*=/);
		expect(sql).not.toMatch(/permissions\s*=/);
		expect(params).not.toContain("hash-forjado");
	});

	it("PUT /admin/users/:id aceita avatarUrl grande (data URI base64 de uma foto real) — bug relatado em producao", async () => {
		// O avatar do Finan e salvo como data URI base64 inline (POST
		// /admin/avatars devolve isso pro form, ver compat/routes.js). Editar
		// QUALQUER campo de um usuario com avatar customizado reenvia esse
		// valor gigante junto — antes da correcao, o maxLength:2000 do DTO
		// rejeitava isso com "Dados invalidos." mesmo so trocando o cargo.
		const avatarUrlGrande = `data:image/jpeg;base64,${"A".repeat(170000)}`;
		const response = await request(app)
			.put("/api/admin/users/user-1")
			.set("Authorization", BEARER)
			.send({ nome: "Nome Legitimo", role: "coordenadorfinanceiro", status: "ativo", avatarUrl: avatarUrlGrande });

		expect(response.status).toBe(200);
	});

	it("PATCH /finan/usuarios/:id (users/routes.js) rejeita is_admin/permissions no corpo (400 VALIDATION_ERROR)", async () => {
		const response = await request(app)
			.patch("/api/finan/usuarios/user-1")
			.set("Authorization", BEARER)
			.send({ is_admin: true, permissions: ["*"], status: "ativo" });

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("VALIDATION_ERROR");
		expect(response.body.fields).toMatchObject({
			is_admin: expect.any(String),
			permissions: expect.any(String),
		});
		const updateCall = dbMock.query.mock.calls.find(([sql]) =>
			String(sql).includes("update finan_users"),
		);
		expect(updateCall).toBeUndefined();
	});

	it("PATCH /finan/usuarios/:id com payload legítimo (só status) é aceito normalmente", async () => {
		const response = await request(app)
			.patch("/api/finan/usuarios/user-1")
			.set("Authorization", BEARER)
			.send({ status: "ativo" });

		expect(response.status).toBe(200);
		const updateCall = dbMock.query.mock.calls.find(([sql]) =>
			String(sql).includes("update finan_users"),
		);
		expect(updateCall).toBeDefined();
		expect(updateCall[0]).not.toMatch(/is_admin\s*=/);
	});

	it("POST /finan/usuarios/roles com is_admin:true e ator não-admin -> 403 (nunca grava)", async () => {
		const nonAdminSession = {
			id: "user-nao-admin",
			name: "Usuario Comum",
			email: "comum@example.com",
			role_id: "analista_financeiro",
			status: "ativo",
			avatar_url: "",
			permissions: ["finan.usuarios.manage"],
			is_admin: false,
		};
		dbMock.setSession(nonAdminSession);

		const response = await request(app)
			.post("/api/finan/usuarios/roles")
			.set("Authorization", BEARER)
			.send({ name: "Cargo Suspeito", is_admin: true });

		expect(response.status).toBe(403);
		const insertCall = dbMock.query.mock.calls.find(([sql]) =>
			String(sql).includes("insert into finan_roles"),
		);
		expect(insertCall).toBeUndefined();
	});

	it("PUT /admin/roles/:id com payload contendo chave desconhecida ('empresaId') -> 400 VALIDATION_ERROR", async () => {
		const response = await request(app)
			.put("/api/admin/roles/algum-cargo")
			.set("Authorization", BEARER)
			.send({ name: "Cargo X", empresaId: "empresa-secreta" });

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("VALIDATION_ERROR");
		expect(response.body.fields).toMatchObject({ empresaId: expect.any(String) });
	});
});
