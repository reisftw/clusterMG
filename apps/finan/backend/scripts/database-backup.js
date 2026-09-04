const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

async function main() {
	const url = process.env.FINAN_DATABASE_URL;
	if (!url) {
		throw new Error("Informe FINAN_DATABASE_URL para gerar backup do banco Finan.");
	}

	const outputDir = path.resolve(
		process.env.FINAN_BACKUP_DIR || path.join(__dirname, "../../backups"),
	);
	await fs.mkdir(outputDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const output = path.join(outputDir, `finan-${stamp}.dump`);

	await execFileAsync("pg_dump", ["--format=custom", "--file", output, url], {
		windowsHide: true,
	});
	console.log(JSON.stringify({ ok: true, backup: output }));
}

main().catch((error) => {
	console.error("[finan:backup] Falha:", error);
	process.exitCode = 1;
});
