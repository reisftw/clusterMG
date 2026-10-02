const { HubsoftActivationSyncService } = require("../src/hubsoft/services/HubsoftActivationSyncService");
const db = require("../src/db");

function argValue(name, fallback = "") {
	const prefix = `--${name}=`;
	const found = process.argv.find((arg) => arg.startsWith(prefix));
	return found ? found.slice(prefix.length) : fallback;
}

function iso(date) {
	return date.toISOString().slice(0, 10);
}

function monthRanges(year, until = new Date()) {
	const ranges = [];
	for (let month = 0; month < 12; month += 1) {
		const from = new Date(Date.UTC(year, month, 1));
		const to = new Date(Date.UTC(year, month + 1, 0));
		if (from > until) break;
		ranges.push({ from: iso(from), to: iso(to > until ? until : to) });
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
