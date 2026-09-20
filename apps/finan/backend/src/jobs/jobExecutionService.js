// Roteiro Finan #28 (Fase 4A — Central de Jobs e Integrações): registro
// central de execução das tarefas automáticas do Finan. Cada job chama
// startExecution() no início e finishExecution() no fim (sucesso ou
// falha) — ver instrumentação em:
//   - apps/finan/backend/scripts/database-backup.js (backup_database)
//   - apps/finan/backend/scripts/sendCalendarAlerts.js (calendario_alertas)
//   - apps/finan/backend/src/financeiroBudgetImportJobs.js (import_orcamento)
//
// Melhor esforço: uma falha ao registrar a execução nunca pode derrubar o
// job de verdade (mesmo padrão já usado em notificationsService/push) —
// por isso start/finishExecution nunca lançam, só logam no console.
const db = require("../db");
const { randomId } = require("../secureRandom");

// Registro estático dos jobs conhecidos — usado pra montar a Central de
// Jobs mesmo pra um job que nunca rodou ainda (aparece como "nunca
// executado" em vez de simplesmente não existir na tela).
const JOB_REGISTRY = {
	backup_database: {
		label: "Backup do banco de dados",
		description: "pg_dump completo do Postgres do Finan, todo dia às 00:30 UTC.",
		schedule: "Diário · 00:30 UTC",
		reprocessable: true,
	},
	calendario_alertas: {
		label: "Alertas do calendário financeiro",
		description: "Verifica eventos com antecedência vencendo hoje e envia e-mail/push.",
		schedule: "Diário",
		reprocessable: true,
	},
	import_orcamento: {
		label: "Importação de dados orçamentários",
		description: "Leitura das planilhas XLSX enviadas em Gestão Orçamentária > Dados.",
		schedule: "Sob demanda (upload manual)",
		reprocessable: false,
	},
	regras_financeiras: {
		label: "Avaliação de regras financeiras",
		description: "Verifica todas as regras ativas (Roteiro #40) contra o período atual e notifica quem violar o limiar.",
		schedule: "Sob demanda (reprocessar manual — sem timer automático ainda)",
		reprocessable: true,
	},
};

function jobLabel(jobKey) {
	return JOB_REGISTRY[jobKey]?.label || jobKey;
}

async function startExecution(jobKey, { trigger = "scheduled", triggeredBy = null } = {}) {
	const id = randomId("jobexec");
	try {
		await db.query(
			`insert into finan_job_execucoes
				(id, job_key, status, trigger_type, started_at, triggered_by_id, triggered_by_name)
			values ($1, $2, 'running', $3, now(), $4, $5)`,
			[id, jobKey, trigger, triggeredBy?.id || null, triggeredBy?.name || null],
		);
	} catch (error) {
		console.error(`[finan-jobs] falha ao registrar inicio de ${jobKey}:`, error?.message || error);
	}
	return id;
}

async function finishExecution(
	id,
	{ status = "success", recordsProcessed = null, errorMessage = null, summary = {} } = {},
) {
	if (!id) return;
	try {
		await db.query(
			`update finan_job_execucoes
			set status = $2,
				finished_at = now(),
				duration_ms = extract(epoch from (now() - started_at)) * 1000,
				records_processed = $3,
				error_message = $4,
				summary = $5::jsonb
			where id = $1`,
			[id, status, recordsProcessed, errorMessage, JSON.stringify(summary || {})],
		);
	} catch (error) {
		console.error(`[finan-jobs] falha ao registrar fim de execucao ${id}:`, error?.message || error);
	}
}

// Envolve uma execução completa (start -> fn() -> finish), preservando o
// resultado/erro original de fn. Usado pelos pontos de instrumentação pra
// não duplicar o try/catch de start/finish em cada job.
async function runInstrumented(jobKey, { trigger = "scheduled", triggeredBy = null } = {}, fn) {
	const execId = await startExecution(jobKey, { trigger, triggeredBy });
	try {
		const result = await fn();
		await finishExecution(execId, {
			status: "success",
			recordsProcessed: Number.isFinite(result?.recordsProcessed)
				? result.recordsProcessed
				: null,
			summary: result?.summary || {},
		});
		return result;
	} catch (error) {
		await finishExecution(execId, {
			status: "failed",
			errorMessage: error?.message || String(error),
		});
		throw error;
	}
}

function publicExecution(row) {
	return {
		id: row.id,
		jobKey: row.job_key,
		jobLabel: jobLabel(row.job_key),
		status: row.status,
		trigger: row.trigger_type,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		durationMs: row.duration_ms,
		recordsProcessed: row.records_processed,
		errorMessage: row.error_message,
		summary: row.summary || {},
		triggeredBy: row.triggered_by_name || row.triggered_by_id || null,
	};
}

// `offset` e `withTotal` sao opcionais — a rota legada (/api/finan/jobs)
// so passa jobKey/limit e ignora o total (mantem o comportamento de
// sempre); a rota v1 (Roteiro #26) usa os dois pra paginacao real.
async function listExecutions({ jobKey = null, limit = 30, offset = 0, withTotal = false } = {}) {
	const clauses = [];
	const params = [];
	if (jobKey) {
		params.push(jobKey);
		clauses.push(`job_key = $${params.length}`);
	}
	const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
	const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
	const safeOffset = Math.max(Number(offset) || 0, 0);
	params.push(safeLimit, safeOffset);
	const { rows } = await db.query(
		`select * from finan_job_execucoes ${where}
		order by started_at desc
		limit $${params.length - 1} offset $${params.length}`,
		params,
	);
	const executions = rows.map(publicExecution);
	if (!withTotal) return executions;
	const { rows: countRows } = await db.query(
		`select count(*)::int as total from finan_job_execucoes ${where}`,
		jobKey ? [jobKey] : [],
	);
	return { executions, total: countRows[0]?.total || 0 };
}

async function getJobsOverview() {
	const { rows } = await db.query(
		`select distinct on (job_key) *
		from finan_job_execucoes
		order by job_key, started_at desc`,
	);
	const lastByKey = new Map(rows.map((row) => [row.job_key, row]));

	const last24hStats = await db.query(
		`select job_key,
			count(*) filter (where status = 'success') as success_count,
			count(*) filter (where status = 'failed') as failed_count
		from finan_job_execucoes
		where started_at >= now() - interval '7 days'
		group by job_key`,
	);
	const statsByKey = new Map(last24hStats.rows.map((row) => [row.job_key, row]));

	return Object.entries(JOB_REGISTRY).map(([jobKey, meta]) => {
		const lastRow = lastByKey.get(jobKey);
		const stats = statsByKey.get(jobKey);
		return {
			jobKey,
			label: meta.label,
			description: meta.description,
			schedule: meta.schedule,
			reprocessable: meta.reprocessable,
			lastExecution: lastRow ? publicExecution(lastRow) : null,
			last7Days: {
				success: Number(stats?.success_count || 0),
				failed: Number(stats?.failed_count || 0),
			},
		};
	});
}

// Erro simples com `.code` reconhecido pelos dois handlers de rota (legado
// e v1) pra decidir o status HTTP certo, sem essa funcao depender de
// Express nem do envelope de nenhum dos dois.
class JobReprocessError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

// Compartilhado entre a rota legada (/api/finan/jobs) e a v1
// (/api/v1/jobs) — Roteiro #26: elimina a duplicacao de "como disparar
// cada job manualmente" que existia como copia em cada arquivo de rota.
async function reprocessJob(jobKey, { triggeredBy = {} } = {}) {
	const meta = JOB_REGISTRY[jobKey];
	if (!meta) throw new JobReprocessError("NOT_FOUND", "Job não reconhecido.");
	if (!meta.reprocessable) {
		throw new JobReprocessError(
			"NOT_REPROCESSABLE",
			"Este job não pode ser reprocessado manualmente — depende de um arquivo enviado pelo usuário.",
		);
	}

	if (jobKey === "calendario_alertas") {
		const { runCalendarAlerts } = require("../calendario/alertsService");
		const result = await runInstrumented(jobKey, { trigger: "manual", triggeredBy }, async () => {
			const summary = await runCalendarAlerts();
			return { recordsProcessed: summary.dueCount, summary };
		});
		return { kind: "summary", summary: result };
	}

	if (jobKey === "regras_financeiras") {
		const { avaliarRegrasAtivas } = require("../regras/service");
		const result = await runInstrumented(jobKey, { trigger: "manual", triggeredBy }, avaliarRegrasAtivas);
		return { kind: "summary", summary: result };
	}

	if (jobKey === "backup_database") {
		const { execFile } = require("node:child_process");
		const path = require("node:path");
		const scriptPath = path.join(__dirname, "../../scripts/database-backup.js");
		execFile(
			process.execPath,
			[scriptPath, "--manual", `--triggered-by=${triggeredBy.name || triggeredBy.id || "desconhecido"}`],
			{ timeout: 5 * 60 * 1000 },
			(error) => {
				if (error) console.error("[finan-jobs] backup manual falhou:", error.message);
			},
		);
		return { kind: "message", message: "Backup manual iniciado. Acompanhe o status na lista de execuções." };
	}

	throw new JobReprocessError("NOT_FOUND", "Job não reconhecido.");
}

module.exports = {
	JOB_REGISTRY,
	JobReprocessError,
	startExecution,
	finishExecution,
	runInstrumented,
	listExecutions,
	getJobsOverview,
	reprocessJob,
};
