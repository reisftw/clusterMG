#!/usr/bin/env node
// Job diario de alertas do Calendario Financeiro. Rodar via systemd timer
// (ver apps/finan/ops/finan-calendar-alerts.{service,timer}.example),
// mesmo padrao operacional do backup do banco (systemd timer + script
// Node, sem fila/worker novo).
//
// Uso: node scripts/sendCalendarAlerts.js
const db = require("../src/db");
const { runCalendarAlerts } = require("../src/calendario/alertsService");

async function main() {
	console.log("[finan-calendario-alertas] iniciando...");
	const summary = await runCalendarAlerts();
	console.log(
		`[finan-calendario-alertas] concluido: ${summary.checked} evento(s) no horizonte, ` +
			`${summary.dueCount} alerta(s) devido(s) hoje, ${summary.emailSent} e-mail(s) enviado(s), ` +
			`${summary.pushSent} push(es) enviado(s), ${summary.skipped} pulado(s) (ja processado), ` +
			`${summary.failed} falha(s) de e-mail.`,
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
