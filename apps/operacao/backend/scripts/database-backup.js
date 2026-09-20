const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function buildPgDumpEnv() {
	const env = { ...process.env };
	if (process.env.ROT_DATABASE_URL) {
		return { env, connectionArg: process.env.ROT_DATABASE_URL };
	}

	const required = ["ROT_PGHOST", "ROT_PGUSER", "ROT_PGDATABASE"];
	const missing = required.filter((key) => !process.env[key]);
	if (missing.length) {
		throw new Error(`Banco da Operação não configurado para backup. Informe ROT_DATABASE_URL ou ${missing.join(", ")}.`);
	}

	env.PGHOST = process.env.ROT_PGHOST;
	env.PGPORT = process.env.ROT_PGPORT || "5432";
	env.PGUSER = process.env.ROT_PGUSER;
	env.PGPASSWORD = process.env.ROT_PGPASSWORD || "";
	env.PGDATABASE = process.env.ROT_PGDATABASE;
	if (String(process.env.ROT_PGSSLMODE || "").toLowerCase() === "require") env.PGSSLMODE = "require";
	if (process.env.ROT_PG_SSL_REJECT_UNAUTHORIZED === "false") env.PGSSLMODE = env.PGSSLMODE || "require";
	return { env, connectionArg: null };
}

async function enforceRetention(outputDir) {
	const maxFiles = Number(process.env.ROT_BACKUP_RETENTION || 30);
	const maxBytes = Number(process.env.ROT_BACKUP_MAX_BYTES || 10 * 1024 * 1024 * 1024);
	const entries = await fs.readdir(outputDir).catch(() => []);
	const backups = [];
	for (const fileName of entries) {
		if (!/^operacao-.*\.dump$/.test(fileName)) continue;
		const stat = await fs.stat(path.join(outputDir, fileName));
		backups.push({ fileName, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
	}
	backups.sort((a, b) => b.mtimeMs - a.mtimeMs);

	let usedBytes = 0;
	const toDelete = [];
	backups.forEach((backup, index) => {
		usedBytes += backup.sizeBytes;
		if (index >= maxFiles || usedBytes > maxBytes) toDelete.push(backup.fileName);
	});

	for (const fileName of toDelete) {
		await fs.unlink(path.join(outputDir, fileName)).catch(() => {});
	}

	return {
		currentBackups: backups.length - toDelete.length,
		deletedBackups: toDelete.length,
		usedBytes: backups
			.filter((backup) => !toDelete.includes(backup.fileName))
			.reduce((sum, backup) => sum + backup.sizeBytes, 0),
	};
}

async function verifyDump(filePath) {
	await execFileAsync("pg_restore", ["--list", filePath], { windowsHide: true });
}

async function main() {
	const { env, connectionArg } = buildPgDumpEnv();
	const outputDir = path.resolve(process.env.ROT_BACKUP_DIR || path.join(__dirname, "../../backups"));
	await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const scheduled = process.argv.includes("--scheduled");
	const reason = scheduled ? "scheduled" : "manual-cli";
	const output = path.join(outputDir, `operacao-${stamp}-${reason}.dump`);
	const args = connectionArg
		? ["--format=custom", "--no-owner", "--no-privileges", "--file", output, connectionArg]
		: ["--format=custom", "--no-owner", "--no-privileges", "--file", output];

	await execFileAsync("pg_dump", args, { env, windowsHide: true });
	await fs.chmod(output, 0o600).catch(() => {});
	await verifyDump(output);
	const retention = await enforceRetention(outputDir);

	console.log(JSON.stringify({ ok: true, backup: output, reason, verified: true, retention }));
}

main().catch((error) => {
	console.error("[operacao:backup] Falha:", error?.message || String(error));
	process.exitCode = 1;
});
