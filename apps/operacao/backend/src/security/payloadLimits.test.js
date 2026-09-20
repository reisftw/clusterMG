const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { toClientResponse } = require("./errors.js");

test("uses a small default JSON parser limit with env override", () => {
	const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

	assert.ok(appSource.includes('return env.ROT_JSON_LIMIT || "1mb";'));
	assert.ok(appSource.includes("express.json({ limit: resolveJsonLimit(), strict: true })"));
	assert.ok(!appSource.includes('express.json({ limit: "10mb" })'));
});

test("returns explicit client errors for oversized or invalid JSON bodies", () => {
	assert.deepEqual(toClientResponse({ type: "entity.too.large", status: 413 }), {
		status: 413,
		body: { ok: false, error: "Payload JSON excede o limite permitido." },
	});
	assert.deepEqual(toClientResponse({ type: "entity.parse.failed", status: 400 }), {
		status: 400,
		body: { ok: false, error: "JSON inválido." },
	});
});
