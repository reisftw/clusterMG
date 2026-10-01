// Copia identica do padrao de apps/finan/backend/scripts/run-sql-migrations.js
// — roda tudo em sql/*.sql em ordem alfabetica, nao recursivo, registrando
// cada migration aplicada em rot_migrations (tabela criada na 001).
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

function loadEnvFile(filePath) {
	if (!filePath || !fsSync.existsSync(filePath)) return;
	const content = fsSync.readFileSync(filePath, "utf8");
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
		const index = trimmed.indexOf("=");
		const key = trimmed.slice(0, index).trim();
		let value = trimmed.slice(index + 1);
		if (!key || process.env[key] !== undefined) continue;
		if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

loadEnvFile(process.env.ROT_ENV_FILE);

const db = require("../src/db");

async function ensureMigrationsTable() {
	await db.query(`
		create table if not exists rot_migrations (
			id text primary key,
			applied_at timestamptz not null default now()
		)
	`);
}

async function appliedIds() {
	const { rows } = await db.query("select id from rot_migrations");
	return new Set(rows.map((row) => row.id));
}

async function main() {
	await ensureMigrationsTable();
	const applied = await appliedIds();
	const dir = path.resolve(__dirname, "../sql");
	const files = (await fs.readdir(dir))
		.filter((file) => file.endsWith(".sql"))
		.sort();

	for (const file of files) {
		if (applied.has(file)) continue;
		const sql = await fs.readFile(path.join(dir, file), "utf8");
		console.log(`[rot:migrations] Aplicando ${file}`);
		const client = await db.connect();
		try {
			await client.query("begin");
			await client.query(sql);
			await client.query("insert into rot_migrations (id) values ($1)", [file]);
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
	}

	console.log("[rot:migrations] Concluído.");
}

main()
	.catch((error) => {
		console.error("[rot:migrations] Falha:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool().catch(() => {});
	});
