const { HubsoftActivationSyncService } = require("../src/hubsoft/services/HubsoftActivationSyncService");
const db = require("../src/db");

function argValue(name, fallback = "") {
	const prefix = `--${name}=`;
	const found = process.argv.find((arg) => arg.startsWith(prefix));
	return found ? found.slice(prefix.length) : fallback;
}

function parseTypeIds(value) {
	if (!value) return null;
	return value.split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
}

async function main() {
	const dateFrom = argValue("from");
	const dateTo = argValue("to");
	if (!dateFrom || !dateTo) {
		throw new Error("Informe --from=YYYY-MM-DD e --to=YYYY-MM-DD para o sync controlado.");
	}
	const service = new HubsoftActivationSyncService();
	const result = await service.syncActivations({
		dateFrom,
		dateTo,
		orderTypeIds: parseTypeIds(argValue("types")),
		limit: Number(argValue("limit", "20")),
		maxPages: Number(argValue("max-pages", "2")),
		triggerType: "cli-controlled",
	});
	console.log(JSON.stringify(result, null, 2));
}

main()
	.catch((error) => {
		console.error("[hubsoft_activation_sync] Falha:", error.message);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool().catch(() => {});
	});
