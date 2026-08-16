const db = require("../api/src/db");
const { createBackup } = require("../api/src/databaseBackups");

async function main() {
  const scheduled = process.argv.includes("--scheduled");
  const result = await createBackup({
    reason: scheduled ? "scheduled" : "manual-cli",
  });
  const latest = result.backups?.[0];
  console.log(JSON.stringify({
    ok: true,
    latestBackup: latest,
    currentBackups: result.retention.currentBackups,
    usedBytes: result.storage.usedBytes,
  }));
}

main()
  .catch((error) => {
    console.error("[database-backup] Falha:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => {});
  });
