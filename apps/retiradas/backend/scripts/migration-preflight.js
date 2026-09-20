// Preflight de migrations SQL (Fase B da otimizacao tecnica —
// docs/TECHNICAL-AUDIT.md, achado #4): antes de aplicar qualquer migration
// pendente em producao, verifica se ha dados que violariam as novas
// constraints/regras que a migration vai introduzir. Se algum preflight
// encontrar violacao, ABORTA (sai com codigo != 0) sem aplicar nada —
// nunca corrige dado silenciosamente.
//
// Convencao (mesmo padrao ja usado em apps/finan/backend/sql-tools/):
// para uma migration pendente `vps/sql/0NN_algo.sql`, se existir um
// arquivo `vps/sql-tools/preflight_0NN_algo.sql`, ele e executado contra o
// banco. Convencao do preflight: e uma query SOMENTE LEITURA que devolve
// UMA LINHA POR VIOLACAO encontrada (0 linhas = nenhuma violacao, seguro
// pra aplicar). Migrations sem preflight correspondente sao apenas
// avisadas (nao bloqueiam) — nem toda migration aditiva precisa de
// preflight.
//
// Uso: `node scripts/migration-preflight.js` (mesmas env vars de conexao
// de `run-sql-migrations.js` — DATABASE_URL ou PGHOST/PGPORT/PGUSER/
// PGPASSWORD/PGDATABASE).
const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");
const {
	getConnectionConfig,
	getMigrationVersion,
	listMigrationFiles,
	ensureMigrationTable,
	maybeBaselineExistingDatabase,
} = require("./run-sql-migrations");

// Override so pra teste (ver src/backend/migrationPreflight.test.js) — em
// producao/CI sempre usa vps/sql-tools/, o mesmo diretorio real.
const preflightDir = process.env.SQL_PREFLIGHT_DIR || path.resolve(__dirname, "../sql-tools");

async function listPreflightFiles() {
	try {
		return await fs.readdir(preflightDir);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
}

function findPreflightFileForVersion(version, preflightFiles) {
	const prefix = `preflight_${version}_`;
	return (
		preflightFiles.find(
			(name) => name.startsWith(prefix) && name.toLowerCase().endsWith(".sql"),
		) || null
	);
}

async function runPreflightCheck(client, fileName) {
	const filePath = path.join(preflightDir, fileName);
	const sql = await fs.readFile(filePath, "utf8");
	const result = await client.query(sql);
	return result.rows || [];
}

async function main() {
	const files = await listMigrationFiles();
	const preflightFiles = await listPreflightFiles();
	const client = new Client(getConnectionConfig());
	await client.connect();
	const report = { checkedAt: new Date().toISOString(), pending: [], violations: [] };
	try {
		await ensureMigrationTable(client);
		const applied = await maybeBaselineExistingDatabase(client, files);
		const pending = files.filter((fileName) => !applied.has(fileName));
		report.pending = pending;

		if (!pending.length) {
			console.log("[migration-preflight] Nenhuma migration pendente. Nada a validar.");
			return report;
		}

		console.log(
			`[migration-preflight] ${pending.length} migration(s) pendente(s): ${pending.join(", ")}`,
		);

		for (const fileName of pending) {
			const version = getMigrationVersion(fileName);
			const preflightFile = findPreflightFileForVersion(version, preflightFiles);
			if (!preflightFile) {
				console.log(
					`[migration-preflight] ${fileName}: sem preflight dedicado ` +
						`(nenhum sql-tools/preflight_${version}_*.sql) — nada a validar.`,
				);
				continue;
			}
			console.log(`[migration-preflight] ${fileName}: rodando ${preflightFile}...`);
			const rows = await runPreflightCheck(client, preflightFile);
			if (rows.length) {
				report.violations.push({ migration: fileName, preflightFile, count: rows.length, rows });
				console.error(
					`[migration-preflight] VIOLAÇÃO encontrada por ${preflightFile}: ${rows.length} linha(s).`,
				);
				console.error(JSON.stringify(rows.slice(0, 20), null, 2));
				if (rows.length > 20) {
					console.error(`[migration-preflight] (+ ${rows.length - 20} linha(s) omitida(s))`);
				}
			} else {
				console.log(`[migration-preflight] ${fileName}: OK, nenhuma violação encontrada.`);
			}
		}
		return report;
	} finally {
		await client.end();
	}
}

module.exports = { main, findPreflightFileForVersion, listPreflightFiles };

if (require.main === module) {
	main()
		.then((report) => {
			if (report.violations.length) {
				console.error(
					`[migration-preflight] ABORTANDO: ${report.violations.length} migration(s) ` +
						`com dado que violaria a nova constraint/regra. Corrija os dados (ou ajuste a ` +
						`migration) antes de aplicar — nada foi alterado no banco.`,
				);
				process.exitCode = 1;
				return;
			}
			console.log("[migration-preflight] Concluído sem violações. Seguro para aplicar migrations.");
		})
		.catch((error) => {
			console.error("[migration-preflight] Falha ao executar preflight:", error);
			process.exitCode = 1;
		});
}
