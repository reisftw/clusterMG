const db = require("../api/src/db");
const { createBackup } = require("../api/src/databaseBackups");

async function main() {
	const scheduled = process.argv.includes("--scheduled");
	const startedAt = Date.now();
	const heartbeat = setInterval(() => {
		const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
		console.log(`[database-backup] backup em andamento ha ${elapsedSeconds}s...`);
	}, Number(process.env.BACKUP_HEARTBEAT_MS || 30_000));
	heartbeat.unref?.();
	const result = await createBackup({
		reason: scheduled ? "scheduled" : "manual-cli",
	});
	clearInterval(heartbeat);
	const latest = result.backups?.[0];
	console.log(
		JSON.stringify({
			ok: true,
			latestBackup: latest,
			currentBackups: result.retention.currentBackups,
			usedBytes: result.storage.usedBytes,
		}),
	);
}

main()
	.catch((error) => {
		console.error("[database-backup] Falha:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool().catch(() => {});
	});
