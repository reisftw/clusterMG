const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");

const { ensureMigrationTable } = require("./run-sql-migrations");

const databaseUrl = process.env.OBSERVABILITY_TEST_DATABASE_URL;

test(
	"converte o controle legado e aceita arquivos distintos com a mesma versao",
	{ skip: !databaseUrl },
	async () => {
		const client = new Client({ connectionString: databaseUrl });
		await client.connect();
		try {
			await client.query("begin");
			await client.query(`
        create temp table schema_migrations (
          version text primary key,
          file_name text not null,
          applied_at timestamptz not null default now()
        ) on commit drop
      `);
			await client.query(
				`insert into schema_migrations (version, file_name)
         values ('013', '013_documentos_agentes_midia.sql')`,
			);

			await ensureMigrationTable(client);
			await client.query(
				`insert into schema_migrations (version, file_name)
         values ('013', '013_roles_permissions.sql')`,
			);

			const primaryKey = await client.query(`
        select array_agg(attribute.attname order by key_column.ordinality) as columns
        from pg_constraint constraint_definition
        cross join lateral unnest(constraint_definition.conkey)
          with ordinality as key_column(attribute_number, ordinality)
        join pg_attribute attribute
          on attribute.attrelid = constraint_definition.conrelid
         and attribute.attnum = key_column.attribute_number
        where constraint_definition.conrelid = 'schema_migrations'::regclass
          and constraint_definition.contype = 'p'
      `);
			const rows = await client.query(
				"select version, file_name from schema_migrations order by file_name",
			);

			assert.deepEqual(primaryKey.rows[0].columns, ["file_name"]);
			assert.deepEqual(rows.rows, [
				{
					version: "013",
					file_name: "013_documentos_agentes_midia.sql",
				},
				{ version: "013", file_name: "013_roles_permissions.sql" },
			]);
		} finally {
			await client.query("rollback").catch(() => {});
			await client.end();
		}
	},
);
