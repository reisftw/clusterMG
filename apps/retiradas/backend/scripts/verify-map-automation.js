const assert = require("node:assert/strict");
const db = require("../api/src/db");
const maps = require("../api/src/mapSyncUpdatesService");
const ranking = require("../api/src/rankingService");

async function main() {
	const database = (await db.query("select current_database() as name")).rows[0].name;
	assert.match(database, /homolog/i, "Verification requires the homolog database");
	const summary = await maps.getOperationalSummary();
	const hourlyTotal = summary.hourlyProduction.reduce((sum, row) => sum + row.total, 0);
	assert.equal(hourlyTotal, summary.dailyProduction.total);
	const reference = await ranking.getRanking({ start_date: summary.date, end_date: summary.date, dimension: "technician", limit: 5 });
	assert.deepEqual(summary.topTechnicians.map((row) => [row.id, row.total]), reference.ranking.map((row) => [row.id, row.production]));
	const history = await maps.listUpdates({ date: summary.date });
	const auth = require("../api/src/auth");
	const admin = (await db.query("select uid from app_users where role = 'admin' and disabled = false limit 1")).rows[0];
	assert.ok(admin, "An existing homolog administrator is required");
	const token = await auth.renewSessionFromPayload({ uid: admin.uid, jti: "homolog-verification" });
	const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
	try {
		for (const route of ["/api/acompanhamento/operational-summary", "/api/mapas/atualizacoes", "/api/ranking"]) {
			const response = await fetch(`http://127.0.0.1:3002${route}`, { headers: { Authorization: `Bearer ${token}` } });
			assert.equal(response.status, 200, `${route}: ${response.status}`);
			await response.json();
		}
	} finally { await auth.revokeSession(payload.jti); }
	for (const update of history.updates) {
		const detail = await maps.getUpdateDetail(update.id);
		assert.equal(detail.items.added.length, update.addedCount);
		assert.equal(detail.items.executed.length, update.executedCount);
		assert.equal(detail.items.otherRemovals.length, update.otherRemovedCount);
		assert.equal(update.currentTotal - update.previousTotal, update.addedCount - update.removedCount);
	}
	console.log(JSON.stringify({ database, date: summary.date, production: summary.dailyProduction.total, hourlyTotal, weeklyTotal: summary.weeklyProduction.total, historyCount: history.updates.length, lastMapUpdate: summary.lastMapUpdate, rankingMatches: true }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
