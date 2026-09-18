// Roteiro Finan #27 (Observabilidade): logica de montagem do overview,
// extraida de routes.js (Roteiro #26 — API /api/v1) pra ser reaproveitada
// tanto pela rota legada (/api/finan/observabilidade) quanto pela nova
// (/api/v1/observabilidade), sem duplicar as queries em dois lugares.
const os = require("node:os");
const db = require("../db");
const metricsCollector = require("./metricsCollector");
const jobExecutionService = require("../jobs/jobExecutionService");

async function getPostgresSnapshot() {
	const [{ rows: sizeRows }, { rows: tableRows }] = await Promise.all([
		db.query(`select pg_database_size(current_database()) as bytes`),
		db.query(
			`select relname as table_name, n_live_tup as rows
			from pg_stat_user_tables
			where relname like 'finan_%'
			order by n_live_tup desc
			limit 8`,
		),
	]);
	return {
		sizeBytes: Number(sizeRows[0]?.bytes || 0),
		pool: db.getPoolStats(),
		biggestTables: tableRows.map((row) => ({ table: row.table_name, rows: Number(row.rows || 0) })),
	};
}

async function getOverview() {
	const [postgres, requestsSummary24h, requestsSummary1h, jobs] = await Promise.all([
		getPostgresSnapshot(),
		metricsCollector.getSummary({ hours: 24 }),
		metricsCollector.getSummary({ hours: 1 }),
		jobExecutionService.getJobsOverview(),
	]);
	const backupJob = jobs.find((job) => job.jobKey === "backup_database");
	return {
		process: {
			uptimeSeconds: Math.round(process.uptime()),
			memoryRssBytes: process.memoryUsage().rss,
			nodeVersion: process.version,
			loadAverage: os.loadavg(),
		},
		postgres,
		requests: { last1h: requestsSummary1h, last24h: requestsSummary24h },
		backup: {
			lastExecution: backupJob?.lastExecution || null,
			last7Days: backupJob?.last7Days || { success: 0, failed: 0 },
		},
		jobs,
	};
}

module.exports = { getPostgresSnapshot, getOverview };
