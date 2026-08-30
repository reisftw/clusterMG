import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const dbPath = require.resolve(path.join(process.cwd(), "vps/api/src/db.js"));
require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		getRequestContext: vi.fn(() => null),
		query: vi.fn(),
	},
};
const auditLog = require(path.join(process.cwd(), "vps/api/src/auditLog.js"));

describe("auditLog helpers", () => {
	const {
		calculateChangedFields,
		getClientIpFromRequest,
		sanitizeAuditValue,
		shouldAuditDocument,
	} = auditLog.__testables;

	it("mascara campos sensiveis em objetos aninhados", () => {
		expect(
			sanitizeAuditValue({
				nome: "Maria",
				password: "123456",
				perfil: {
					apiToken: "abc",
					email: "maria@example.com",
				},
			}),
		).toEqual({
			nome: "Maria",
			password: "[REDACTED]",
			perfil: {
				apiToken: "[REDACTED]",
				email: "maria@example.com",
			},
		});
	});

	it("calcula somente os campos alterados depois da sanitizacao", () => {
		expect(
			calculateChangedFields(
				{ nome: "Centro", token: "antigo", valor: 10 },
				{ nome: "Centro atualizado", token: "novo", valor: 10 },
			),
		).toEqual(["nome"]);
	});

	it("usa o primeiro IP do x-forwarded-for", () => {
		const req = {
			get: (header) =>
				header === "x-forwarded-for" ? "10.0.0.1, 10.0.0.2" : "",
			ip: "127.0.0.1",
		};

		expect(getClientIpFromRequest(req)).toBe("10.0.0.1");
	});

	it("ignora colecoes internas e audita colecoes de negocio", () => {
		expect(shouldAuditDocument("audit_logs")).toBe(false);
		expect(shouldAuditDocument("password_reset_tokens")).toBe(false);
		expect(shouldAuditDocument("financeiro_config")).toBe(true);
	});
});
