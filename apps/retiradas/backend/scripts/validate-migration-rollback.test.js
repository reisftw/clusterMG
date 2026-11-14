const test = require("node:test");
const assert = require("node:assert/strict");
const { stripSqlComments, validateMigrationSql } = require("./validate-migration-rollback");

test("aceita migrations aditivas e backfills", () => {
	const sql = `
		create table if not exists webhook_claims (id uuid primary key);
		alter table webhook_claims add column if not exists claimed_at timestamptz;
		create index if not exists webhook_claims_claimed_at_idx on webhook_claims (claimed_at);
		update webhook_claims set claimed_at = now() where claimed_at is null;
	`;
	assert.deepEqual(validateMigrationSql(sql, "125_safe.sql"), []);
});

test("bloqueia operacoes que quebram rollback da aplicacao", () => {
	const violations = validateMigrationSql(
		"alter table webhook_claims drop column payload; truncate webhook_claims;",
		"125_unsafe.sql",
	);
	assert.equal(violations.length, 2);
	assert.match(violations.join(" "), /DROP COLUMN/);
	assert.match(violations.join(" "), /TRUNCATE/);
});

test("ignora exemplos destrutivos presentes apenas em comentarios", () => {
	const sql = `-- never run: drop table webhook_claims\n/* truncate webhook_claims */\nselect 1;`;
	assert.equal(stripSqlComments(sql).includes("drop table"), false);
	assert.deepEqual(validateMigrationSql(sql), []);
});
