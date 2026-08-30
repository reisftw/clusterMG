const { spawnSync } = require("node:child_process");

const migrations = [
	["Regionais", "scripts/migrate-regionais-usuarios.js", ["--apply-regionais"]],
	["Mensageria", "scripts/migrate-mensageria.js", ["--apply"]],
	["Agendamentos/Esteira", "scripts/migrate-agendamentos-esteira.js", ["--apply"]],
	["Financeiro Serasa/Tarifas", "scripts/migrate-financeiro-reports.js", ["--apply"]],
	["Financeiro Orçamento/Config", "scripts/migrate-financeiro-budget-config.js", ["--apply"]],
	["Imóveis Administrativos", "scripts/migrate-imoveis.js", ["--apply"]],
	["Ordens/Match/Legadas", "scripts/migrate-ordens.js", ["--apply"]],
];

for (const [name, script, args] of migrations) {
	console.log(`\n==> Migrando ${name}`);
	const result = spawnSync(process.execPath, [script, ...args], {
		cwd: process.cwd(),
		stdio: "inherit",
		env: process.env,
	});

	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

console.log("\nMigrações normalizadas concluídas.");
