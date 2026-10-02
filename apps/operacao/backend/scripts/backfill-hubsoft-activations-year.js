const { HubsoftActivationSyncService } = require("../src/hubsoft/services/HubsoftActivationSyncService");
const { localDateKey } = require("../src/hubsoft/normalizers/dates");
const db = require("../src/db");

function argValue(name, fallback = "") {
	const prefix = `--${name}=`;
	const found = process.argv.find((arg) => arg.startsWith(prefix));
	return found ? found.slice(prefix.length) : fallback;
}

function pad(value) {
	return String(value).padStart(2, "0");
}

function daysInMonth(year, month) {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthRanges(year, untilIso = localDateKey(new Date())) {
	const ranges = [];
	for (let month = 1; month <= 12; month += 1) {
		const from = `${year}-${pad(month)}-01`;
		const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
		if (from > untilIso) break;
		ranges.push({ from, to: monthEnd > untilIso ? untilIso : monthEnd });
	}
	return ranges;
}

async function main() {
	const year = Number(argValue("year", String(new Date().getFullYear())));
	const limit = Number(argValue("limit", process.env.HUBSOFT_SYNC_PAGE_SIZE || "50"));
	const maxPages = Number(argValue("max-pages", process.env.HUBSOFT_BACKFILL_MAX_PAGES || "300"));
	const service = new HubsoftActivationSyncService();
	for (const range of monthRanges(year)) {
		console.log(`[hubsoft_activation_backfill] ${range.from} ate ${range.to}`);
		const result = await service.syncActivations({
			dateFrom: range.from,
			dateTo: range.to,
			limit,
			maxPages,
			triggerType: "backfill-year",
		});
		console.log(JSON.stringify({ range, syncRunId: result.syncRunId, metrics: result.metrics }, null, 2));
	}
}

main()
	.catch((error) => {
		console.error("[hubsoft_activation_backfill] Falha:", error.message);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool().catch(() => {});
	});
