const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const jobExecutionService = require("../src/jobs/jobExecutionService");

const execFileAsync = promisify(execFile);

// SonarQube S4036 (mesmo fix aplicado em compat/routes.js:runPgDump):
// resolve `pg_dump` so em diretorios fixos e nao-graviaveis, em vez de
// herdar o PATH do processo sem restricao. So aplicado em Linux (onde
// o backup de producao roda de fato, via systemd timer — ver CLAUDE.md
// secao 11); no Windows (execucao manual local via
// `npm run backup:database`) o PATH herdado continua igual, senao
// `pg_dump` deixaria de ser encontrado nesse ambiente (formato de PATH
// do Windows e incompativel com uma lista de diretorios `/usr/bin`-
// style).
const TRUSTED_BIN_PATH =
	process.platform === "win32"
		? process.env.PATH
		: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

// Mesma logica de resolucao de conexao do backend (src/db.js) e do backup
// manual via UI (compat/routes.js:runPgDump): usa FINAN_DATABASE_URL se
// existir, senao monta a conexao a partir das variaveis FINAN_PG*
// individuais — que e o que /opt/retiradas/apps/finan/.env realmente
// define em producao hoje (FINAN_DATABASE_URL nao esta la). Nunca imprime
// a senha: ela so viaja como variavel de ambiente do processo filho do
// pg_dump, igual o driver `pg` faz.
function buildPgDumpEnv() {
	const env = { ...process.env, PATH: TRUSTED_BIN_PATH };
	if (process.env.FINAN_DATABASE_URL) {
		return { env, connectionArg: process.env.FINAN_DATABASE_URL };
	}

	const required = ["FINAN_PGHOST", "FINAN_PGUSER", "FINAN_PGDATABASE"];
	const missing = required.filter((key) => !process.env[key]);
	if (missing.length) {
		throw new Error(
			`Banco do Finan não configurado para backup. Informe FINAN_DATABASE_URL ou ${missing.join(", ")}.`,
		);
	}

	env.PGHOST = process.env.FINAN_PGHOST;
	env.PGPORT = process.env.FINAN_PGPORT || "5432";
	env.PGUSER = process.env.FINAN_PGUSER;
	env.PGPASSWORD = process.env.FINAN_PGPASSWORD || "";
	env.PGDATABASE = process.env.FINAN_PGDATABASE;
	if (String(process.env.FINAN_PGSSLMODE || "").toLowerCase() === "require") {
		env.PGSSLMODE = "require";
	}
	return { env, connectionArg: null };
}

async function enforceRetention(outputDir) {
	const maxFiles = Number(process.env.FINAN_BACKUP_RETENTION || 30);
	const maxBytes = Number(process.env.FINAN_BACKUP_MAX_BYTES || 10 * 1024 * 1024 * 1024);

	const entries = await fs.readdir(outputDir);
	const backups = [];
	for (const fileName of entries) {
		if (!/^finan-.*\.dump$/.test(fileName)) continue;
		const stat = await fs.stat(path.join(outputDir, fileName));
		backups.push({ fileName, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
	}
	backups.sort((a, b) => b.mtimeMs - a.mtimeMs); // mais novo primeiro

	let usedBytes = 0;
	const toDelete = [];
	backups.forEach((backup, index) => {
		usedBytes += backup.sizeBytes;
		if (index >= maxFiles || usedBytes > maxBytes) {
			toDelete.push(backup.fileName);
		}
	});

	for (const fileName of toDelete) {
		// So apaga dentro de outputDir, por nome de arquivo ja validado pelo
		// regex acima — nunca um glob/variavel nao verificada.
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

async function runBackup() {
	const { env, connectionArg } = buildPgDumpEnv();

	const outputDir = path.resolve(
		process.env.FINAN_BACKUP_DIR || path.join(__dirname, "../../backups"),
	);
	await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const scheduled = process.argv.includes("--scheduled");
	const reason = scheduled ? "scheduled" : "manual-cli";
	const output = path.join(outputDir, `finan-${stamp}-${reason}.dump`);

	const args = connectionArg
		? ["--format=custom", "--no-owner", "--no-privileges", "--file", output, connectionArg]
		: ["--format=custom", "--no-owner", "--no-privileges", "--file", output];

	await execFileAsync("pg_dump", args, { env, windowsHide: true });
	await fs.chmod(output, 0o600).catch(() => {});

	const retention = await enforceRetention(outputDir);

	console.log(
		JSON.stringify({
			ok: true,
			backup: output,
			reason,
			retention,
		}),
	);
	return { backup: output, reason, retention };
}

// Roteiro Finan #28: registra a execucao na Central de Jobs (mesmo em
// falha), pra sair do "so aparece no journalctl" pra ter uma tela com
// ultima execucao/duracao/erro. Melhor esforco — se o registro em si
// falhar (ver jobExecutionService), o backup real nao e afetado.
async function main() {
	const scheduled = process.argv.includes("--scheduled");
	const triggeredByArg = process.argv.find((arg) => arg.startsWith("--triggered-by="));
	const triggeredByName = triggeredByArg ? triggeredByArg.slice("--triggered-by=".length) : null;

	await jobExecutionService.runInstrumented(
		"backup_database",
		{ trigger: scheduled ? "scheduled" : "manual", triggeredBy: triggeredByName ? { name: triggeredByName } : null },
		async () => {
			const result = await runBackup();
			return { summary: result };
		},
	);
}

main()
	.catch(async (error) => {
		// Nunca logar `error` inteiro se ele puder conter a connection string
		// (quando FINAN_DATABASE_URL e usada, o pg_dump as vezes ecoa o
		// argumento em mensagens de erro). Loga so a mensagem.
		console.error("[finan:backup] Falha:", error?.message || String(error));
		process.exitCode = 1;

		// Melhor esforco: notificar quem gerencia configuracoes sobre a falha
		// do backup automatizado. E processo separado do servidor Express (sem
		// req/req.finanUser), entao chama o servico direto — 1 notificacao por
		// dia (dedupeKey), pra nao gerar spam se o cron rodar mais de uma vez.
		try {
			const notificationsService = require("../src/notifications/notificationsService");
			const today = new Date().toISOString().slice(0, 10);
			await notificationsService.createNotification({
				type: "backup",
				title: "Falha no backup automatizado",
				message: error?.message || "Não foi possível gerar o backup do PostgreSQL.",
				severity: "critical",
				targetPath: "/configuracao-geral/banco-de-dados",
				targets: { permissions: ["finan.configuracoes.manage"] },
				dedupeKey: `finan_backup_falha_${today}`,
			});
		} catch (notifyError) {
			console.error(
				"[finan:backup] Falha ao registrar notificação:",
				notifyError?.message || notifyError,
			);
		}
	})
	.finally(async () => {
		// jobExecutionService abre conexao com o Postgres (mesmo pool do
		// backend) — sem fechar, o processo CLI nunca sai sozinho (fica
		// pendurado esperando o pool, o systemd timer trataria como
		// "travado" em vez de "concluido").
		const db = require("../src/db");
		await db.closePool?.().catch(() => {});
	});
