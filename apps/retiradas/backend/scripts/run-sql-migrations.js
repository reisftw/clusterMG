const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

const sqlDir = path.resolve(__dirname, "../sql");
const BASELINE_VERSION = String(process.env.SQL_MIGRATIONS_BASELINE || "028");

function getConnectionConfig() {
	if (process.env.DATABASE_URL) {
		return {
			connectionString: process.env.DATABASE_URL,
		};
	}
	return {
		host: process.env.PGHOST || "127.0.0.1",
		port: Number(process.env.PGPORT || 5432),
		user: process.env.PGUSER,
		password: process.env.PGPASSWORD,
		database: process.env.PGDATABASE,
	};
}

function getMigrationVersion(fileName) {
	return String(fileName || "").split("_")[0] || "";
}

function isNoTransactionMigration(sql) {
	return /^\s*--\s*migration:no-transaction\b/im.test(String(sql || ""));
}

async function listMigrationFiles() {
	const entries = await fs.readdir(sqlDir);
	return entries
		.filter((entry) => /^\d+_.+\.sql$/i.test(entry))
		.sort((left, right) => left.localeCompare(right, "en"));
}

async function tableExists(client, tableName) {
	const result = await client.query("select to_regclass($1) as name", [
		`public.${tableName}`,
	]);
	return Boolean(result.rows[0]?.name);
}

async function ensureMigrationTable(client) {
	await client.query(`
    create table if not exists schema_migrations (
      version text not null,
      file_name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
	await client.query(`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'schema_migrations'::regclass
          and contype = 'p'
          and pg_get_constraintdef(oid) = 'PRIMARY KEY (file_name)'
      ) then
        alter table schema_migrations drop constraint if exists schema_migrations_pkey;
        alter table schema_migrations
          add constraint schema_migrations_pkey primary key (file_name);
      end if;
    end $$
  `);
	await client.query(`
    create index if not exists schema_migrations_version_idx
      on schema_migrations (version)
  `);
}

async function getAppliedMigrations(client) {
	const result = await client.query("select file_name from schema_migrations");
	return new Set(result.rows.map((row) => String(row.file_name || "")));
}

function getPendingMigrations(files, appliedFiles) {
	return files.filter((fileName) => !appliedFiles.has(fileName));
}

async function maybeBaselineExistingDatabase(client, files) {
	const applied = await getAppliedMigrations(client);
	if (applied.size) return applied;
	if (!(await tableExists(client, "app_documents"))) return applied;

	const baselineFiles = files.filter(
		(fileName) => getMigrationVersion(fileName) <= BASELINE_VERSION,
	);
	for (const fileName of baselineFiles) {
		const version = getMigrationVersion(fileName);
		await client.query(
			`insert into schema_migrations (version, file_name)
       values ($1, $2)
       on conflict (file_name) do nothing`,
			[version, fileName],
		);
		applied.add(fileName);
	}
	console.log(
		`[migrations] Baseline aplicado para ${baselineFiles.length} migration(s) existentes.`,
	);
	return applied;
}

async function applyMigration(client, fileName) {
	const version = getMigrationVersion(fileName);
	const filePath = path.join(sqlDir, fileName);
	const sql = await fs.readFile(filePath, "utf8");
	const noTransaction = isNoTransactionMigration(sql);

	console.log(`[migrations] Aplicando ${fileName}`);
	if (noTransaction) {
		try {
			await client.query("set lock_timeout = '5s'");
			await client.query("set statement_timeout = '15min'");
			await client.query(sql);
			await client.query(
				`insert into schema_migrations (version, file_name)
       values ($1, $2)
	       on conflict do nothing`,
				[version, fileName],
			);
		} finally {
			await client.query("reset lock_timeout").catch(() => {});
			await client.query("reset statement_timeout").catch(() => {});
		}
		return;
	}

	await client.query("begin");
	try {
		await client.query("set local lock_timeout = '5s'");
		await client.query("set local statement_timeout = '15min'");
		await client.query(sql);
		await client.query(
			`insert into schema_migrations (version, file_name)
       values ($1, $2)
	       on conflict do nothing`,
			[version, fileName],
		);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	}
}

async function acquireMigrationLock(client) {
	const result = await client.query(
		"select pg_try_advisory_lock(hashtext('retiradas_sql_migrations')) as acquired",
	);
	if (result.rows[0]?.acquired !== true) {
		throw new Error(
			"Outra execucao de migrations ja esta em andamento. Tente novamente depois que ela terminar.",
		);
	}
}

async function main() {
	const files = await listMigrationFiles();
	const client = new Client(getConnectionConfig());
	await client.connect();
	try {
		await ensureMigrationTable(client);
		await acquireMigrationLock(client);
		const applied = await maybeBaselineExistingDatabase(client, files);
		const pending = getPendingMigrations(files, applied);
		for (const fileName of pending) {
			await applyMigration(client, fileName);
		}
		console.log(`[migrations] Concluido. Pendentes aplicadas: ${pending.length}.`);
	} finally {
		await client
			.query("select pg_advisory_unlock(hashtext('retiradas_sql_migrations'))")
			.catch(() => {});
		await client.end();
	}
}

module.exports = {
	sqlDir,
	getConnectionConfig,
	getMigrationVersion,
	isNoTransactionMigration,
	listMigrationFiles,
	tableExists,
	ensureMigrationTable,
	getAppliedMigrations,
	getPendingMigrations,
	maybeBaselineExistingDatabase,
	applyMigration,
	acquireMigrationLock,
};

// So roda automaticamente quando chamado direto (`node run-sql-migrations.js`
// / `npm run migrate:sql`) — quando importado por outro script (ex.:
// migration-preflight.js), so os helpers acima sao usados, sem disparar a
// aplicacao de migrations.
if (require.main === module) {
	main().catch((error) => {
		console.error("[migrations] Falha ao aplicar migrations:", error);
		process.exit(1);
	});
}
