import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const { sanitizeForLog } = finanRequire("./src/security/logSanitizer.js");
const { isDatabaseError, toClientResponse } = finanRequire("./src/security/errors.js");
const { resolveFinanCorsAllowlist, buildFinanCorsOptions, DEFAULT_DEV_ORIGINS } = finanRequire(
	"./src/security/cors.js",
);

describe("security/logSanitizer", () => {
	it("mascara chaves sensiveis em qualquer nivel do objeto", () => {
		const input = {
			email: "user@example.com",
			password: "fake-password",
			nested: { token: "fake-token", ok: true },
			list: [{ secret: "fake-secret" }, { clientSecret: "fake-client-secret" }],
		};
		const result = sanitizeForLog(input);
		expect(result.email).toBe("user@example.com");
		expect(result.password).toBe("***");
		expect(result.nested.token).toBe("***");
		expect(result.nested.ok).toBe(true);
		expect(result.list[0].secret).toBe("***");
		expect(result.list[1].clientSecret).toBe("***");
	});

	it("mascara variantes com underscore e camelCase (accessToken, api_key, etc.)", () => {
		const result = sanitizeForLog({
			accessToken: "a",
			refreshToken: "b",
			apiKey: "c",
			api_key: "d",
			client_secret: "e",
			Authorization: "f",
			Cookie: "g",
			senha: "h",
		});
		for (const key of Object.keys(result)) {
			expect(result[key]).toBe("***");
		}
	});

	it("nao muda o objeto original", () => {
		const input = { password: "fake-password" };
		sanitizeForLog(input);
		expect(input.password).toBe("fake-password");
	});

	it("resume um Error para name/message/code/status, sem stack", () => {
		const error = new Error("falhou");
		error.code = "42601";
		const result = sanitizeForLog(error);
		expect(result).not.toHaveProperty("stack");
		expect(result.message).toBe("falhou");
		expect(result.code).toBe("42601");
	});
});

describe("security/errors", () => {
	it("identifica um erro cru do driver pg (SQLSTATE + forma do DatabaseError)", () => {
		const pgError = new Error("duplicate key value violates unique constraint \"finan_users_email_key\"");
		pgError.code = "23505";
		pgError.severity = "ERROR";
		pgError.table = "finan_users";
		pgError.constraint = "finan_users_email_key";
		expect(isDatabaseError(pgError)).toBe(true);
	});

	it("nao confunde um erro de aplicacao com codigo parecido com um erro de pg", () => {
		const appError = new Error("Você não tem permissão para acessar esta área do Finan.");
		appError.status = 403;
		expect(isDatabaseError(appError)).toBe(false);
	});

	it("esconde a mensagem de um erro de pg no retorno ao cliente", () => {
		const pgError = new Error("duplicate key value violates unique constraint \"finan_users_email_key\"");
		pgError.code = "23505";
		pgError.severity = "ERROR";
		pgError.table = "finan_users";
		const { status, body } = toClientResponse(pgError);
		expect(status).toBe(500);
		expect(body.error).toBe("Erro interno do servidor.");
		expect(body.error).not.toMatch(/finan_users/);
	});

	it("preserva mensagem de erro de negocio (httpError) com status explicito", () => {
		const error = new Error("Aprovação não encontrada.");
		error.statusCode = 404;
		const { status, body } = toClientResponse(error);
		expect(status).toBe(404);
		expect(body.error).toBe("Aprovação não encontrada.");
	});

	it("preserva mensagem de erro de negocio sem status explicito (nao regride UX existente)", () => {
		const error = new Error("SMTP incompleto. Configure host, porta, usuário e senha.");
		const { status, body } = toClientResponse(error);
		expect(status).toBe(500);
		expect(body.error).toBe("SMTP incompleto. Configure host, porta, usuário e senha.");
	});
});

describe("security/cors", () => {
	it("sem nenhuma env configurada, usa apenas origens de dev conhecidas (nunca aceita tudo)", () => {
		const allowlist = resolveFinanCorsAllowlist({});
		expect(allowlist).toEqual(expect.arrayContaining(DEFAULT_DEV_ORIGINS));
		expect(allowlist).not.toContain("*");
	});

	it("usa FINAN_CORS_ORIGINS (lista) quando configurada, ignorando os defaults de dev", () => {
		const allowlist = resolveFinanCorsAllowlist({
			FINAN_CORS_ORIGINS: "https://finan.retiradas.tech, https://outra.example.com",
		});
		expect(allowlist).toEqual(["https://finan.retiradas.tech", "https://outra.example.com"]);
	});

	it("callback do cors nega origem fora da allowlist", () => {
		const options = buildFinanCorsOptions({ FINAN_CORS_ORIGINS: "https://finan.retiradas.tech" });
		let result;
		options.origin("https://site-malicioso.example.com", (error, allowed) => {
			result = { error, allowed };
		});
		expect(result.allowed).toBeUndefined();
		expect(result.error).toBeInstanceOf(Error);
	});

	it("callback do cors aceita origem da allowlist", () => {
		const options = buildFinanCorsOptions({ FINAN_CORS_ORIGINS: "https://finan.retiradas.tech" });
		let result;
		options.origin("https://finan.retiradas.tech", (error, allowed) => {
			result = { error, allowed };
		});
		expect(result.error).toBeFalsy();
		expect(result.allowed).toBe(true);
	});

	it("callback do cors aceita requests sem Origin (curl/health-check/server-to-server)", () => {
		const options = buildFinanCorsOptions({ FINAN_CORS_ORIGINS: "https://finan.retiradas.tech" });
		let result;
		options.origin(undefined, (error, allowed) => {
			result = { error, allowed };
		});
		expect(result.error).toBeFalsy();
		expect(result.allowed).toBe(true);
	});
});
