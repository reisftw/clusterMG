const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");
const { applyMigration } = require("../scripts/run-sql-migrations");

const DATABASE_URL = process.env.OBSERVABILITY_TEST_DATABASE_URL;

test("migration 124 cria reservas e aprovacoes de bairro de forma idempotente", { skip: !DATABASE_URL }, async () => {
	const client = new Client({ connectionString: DATABASE_URL });
	const schema = `tentativas_bairros_${Date.now()}_${Math.random().toString(16).slice(2)}`;
	await client.connect();
	try {
		await client.query(`create schema ${schema}`);
		await client.query(`set search_path to ${schema}, public`);
		await client.query(`create table schema_migrations (
			version text primary key, file_name text not null, applied_at timestamptz default now()
		)`);

		await applyMigration(client, "124_tentativas_bairro_solicitacoes.sql");
		await client.query("delete from schema_migrations where version = '124'");
		await applyMigration(client, "124_tentativas_bairro_solicitacoes.sql");

		const tables = await client.query(
			`select table_name from information_schema.tables
			  where table_schema = $1 and table_name like 'tentativas_neighborhood_claim%'
			  order by table_name`,
			[schema],
		);
		assert.deepEqual(tables.rows.map((row) => row.table_name), [
			"tentativas_neighborhood_claim_requests",
			"tentativas_neighborhood_claims",
		]);

		await assert.rejects(
			client.query(
				`insert into tentativas_neighborhood_claims
				 (cidade_normalizada, bairro_grupo, technician_user_id, requested_at, expires_at)
				 values ('betim', 'centro', 'tech-1', now(), now() + interval '25 hours')`,
			),
			(error) => error?.code === "23514",
		);
	} finally {
		await client.query("rollback").catch(() => {});
		await client.query(`drop schema if exists ${schema} cascade`);
		await client.end();
	}
});
