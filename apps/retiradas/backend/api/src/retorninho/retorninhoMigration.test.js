const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(path.resolve(__dirname, "../../../sql/122_retorninho_ia.sql"), "utf8");

test("migration 122 é aditiva e inicia o agente pausado", () => {
	assert.doesNotMatch(migration, /\bdrop\s+(table|schema|column)\b/i);
	assert.match(migration, /enabled\s+boolean\s+not null\s+default false/i);
	assert.match(migration, /automatic_replies\s+boolean\s+not null\s+default false/i);
	assert.match(migration, /retorninho-ia/i);
});

test("migration 122 preserva idempotência e deduplicação", () => {
	assert.match(migration, /create table if not exists retorninho_queue/i);
	assert.match(migration, /dedupe_key\s+text\s+not null\s+unique/i);
	assert.match(migration, /on conflict/i);
});
