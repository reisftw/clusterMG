const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

const databaseUrl = process.env.OBSERVABILITY_TEST_DATABASE_URL;
const migrationPath = path.join(__dirname, "113_observability_wave0.sql");

test(
	"113 atualiza legado, aceita flush e preserva rollback de aplicacao",
	{ skip: !databaseUrl && "defina OBSERVABILITY_TEST_DATABASE_URL para PostgreSQL descartavel" },
	async () => {
		const client = new Client({ connectionString: databaseUrl });
		const schema = `wave0_113_${crypto.randomBytes(8).toString("hex")}`;
		const readerRole = `wave0_reader_${crypto.randomBytes(6).toString("hex")}`;
		const migration = await fs.readFile(migrationPath, "utf8");
		await client.connect();
		try {
			await client.query(`create schema ${schema}`);
			await client.query(`set search_path to ${schema}, public`);
			await client.query("create schema if not exists app_security");
			await client.query(`
				create or replace function app_security.current_user_role() returns text
				language sql stable as $$
					select nullif(current_setting('retiradas.current_user_role', true), '')
				$$;
				create or replace function app_security.is_admin() returns boolean
				language sql stable as $$
					select app_security.current_user_role() = 'admin'
				$$;
				create table maintenance_route_metrics_hourly (
					bucket_start timestamptz not null, method varchar(16) not null,
					route varchar(500) not null, requests bigint not null default 0,
					errors_4xx bigint not null default 0, errors_5xx bigint not null default 0,
					duration_total_ms double precision not null default 0,
					duration_max_ms double precision not null default 0,
					primary key (bucket_start, method, route)
				)
			`);
			await client.query("select set_config('retiradas.current_user_role', 'admin', false)");

			await client.query(migration);
			await client.query(migration);
			const protection = await client.query(`
				select c.relrowsecurity, p.polname
				from pg_class c
				join pg_namespace n on n.oid = c.relnamespace
				left join pg_policy p on p.polrelid = c.oid
				where n.nspname = $1 and c.relname = 'maintenance_operation_metrics_hourly'
			`, [schema]);
			assert.equal(protection.rows[0].relrowsecurity, true);
			assert.ok(protection.rows.some((row) => row.polname === "maintenance_operation_metrics_hourly_policy"));
			await client.query(`
				insert into maintenance_operation_metrics_hourly
				(bucket_start, kind, name, stage, calls, successes, duration_total_ms)
				values (date_trunc('hour', now()), 'integration', 'test', 'flush', 1, 1, 12.5)
				on conflict (bucket_start, kind, name, stage) do update
				set calls = maintenance_operation_metrics_hourly.calls + excluded.calls
			`);
			const flushed = await client.query(
				"select calls from maintenance_operation_metrics_hourly where kind = 'integration'",
			);
			assert.equal(flushed.rows[0].calls, "1");

			await client.query(`create role ${readerRole}`);
			await client.query(`grant usage on schema ${schema}, app_security to ${readerRole}`);
			await client.query(
				`grant select, insert on ${schema}.maintenance_operation_metrics_hourly to ${readerRole}`,
			);
			await client.query(`set role ${readerRole}`);
			await client.query("select set_config('retiradas.current_user_role', 'tecnico', false)");
			await assert.rejects(
				client.query(`
					insert into ${schema}.maintenance_operation_metrics_hourly
					(bucket_start, kind, name, stage, calls)
					values (date_trunc('hour', now()), 'job', 'negado', 'rls', 1)
				`),
				/row-level security|policy/i,
			);
			await client.query("reset role");
			await client.query("select set_config('retiradas.current_user_role', 'admin', false)");

			// Rollback de aplicacao: o insert do schema pre-113 continua valido.
			await client.query(`
				insert into maintenance_route_metrics_hourly (bucket_start, method, route, requests)
				values (date_trunc('hour', now()), 'GET', '/legacy', 1)
			`);
			const legacy = await client.query(
				"select response_bytes from maintenance_route_metrics_hourly where route = '/legacy'",
			);
			assert.equal(legacy.rows[0].response_bytes, "0");
		} finally {
			await client.query("reset role").catch(() => {});
			await client.query(`drop schema if exists ${schema} cascade`).catch(() => {});
			await client.query(`drop role if exists ${readerRole}`).catch(() => {});
			await client.end();
		}
	},
);
