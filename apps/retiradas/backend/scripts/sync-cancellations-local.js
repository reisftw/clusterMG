const service = require("../api/src/serviceOrders/cancellations/serviceOrderCancellationsService");
const db = require("../api/src/db");

const TIME_ZONE = "America/Sao_Paulo";

function currentCompetencia() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
	}).format(new Date());
}

function normalizeCompetencia(value) {
	const text = String(value || "").trim();
	if (!text || text === "--current" || text === "current") return currentCompetencia();
	if (/^\d{4}-\d{2}$/.test(text)) return text;
	throw new Error(`Competencia invalida: ${text}. Use YYYY-MM, exemplo: 2026-09.`);
}

function parseArgs(argv) {
	const values = argv.filter((arg) => !["--prod", "--production"].includes(arg));
	if (!values.length) return [currentCompetencia()];
	if (values[0] === "--range") {
		const start = normalizeCompetencia(values[1]);
		const end = normalizeCompetencia(values[2]);
		const months = [];
		let [year, month] = start.split("-").map(Number);
		const [endYear, endMonth] = end.split("-").map(Number);
		while (year < endYear || (year === endYear && month <= endMonth)) {
			months.push(`${year}-${String(month).padStart(2, "0")}`);
			month += 1;
			if (month > 12) {
				month = 1;
				year += 1;
			}
		}
		return months;
	}
	return values.map(normalizeCompetencia);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitRun(runId, competencia) {
	let lastStatus = "";
	let lastTotals = "";
	const started = Date.now();
	while (true) {
		const result = await db.query(
			`select id, competencia, status, total_hubsoft, inserted_count, updated_count,
			        deleted_count, error_message
			   from service_order_cancellation_sync_runs
			  where id = $1`,
			[runId],
		);
		const row = result.rows[0];
		if (!row) throw new Error(`Run ${runId} nao encontrada para ${competencia}.`);

		const totals = `${row.total_hubsoft || 0}/${row.inserted_count || 0}/${row.updated_count || 0}/${row.deleted_count || 0}`;
		if (row.status !== lastStatus || totals !== lastTotals) {
			console.log(
				`[${competencia}] ${row.status} total/novos/atualizados/removidos=${totals}`,
			);
			lastStatus = row.status;
			lastTotals = totals;
		}

		if (row.status === "COMPLETE") return row;
		if (row.status === "FAILED") {
			throw new Error(`[${competencia}] ${row.error_message || "Falha sem detalhe."}`);
		}
		if (Date.now() - started > 30 * 60 * 1000) {
			throw new Error(`[${competencia}] timeout aguardando run ${runId}.`);
		}
		await sleep(3000);
	}
}

async function main() {
	const competencias = parseArgs(process.argv.slice(2));
	const user = {
		uid: "retiradas-local-cancellations-sync",
		displayName: "Sincronizacao local de cancelamentos",
		email: "local-sync@retiradas",
	};

	console.log(`Sincronizando cancelamentos: ${competencias.join(", ")}`);
	console.log("Origem: BI HubSoft via computador local. Destino: banco Retiradas.");

	const finalRows = [];
	for (const competencia of competencias) {
		console.log(`\n=== ${competencia} ===`);
		const response = await service.startSync({ competencia }, user);
		const runId = response?.run?.id;
		if (!runId) throw new Error(`Nao foi possivel iniciar run para ${competencia}.`);
		finalRows.push(await waitRun(runId, competencia));
	}

	console.log("\nResumo final:");
	for (const row of finalRows) {
		console.log(
			`${row.competencia}: total=${row.total_hubsoft || 0} novos=${row.inserted_count || 0} atualizados=${row.updated_count || 0} removidos=${row.deleted_count || 0}`,
		);
	}

	const check = await db.query(
		`select competencia, status, total_records, last_synced_at
		   from service_order_cancellation_competencies
		  where competencia = any($1::text[])
		  order by competencia`,
		[competencias],
	);
	console.table(check.rows);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool().catch(() => {});
	});
