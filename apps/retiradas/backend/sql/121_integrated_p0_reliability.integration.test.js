const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");
const { applyMigration } = require("../scripts/run-sql-migrations");

const DATABASE_URL = process.env.OBSERVABILITY_TEST_DATABASE_URL;

test("P0 migration is additive and idempotent", { skip: !DATABASE_URL }, async () => {
	const client = new Client({ connectionString: DATABASE_URL });
	const schema = `p0_${Date.now()}_${Math.random().toString(16).slice(2)}`;
	await client.connect();
	try {
		await client.query(`create schema ${schema}`);
		await client.query(`set search_path to ${schema}, public`);
		await client.query(`create table movimentacoes_scan_jobs (id text primary key)`);
		await client.query(`create table movimentacoes_config (id text primary key)`);
		await client.query(`create table hubsoft_sync_runs (id uuid primary key)`);
		await client.query(`create table equipment_recovery_snapshots (
			id uuid primary key, closed_at timestamptz, technician_name_normalized text,
			technician_id text
		)`);
		await client.query(`create table movimentacoes_estoque (
			id text primary key, emitido_em timestamptz, status_match text
		)`);
		await client.query(`create table hubsoft_sync_records (
			id uuid primary key, profile text, active boolean, source_date timestamptz
		)`);
		await client.query(`create table schema_migrations (
			version text primary key, file_name text not null, applied_at timestamptz default now()
		)`);

		await applyMigration(client, "121_integrated_p0_reliability.sql");
		await client.query(`delete from schema_migrations where version = '121'`);
		await applyMigration(client, "121_integrated_p0_reliability.sql");

		const result = await client.query(
			`select count(*)::int total from information_schema.columns
			  where table_schema = $1 and table_name = 'evolution_webhook_events'`,
			[schema],
		);
		assert.ok(result.rows[0].total >= 10);
	} finally {
		await client.query(`drop schema if exists ${schema} cascade`);
		await client.end();
	}
});
