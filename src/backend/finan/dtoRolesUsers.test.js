// Cobre os DTOs de cargo/usuario (`dtos/roleDto.js`, `dtos/userDto.js`)
// aplicados em `users/routes.js`. Ver `security/massAssignment.test.js`
// para os casos focados especificamente em mass assignment; aqui o foco e
// o contrato geral do DTO (payload valido / campo obrigatorio ausente /
// tipo errado / valor fora do intervalo / id invalido / whitelist de
// permissao).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function withRolesSupport(dbMock) {
	const original = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params) => {
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
						active: true,
						hierarchy_level: params?.[5],
					},
				],
			};
		}
		if (/update finan_roles/i.test(sql) && /returning/i.test(sql)) {
			return {
				rows: [
					{
						id: params?.[0],
						name: "Cargo Atualizado",
						description: "",
						permissions: [],
						is_admin: false,
						system_role: false,
						active: true,
						hierarchy_level: 500,
					},
				],
			};
		}
		return original(text, params);
	});
}

describe("DTOs de cargo/usuário (users/routes.js)", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: adminSession() });
		withRolesSupport(dbMock);
		app = loadFinanApp(dbMock);
	}, 30000);

	describe("POST /finan/usuarios/roles", () => {
		it("payload válido é aceito", async () => {
			const response = await request(app)
				.post("/api/finan/usuarios/roles")
				.set("Authorization", BEARER)
				.send({ name: "Cargo Financeiro", permissions: ["finan.dashboard.view"], hierarchy_level: 10 });
			expect(response.status).toBe(200);
			expect(response.body.ok).toBe(true);
		});

		it("campo obrigatório ausente (name) -> 400 VALIDATION_ERROR", async () => {
			const response = await request(app)
				.post("/api/finan/usuarios/roles")
				.set("Authorization", BEARER)
				.send({ description: "sem nome" });
			expect(response.status).toBe(400);
			expect(response.body.code).toBe("VALIDATION_ERROR");
			expect(response.body.fields.name).toBeTruthy();
		});

		it("tipo errado (hierarchy_level como texto não numérico) -> 400", async () => {
			const response = await request(app)
				.post("/api/finan/usuarios/roles")
				.set("Authorization", BEARER)
				.send({ name: "Cargo X", hierarchy_level: "abc" });
			expect(response.status).toBe(400);
			expect(response.body.fields.hierarchy_level).toBeTruthy();
		});

		it("valor fora do intervalo (hierarchy_level negativo) -> 400", async () => {
			const response = await request(app)
				.post("/api/finan/usuarios/roles")
				.set("Authorization", BEARER)
				.send({ name: "Cargo X", hierarchy_level: -5 });
			expect(response.status).toBe(400);
			expect(response.body.fields.hierarchy_level).toBeTruthy();
		});

		it("permissão desconhecida (fora do catálogo) -> 400", async () => {
			const response = await request(app)
				.post("/api/finan/usuarios/roles")
				.set("Authorization", BEARER)
				.send({ name: "Cargo X", permissions: ["finan.hackear_tudo"] });
			expect(response.status).toBe(400);
			expect(response.body.fields.permissions).toBeTruthy();
		});

		it("campo desconhecido (mass assignment) -> 400, requisição inteira rejeitada", async () => {
			const response = await request(app)
				.post("/api/finan/usuarios/roles")
				.set("Authorization", BEARER)
				.send({ name: "Cargo X", empresa_id: "outra-empresa" });
			expect(response.status).toBe(400);
			expect(response.body.fields.empresa_id).toBeTruthy();
		});
	});

	describe("PATCH /finan/usuarios/roles/:id", () => {
		it("parcial: só o campo enviado é validado/atualizado", async () => {
			const response = await request(app)
				.patch("/api/finan/usuarios/roles/analista_financeiro")
				.set("Authorization", BEARER)
				.send({ active: false });
			expect(response.status).toBe(200);
		});

		it("id de params inválido -> 400", async () => {
			const response = await request(app)
				.patch("/api/finan/usuarios/roles/" + encodeURIComponent("id com espaço"))
				.set("Authorization", BEARER)
				.send({ active: false });
			expect(response.status).toBe(400);
		});
	});
});
