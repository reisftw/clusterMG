const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
	path.join(__dirname, "113_observability_wave0.sql"),
	"utf8",
);
const metricsSource = fs.readFileSync(
	path.join(__dirname, "../api/src/metrics.js"),
	"utf8",
);

test("113 expande a tabela legada e protege a nova tabela agregada", () => {
	for (const column of [
		"response_bytes",
		"query_duration_max_ms",
		"pool_wait_count",
		"pool_wait_total_ms",
		"pool_wait_max_ms",
		"pool_timeouts",
		"long_transactions",
		"last_error_code",
	]) {
		assert.match(migration, new RegExp(`add column if not exists ${column}`));
	}
	assert.match(migration, /create table if not exists maintenance_operation_metrics_hourly/i);
	assert.match(migration, /enable row level security/i);
	assert.match(migration, /create policy maintenance_operation_metrics_hourly_policy/i);
	assert.match(migration, /app_security\.is_admin\(\)/i);
});

test("metrics nao cria DDL em runtime", () => {
	const ensureTables = metricsSource.match(
		/async function ensureTables\(\) \{([\s\S]*?)\n\}/,
	)?.[1];
	assert.ok(ensureTables);
	assert.doesNotMatch(ensureTables, /\b(?:create|alter|drop)\s+(?:table|index|policy)\b/i);
});
