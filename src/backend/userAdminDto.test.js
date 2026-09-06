// Testes unitários do DTO de atualização de usuário administrado (Fase C
// — docs/TECHNICAL-AUDIT.md) aplicado em `PUT /api/admin/users/:uid`
// (vps/api/src/app.js). Cobre só o shape/validação do DTO em si — a regra
// de negócio de quem pode alterar o quê já é testada por
// app.characterization.test.js e não foi alterada aqui.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const { UserAdminUpdateDTO } = require(
	path.join(process.cwd(), "vps/api/src/dtos/userAdminDto.js"),
);

describe("dtos/userAdminDto — UserAdminUpdateDTO", () => {
	it("aceita um payload típico de edição (nome, role, regional)", () => {
		const result = UserAdminUpdateDTO(
			{ nome: "Fulano", role: "supervisor", regional: "Metropolitana SUB2" },
			{ partial: true },
		);
		expect(result).toEqual({ nome: "Fulano", role: "supervisor", regional: "Metropolitana SUB2" });
	});

	it("aceita todos os aliases de empresa/avatar/insumos conhecidos", () => {
		const result = UserAdminUpdateDTO(
			{
				empresa_id: "emp-1",
				avatar_url: "/api/uploads/avatars/foo.png",
				insumos_base_id: "base-1",
				baseInsumosNome: "Base Central",
				insumosCategoriasVer: ["a", "b"],
			},
			{ partial: true },
		);
		expect(result).toMatchObject({
			empresa_id: "emp-1",
			avatar_url: "/api/uploads/avatars/foo.png",
			insumos_base_id: "base-1",
			baseInsumosNome: "Base Central",
			insumosCategoriasVer: ["a", "b"],
		});
	});

	it("campo desconhecido (ex.: isAdmin colado no body) nunca aparece no resultado (unknownKeys: strip)", () => {
		const result = UserAdminUpdateDTO(
			{ nome: "Fulano", isAdmin: true, empresaIdSecreto: "x" },
			{ partial: true },
		);
		expect(result).toEqual({ nome: "Fulano" });
		expect(result.isAdmin).toBeUndefined();
		expect(result.empresaIdSecreto).toBeUndefined();
	});

	it("disabled/trocar_senha devem ser booleanos — string 'true' é rejeitada", () => {
		expect(() =>
			UserAdminUpdateDTO({ disabled: "true" }, { partial: true }),
		).toThrow();
	});

	it("modo partial: campo ausente não gera erro nem entra no resultado", () => {
		const result = UserAdminUpdateDTO({ nome: "Só o nome" }, { partial: true });
		expect(result).toEqual({ nome: "Só o nome" });
	});
});
