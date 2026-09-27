const assert = require("node:assert/strict");
const db = require("../api/src/db");
const sync = require("../api/src/hubsoftSyncProfiles");

async function main() {
	assert.match((await db.query("select current_database() as name")).rows[0].name, /homolog/i);
	const recoverRun = process.argv.find((arg) => arg.startsWith("--recover-run="))?.split("=")[1];
	const stoppedBefore = process.argv.find((arg) => arg.startsWith("--stopped-before="))?.slice("--stopped-before=".length);
	if (recoverRun) {
		assert.ok(stoppedBefore, "Supply the verified service restart timestamp");
		const client = await db.connect();
		try {
			await client.query("begin");
			const removed = await client.query("delete from hubsoft_sync_locks where profile = 'MAPA' and sync_run_id = $1 and locked_at < $2::timestamptz returning sync_run_id", [recoverRun, stoppedBefore]);
			assert.equal(removed.rowCount, 1);
			await client.query("update hubsoft_sync_runs set status = 'FAILED', finished_at = now(), error_code = 'DEPLOY_INTERRUPTED', error_message = 'Processo anterior encerrado durante deploy de homologacao; nova execucao solicitada.' where id = $1 and status = 'RUNNING'", [recoverRun]);
			await client.query("commit");
		} catch (error) { await client.query("rollback"); throw error; }
		finally { client.release(); }
	}
	if (process.argv.includes("--status")) {
		console.log(JSON.stringify((await db.query("select pid, state, wait_event_type, wait_event, left(query, 120) as query from pg_stat_activity where datname = current_database() and state <> 'idle' and pid <> pg_backend_pid() limit 10")).rows));
		const config = (await require("../api/src/documents").getDocument("hubsoft_config/global"))?.data || {};
		console.log(JSON.stringify({ hasWebUser: Boolean(config.webUsername), hasWebPassword: Boolean(config.webPassword), envOverridesWebUser: Boolean(process.env.HUBSOFT_WEB_USERNAME && config.webUsername && process.env.HUBSOFT_WEB_USERNAME !== config.webUsername), envOverridesWebPassword: Boolean(process.env.HUBSOFT_WEB_PASSWORD && config.webPassword && process.env.HUBSOFT_WEB_PASSWORD !== config.webPassword) }));
		const profiles = await sync.getProfilesOverview();
		console.log(JSON.stringify(profiles.map((row) => ({ profile: row.profile, status: row.status, run: row.lastRun?.id, stage: row.lastRun?.result_summary?.stage, heartbeat: row.lastRun?.result_summary?.heartbeatAt, lock: row.lock })), null, 2));
		return;
	}
	const profile = process.argv.includes("--meta") ? "META_D0" : "MAPA";
	const run = await sync.runProfile(profile, { discoverTechnicians: false }, {});
	console.log(JSON.stringify({ id: run.id, status: run.status, total: run.unique_rows, summary: run.result_summary }, null, 2));
	assert.ok(run.status === "COMPLETE" || (profile === "META_D0" && run.status === "VALID_EMPTY_RESULT"));
}

main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
