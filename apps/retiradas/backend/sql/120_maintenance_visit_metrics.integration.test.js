const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");
const { applyMigration } = require("../scripts/run-sql-migrations");

const DATABASE_URL = process.env.OBSERVABILITY_TEST_DATABASE_URL;

test("visit metrics backfill and aggregate new heartbeats", { skip: !DATABASE_URL }, async () => {
	const client = new Client({ connectionString: DATABASE_URL });
	const schema = `visits_${Date.now()}_${Math.random().toString(16).slice(2)}`;
	await client.connect();
	try {
		await client.query(`create schema ${schema}`);
		await client.query(`set search_path to ${schema}, public`);
		await client.query(`create table maintenance_service_worker_events (
			id bigserial primary key,
			event_type text not null,
			client_id text,
			occurred_at timestamptz not null default now()
		)`);
		await client.query(`create table schema_migrations (
			version text primary key,
			file_name text not null,
			applied_at timestamptz not null default now()
		)`);
		await client.query(
			`insert into maintenance_service_worker_events (event_type,client_id,occurred_at)
			 values ('HEARTBEAT','client-a','2026-11-03T12:00:00Z'),
			        ('HEARTBEAT','client-a','2026-11-03T13:00:00Z'),
			        ('HEARTBEAT','client-b','2026-11-03T14:00:00Z'),
			        ('INSTALL_FAILURE','client-a','2026-11-03T15:00:00Z')`,
		);

		await applyMigration(client, "120_maintenance_visit_metrics.sql");
		await client.query(
			`insert into maintenance_service_worker_events (event_type,client_id,occurred_at)
			 values ('HEARTBEAT','client-a','2026-11-03T16:00:00Z')`,
		);

		const result = await client.query(
			`select sum(visits)::integer visits,count(*)::integer clients
			   from maintenance_visit_metrics_daily`,
		);
		assert.deepEqual(result.rows[0], { visits: 4, clients: 2 });
	} finally {
		await client.query(`drop schema if exists ${schema} cascade`);
		await client.end();
	}
});
