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
      version text primary key,
      file_name text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(client) {
	const result = await client.query("select file_name from schema_migrations");
	return new Set(result.rows.map((row) => row.file_name));
}

async function maybeBaselineExistingDatabase(client, files) {
	const applied = await getAppliedMigrations(client);
	if (applied.size) return applied;
	if (!(await tableExists(client, "app_documents"))) return applied;

	const baselineFiles = files.filter(
		(fileName) => getMigrationVersion(fileName) <= BASELINE_VERSION,
	);
	for (const fileName of baselineFiles) {
		await client.query(
			`insert into schema_migrations (version, file_name)
       values ($1, $2)
       on conflict (version) do nothing`,
			[getMigrationVersion(fileName), fileName],
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

	await client.query("begin");
	try {
		console.log(`[migrations] Aplicando ${fileName}`);
		await client.query(sql);
		await client.query(
			`insert into schema_migrations (version, file_name)
       values ($1, $2)
       on conflict (version) do update set
         file_name = excluded.file_name,
         applied_at = now()`,
			[version, fileName],
		);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	}
}

async function main() {
	const files = await listMigrationFiles();
	const client = new Client(getConnectionConfig());
	await client.connect();
	try {
		await ensureMigrationTable(client);
		const applied = await maybeBaselineExistingDatabase(client, files);
		const pending = files.filter((fileName) => !applied.has(fileName));
		for (const fileName of pending) {
			await applyMigration(client, fileName);
		}
		console.log(`[migrations] Concluido. Pendentes aplicadas: ${pending.length}.`);
	} finally {
		await client.end();
	}
}

module.exports = {
	sqlDir,
	getConnectionConfig,
	getMigrationVersion,
	listMigrationFiles,
	tableExists,
	ensureMigrationTable,
	getAppliedMigrations,
	maybeBaselineExistingDatabase,
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
