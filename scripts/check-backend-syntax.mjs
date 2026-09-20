// Validacao sintatica honesta pra backends sem suite de teste real (ex.:
// Finan, que hoje nao tem nenhum arquivo de teste versionado). Nao
// substitui teste de comportamento — só confirma que todo .js do backend
// parseia sem erro de sintaxe, via `node --check`.
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const targets = process.argv.slice(2);
if (targets.length === 0) {
	console.error("uso: node scripts/check-backend-syntax.mjs <dir> [dir...]");
	process.exit(1);
}

function collectJsFiles(dir) {
	const entries = readdirSync(dir);
	const files = [];
	for (const entry of entries) {
		if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
		const full = path.join(dir, entry);
		const info = statSync(full);
		if (info.isDirectory()) files.push(...collectJsFiles(full));
		else if (entry.endsWith(".js")) files.push(full);
	}
	return files;
}

let checked = 0;
let failed = 0;
for (const target of targets) {
	let files;
	try {
		files = statSync(target).isDirectory() ? collectJsFiles(target) : [target];
	} catch {
		console.error(`aviso: caminho não encontrado, pulando: ${target}`);
		continue;
	}
	for (const file of files) {
		checked += 1;
		try {
			execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
		} catch (error) {
			failed += 1;
			console.error(`✖ ${file}`);
			console.error(error.stderr?.toString() || error.message);
		}
	}
}

console.log(`node --check: ${checked} arquivo(s) verificado(s), ${failed} com erro de sintaxe.`);
if (failed > 0) process.exit(1);
