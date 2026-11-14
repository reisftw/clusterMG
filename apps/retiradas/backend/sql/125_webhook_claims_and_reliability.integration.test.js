const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { applyMigration } = require("../scripts/run-sql-migrations");

const DATABASE_URL = process.env.OBSERVABILITY_TEST_DATABASE_URL;

test("migration 125 adiciona claim atomico de webhook de forma idempotente", { skip: !DATABASE_URL }, async () => {
	const client = new Client({ connectionString: DATABASE_URL });
	const schema = `webhook_claim_${crypto.randomBytes(8).toString("hex")}`;
	await client.connect();
	try {
		await client.query(`create schema ${schema}`);
		await client.query(`set search_path to ${schema}, public`);
		await client.query(`
			create table whatsapp_cloud_webhook_events (
				id uuid primary key,
				processing_status text not null default 'PENDING',
				received_at timestamptz not null default now()
			)
		`);
		await client.query(`create table schema_migrations (
			version text not null,
			file_name text primary key,
			applied_at timestamptz not null default now()
		)`);

		await applyMigration(client, "125_webhook_claims_and_reliability.sql");
		await client.query("delete from schema_migrations where file_name = '125_webhook_claims_and_reliability.sql'");
		await applyMigration(client, "125_webhook_claims_and_reliability.sql");

		const columns = await client.query(
			`select column_name from information_schema.columns
			  where table_schema = $1 and table_name = 'whatsapp_cloud_webhook_events'
			    and column_name = any($2::text[])
			  order by column_name`,
			[schema, ["claim_token", "claimed_at", "processing_attempts"]],
		);
		assert.deepEqual(columns.rows.map((row) => row.column_name), [
			"claim_token",
			"claimed_at",
			"processing_attempts",
		]);

		const indexes = await client.query(
			`select indexname, indexdef from pg_indexes
			  where schemaname = $1 and indexname = 'whatsapp_cloud_webhook_events_claim_idx'`,
			[schema],
		);
		assert.equal(indexes.rowCount, 1);
		assert.match(indexes.rows[0].indexdef, /processing_status/i);
		assert.match(indexes.rows[0].indexdef, /claimed_at/i);
	} finally {
		await client.query(`drop schema if exists ${schema} cascade`).catch(() => {});
		await client.end();
	}
});
