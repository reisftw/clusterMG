const fs = require("node:fs/promises");
const path = require("node:path");
const db = require("../src/db");

async function ensureMigrationsTable() {
	await db.query(`
		create table if not exists finan_migrations (
			id text primary key,
			applied_at timestamptz not null default now()
		)
	`);
}

async function appliedIds() {
	const { rows } = await db.query("select id from finan_migrations");
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
		console.log(`[finan:migrations] Aplicando ${file}`);
		const client = await db.connect();
		try {
			await client.query("begin");
			await client.query(sql);
			await client.query("insert into finan_migrations (id) values ($1)", [file]);
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
	}

	console.log("[finan:migrations] Concluído.");
}

main()
	.catch((error) => {
		console.error("[finan:migrations] Falha:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool().catch(() => {});
	});
