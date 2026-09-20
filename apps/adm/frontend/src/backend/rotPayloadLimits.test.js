import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/rot/backend/package.json"));
const { toClientResponse } = require("./src/security/errors.js");

describe("Operacao JSON payload limits", () => {
	it("uses a small default JSON parser limit with env override", () => {
		const appSource = fs.readFileSync(path.join(process.cwd(), "apps/rot/backend/src/app.js"), "utf8");

		expect(appSource).toContain('return env.ROT_JSON_LIMIT || "1mb";');
		expect(appSource).toContain("express.json({ limit: resolveJsonLimit(), strict: true })");
		expect(appSource).not.toContain('express.json({ limit: "10mb" })');
	});

	it("returns explicit client errors for oversized or invalid JSON bodies", () => {
		expect(toClientResponse({ type: "entity.too.large", status: 413 })).toEqual({
			status: 413,
			body: { ok: false, error: "Payload JSON excede o limite permitido." },
		});
		expect(toClientResponse({ type: "entity.parse.failed", status: 400 })).toEqual({
			status: 400,
			body: { ok: false, error: "JSON inválido." },
		});
	});
});
