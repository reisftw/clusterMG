import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/rot/backend/package.json"));
const { validateBody } = require("./src/security/bodyValidation.js");

function runMiddleware(body, allowedFields, options) {
	const status = vi.fn(() => response);
	const json = vi.fn();
	const response = { status, json };
	const next = vi.fn();

	validateBody(allowedFields, options)({ body }, response, next);

	return { status, json, next };
}

describe("Operacao body validation", () => {
	it("allows only whitelisted fields", () => {
		const { status, json, next } = runMiddleware({ username: "admin", password: "secret" }, ["username", "password"], { allowEmpty: false });

		expect(next).toHaveBeenCalledOnce();
		expect(status).not.toHaveBeenCalled();
		expect(json).not.toHaveBeenCalled();
	});

	it("rejects unknown fields before route handlers run", () => {
		const { status, json, next } = runMiddleware({ username: "admin", password: "secret", role: "site_admin" }, ["username", "password"], { allowEmpty: false });

		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith({
			ok: false,
			error: "Campo(s) não permitido(s): role.",
		});
	});

	it("rejects non-object bodies and required empty bodies", () => {
		expect(runMiddleware([], ["name"]).status).toHaveBeenCalledWith(400);
		expect(runMiddleware({}, ["name"], { allowEmpty: false }).status).toHaveBeenCalledWith(400);
	});
});
