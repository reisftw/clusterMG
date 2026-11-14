const fs = require("node:fs");
const path = require("node:path");

const SQL_ROOT = path.resolve(__dirname, "..", "sql");
const destructivePatterns = [
	{ label: "DROP TABLE", pattern: /\bdrop\s+table\b/i },
	{ label: "DROP COLUMN", pattern: /\bdrop\s+column\b/i },
	{ label: "RENAME TABLE", pattern: /\balter\s+table[\s\S]{0,200}\brename\s+to\b/i },
	{ label: "RENAME COLUMN", pattern: /\brename\s+column\b/i },
	{ label: "ALTER COLUMN TYPE", pattern: /\balter\s+column[\s\S]{0,120}\btype\b/i },
	{ label: "TRUNCATE", pattern: /\btruncate\b/i },
];

function stripSqlComments(sql) {
	return String(sql || "")
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/--.*$/gm, " ");
}

function validateMigrationSql(sql, fileName = "migration.sql") {
	const executableSql = stripSqlComments(sql);
	const violations = destructivePatterns
		.filter(({ pattern }) => pattern.test(executableSql))
		.map(({ label }) => `${fileName}: operacao incompatível com rollback de aplicação (${label})`);
	return violations;
}

function resolveMigrationFiles(args = process.argv.slice(2)) {
	return args
		.map((candidate) => path.resolve(candidate))
		.filter((candidate) => candidate.startsWith(`${SQL_ROOT}${path.sep}`))
		.filter((candidate) => candidate.endsWith(".sql"));
}

function main() {
	const files = resolveMigrationFiles();
	if (files.length === 0) {
		console.log("[rollback-contract] Nenhuma migration SQL alterada.");
		return;
	}

	const violations = files.flatMap((filePath) =>
		validateMigrationSql(fs.readFileSync(filePath, "utf8"), path.relative(process.cwd(), filePath)),
	);
	if (violations.length > 0) {
		throw new Error(
			`Migration destrutiva exige release separada e plano supervisionado:\n${violations.join("\n")}`,
		);
	}
	console.log(`[rollback-contract] ${files.length} migration(s) compatíveis com rollback da aplicação.`);
}

if (require.main === module) {
	try {
		main();
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

module.exports = { resolveMigrationFiles, stripSqlComments, validateMigrationSql };
