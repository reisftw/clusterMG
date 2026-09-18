#!/usr/bin/env node
// Job diario de alertas do Calendario Financeiro. Rodar via systemd timer
// (ver apps/finan/ops/finan-calendar-alerts.{service,timer}.example),
// mesmo padrao operacional do backup do banco (systemd timer + script
// Node, sem fila/worker novo).
//
// Uso: node scripts/sendCalendarAlerts.js
const db = require("../src/db");
const { runCalendarAlerts } = require("../src/calendario/alertsService");
const jobExecutionService = require("../src/jobs/jobExecutionService");

// Roteiro Finan #28: registra a execucao na Central de Jobs (mesmo em
// falha) — ver jobExecutionService.js. Melhor esforco: o registro nunca
// pode impedir o alerta real de rodar.
async function main() {
	console.log("[finan-calendario-alertas] iniciando...");
	const summary = await jobExecutionService.runInstrumented(
		"calendario_alertas",
		{ trigger: "scheduled" },
		async () => {
			const result = await runCalendarAlerts();
			return { recordsProcessed: result.dueCount, summary: result };
		},
	);
	console.log(
		`[finan-calendario-alertas] concluido: ${summary.summary.checked} evento(s) no horizonte, ` +
			`${summary.summary.dueCount} alerta(s) devido(s) hoje, ${summary.summary.emailSent} e-mail(s) enviado(s), ` +
			`${summary.summary.pushSent} push(es) enviado(s), ${summary.summary.skipped} pulado(s) (ja processado), ` +
			`${summary.summary.failed} falha(s) de e-mail.`,
	);
}

main()
	.catch((error) => {
		console.error("[finan-calendario-alertas] erro fatal:", error?.message || error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool?.().catch(() => {});
	});
