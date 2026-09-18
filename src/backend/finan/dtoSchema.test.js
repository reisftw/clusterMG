// Testes unitarios do construtor de schema de DTOs
// (`apps/finan/backend/src/dtos/schema.js`). Sem HTTP/DB — so os
// validadores puros e `object().parse(...)`.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
const { string, enumField, boolean, integer, money, dateOnly, id, arrayOf, jsonObject, object } =
	finanRequire("./src/dtos/schema.js");
const { ValidationError } = finanRequire("./src/dtos/errors.js");

describe("dtos/schema", () => {
	describe("string()", () => {
		it("aceita texto valido e aplica trim", () => {
			expect(string()("  ok  ")).toEqual({ value: "ok", error: null });
		});
		it("obrigatorio + ausente -> erro", () => {
			expect(string({ required: true })(undefined).error).toBeTruthy();
		});
		it("respeita minLength/maxLength", () => {
			expect(string({ minLength: 3 })("ab").error).toBeTruthy();
			expect(string({ maxLength: 3 })("abcd").error).toBeTruthy();
		});
		it("valida pattern", () => {
			expect(string({ pattern: /^[a-z]+$/ })("ABC").error).toBeTruthy();
			expect(string({ pattern: /^[a-z]+$/ })("abc").error).toBeNull();
		});
		it("tipo errado -> erro", () => {
			expect(string()(123).error).toBeTruthy();
		});
	});

	describe("enumField()", () => {
		const status = enumField(["ativo", "inativo"]);
		it("aceita valor da lista", () => {
			expect(status("ativo").error).toBeNull();
		});
		it("rejeita valor fora da lista", () => {
			expect(status("banido").error).toBeTruthy();
		});
	});

	describe("integer()", () => {
		it("rejeita nao-inteiro/NaN/Infinity", () => {
			expect(integer()("abc").error).toBeTruthy();
			expect(integer()(1.5).error).toBeTruthy();
			expect(integer()(Infinity).error).toBeTruthy();
			expect(integer()(NaN).error).toBeTruthy();
		});
		it("respeita min/max", () => {
			expect(integer({ min: 0, max: 10 })(-1).error).toBeTruthy();
			expect(integer({ min: 0, max: 10 })(11).error).toBeTruthy();
			expect(integer({ min: 0, max: 10 })(5)).toEqual({ value: 5, error: null });
		});
	});

	describe("money()", () => {
		const price = money();
		it("aceita number/string numerica valida", () => {
			expect(price(10.5).error).toBeNull();
			expect(price("10.5").error).toBeNull();
		});
		it("rejeita NaN/Infinity/-Infinity/string nao numerica", () => {
			expect(price(NaN).error).toBeTruthy();
			expect(price(Infinity).error).toBeTruthy();
			expect(price(-Infinity).error).toBeTruthy();
			expect(price("abc").error).toBeTruthy();
		});
		it("rejeita negativo por padrao, mas aceita com allowNegative", () => {
			expect(price(-1).error).toBeTruthy();
			expect(money({ allowNegative: true })(-1).error).toBeNull();
		});
	});

	describe("dateOnly()", () => {
		const d = dateOnly();
		it("aceita YYYY-MM-DD", () => {
			expect(d("2026-09-06").error).toBeNull();
		});
		it("rejeita outros formatos (Date.toString(), ISO com hora, etc.)", () => {
			expect(d("Sun Sep 06 2026").error).toBeTruthy();
			expect(d("2026-09-06T00:00:00Z").error).toBeTruthy();
		});
	});

	describe("id()", () => {
		const idValidator = id();
		it("aceita IDs no formato do Finan (randomId, uuid, slug)", () => {
			expect(idValidator("finan_event_1234567890_a1b2c3d4e5f6").error).toBeNull();
			expect(idValidator("550e8400-e29b-41d4-a716-446655440000").error).toBeNull();
			expect(idValidator("analista_financeiro").error).toBeNull();
		});
		it("rejeita vazio e caracteres fora do charset seguro", () => {
			expect(idValidator("").error).toBeTruthy();
			expect(idValidator("id; drop table finan_users;").error).toBeTruthy();
		});
	});

	describe("arrayOf()", () => {
		const tags = arrayOf(string({ required: true }), { maxLength: 2 });
		it("valida cada item e propaga erro com indice", () => {
			const result = tags(["ok", 123]);
			expect(result.error).toMatch(/Item 2/);
		});
		it("respeita maxLength", () => {
			expect(tags(["a", "b", "c"]).error).toBeTruthy();
		});
	});

	describe("jsonObject()", () => {
		it("rejeita array/string/null no lugar de objeto", () => {
			expect(jsonObject()([1, 2]).error).toBeTruthy();
			expect(jsonObject()("nope").error).toBeTruthy();
		});
		it("rejeita objeto maior que o limite de bytes", () => {
			const big = { blob: "x".repeat(1000) };
			expect(jsonObject({ maxBytes: 10 })(big).error).toBeTruthy();
		});
	});

	describe("object() — mass assignment", () => {
		const schema = object(
			{ nome: string({ required: true }), idade: integer({ min: 0 }) },
			{ unknownKeys: "reject" },
		);

		it("aceita payload valido e devolve so os campos do shape", () => {
			expect(schema({ nome: "Ana", idade: 30 })).toEqual({ nome: "Ana", idade: 30 });
		});

		it("lanca ValidationError listando TODOS os campos invalidos de uma vez", () => {
			try {
				schema({ idade: -5 });
				throw new Error("deveria ter lancado");
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				expect(error.code).toBe("VALIDATION_ERROR");
				expect(error.fields.nome).toBeTruthy();
				expect(error.fields.idade).toBeTruthy();
			}
		});

		it("unknownKeys:'reject' rejeita campo extra (ex.: tentativa de mass assignment)", () => {
			expect(() => schema({ nome: "Ana", isAdmin: true })).toThrow(ValidationError);
			try {
				schema({ nome: "Ana", isAdmin: true });
			} catch (error) {
				expect(error.fields.isAdmin).toBeTruthy();
			}
		});

		it("unknownKeys:'strip' (padrao) ignora campo extra sem lancar", () => {
			const lenient = object({ nome: string({ required: true }) });
			expect(lenient({ nome: "Ana", isAdmin: true })).toEqual({ nome: "Ana" });
		});

		it("modo partial: so valida/atualiza campos presentes (uso em PATCH)", () => {
			expect(schema({ idade: 40 }, { partial: true })).toEqual({ idade: 40 });
		});
	});

	describe("boolean()", () => {
		it("rejeita valores nao booleanos (string 'true', 1, etc.)", () => {
			expect(boolean()("true").error).toBeTruthy();
			expect(boolean()(1).error).toBeTruthy();
		});
	});
});
