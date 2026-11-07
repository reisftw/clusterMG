const assert = require("node:assert/strict");
const test = require("node:test");
process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
const { dedupeKey } = require("./evolutionWebhookQueue");

test("Evolution dedupe uses provider message id", () => {
	const first = dedupeKey({ instance: "retiradas", data: { key: { id: "wamid-1" } } }, "messages.upsert");
	const duplicate = dedupeKey({ instance: "retiradas", data: { key: { id: "wamid-1" }, extra: true } }, "messages.upsert");
	const other = dedupeKey({ instance: "retiradas", data: { key: { id: "wamid-2" } } }, "messages.upsert");
	assert.equal(first, duplicate);
	assert.notEqual(first, other);
});
