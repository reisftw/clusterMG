const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { Client } = require("pg");
const { applyMigration } = require("../scripts/run-sql-migrations");

const DATABASE_URL = process.env.OBSERVABILITY_TEST_DATABASE_URL;
const MIGRATIONS = [
	"114_maps_geocode_jobs_address_hash_idx.sql",
	"115_maps_geocode_cache_ready_idx.sql",
	"116_mensageria_historico_os_idx.sql",
	"117_mensageria_historico_codigo_cliente_idx.sql",
	"118_mensageria_callbacks_os_idx.sql",
	"119_mensageria_callbacks_codigo_cliente_idx.sql",
];

test("performance indexes apply concurrently and remain idempotent", { skip: !DATABASE_URL }, async () => {
	const client = new Client({ connectionString: DATABASE_URL });
	const schema = `performance_${Date.now()}_${Math.random().toString(16).slice(2)}`;
	await client.connect();
	try {
		await client.query(`create schema ${schema}`);
		await client.query(`set search_path to ${schema}, public`);
		await client.query("create table maps_geocode_jobs (address_hash text)");
		await client.query("create table maps_geocode_cache (created_at timestamptz, status text)");
		await client.query("create table mensageria_historico (os text, codigo_cliente text)");
		await client.query("create table mensageria_callbacks (os text, codigo_cliente text)");
		await client.query(`create table schema_migrations (
			version text primary key,
			file_name text not null,
			applied_at timestamptz not null default now()
		)`);

		for (const fileName of MIGRATIONS) {
			assert.match(
				await fs.readFile(path.join(__dirname, fileName), "utf8"),
				/create index concurrently if not exists/i,
			);
			await applyMigration(client, fileName);
			await applyMigration(client, fileName);
		}

		const result = await client.query(
			`select indexname
			   from pg_indexes
			  where schemaname = $1
			    and tablename in (
			      'maps_geocode_jobs', 'maps_geocode_cache',
			      'mensageria_historico', 'mensageria_callbacks'
			    )
			  order by indexname`,
			[schema],
		);
		assert.deepEqual(result.rows.map((row) => row.indexname), [
			"maps_geocode_cache_ready_idx",
			"maps_geocode_jobs_address_hash_idx",
			"mensageria_callbacks_codigo_cliente_idx",
			"mensageria_callbacks_os_idx",
			"mensageria_historico_codigo_cliente_idx",
			"mensageria_historico_os_idx",
		]);
	} finally {
		await client.query(`drop schema if exists ${schema} cascade`);
		await client.end();
	}
});
