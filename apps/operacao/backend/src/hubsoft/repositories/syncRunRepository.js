async function createSyncRun(client, { triggerType = "manual", dateFrom = null, dateTo = null, metadata = {} } = {}) {
	const { rows } = await client.query(
		`insert into hubsoft_activation_sync_runs (status, trigger_type, date_from, date_to, metadata, created_at, updated_at)
		 values ('pending', $1, $2::date, $3::date, $4::jsonb, now(), now())
		 returning *`,
		[triggerType, dateFrom, dateTo, JSON.stringify(metadata)],
	);
	return rows[0];
}

async function markSyncRunRunning(client, id, patch = {}) {
	await client.query(
		`update hubsoft_activation_sync_runs
		    set status = 'running',
		        started_at = coalesce(started_at, now()),
		        metadata = metadata || $2::jsonb,
		        updated_at = now()
		  where id = $1`,
		[id, JSON.stringify(patch)],
	);
}

async function updateSyncRunMetrics(client, id, metrics = {}) {
	await client.query(
		`update hubsoft_activation_sync_runs
		    set pages_processed = $2,
		        records_found = $3,
		        records_inserted = $4,
		        records_updated = $5,
		        records_unchanged = $6,
		        errors_count = $7,
		        metadata = metadata || $8::jsonb,
		        updated_at = now()
		  where id = $1`,
		[
			id,
			metrics.pagesProcessed || 0,
			metrics.recordsFound || 0,
			metrics.recordsInserted || 0,
			metrics.recordsUpdated || 0,
			metrics.recordsUnchanged || 0,
			metrics.errorsCount || 0,
			JSON.stringify(metrics.metadata || {}),
		],
	);
}

async function finishSyncRun(client, id, { status, errorMessage = null, metrics = {}, metadata = {} } = {}) {
	await client.query(
		`update hubsoft_activation_sync_runs
		    set status = $2,
		        finished_at = now(),
		        pages_processed = $3,
		        records_found = $4,
		        records_inserted = $5,
		        records_updated = $6,
		        records_unchanged = $7,
		        errors_count = $8,
		        error_message = $9,
		        metadata = metadata || $10::jsonb,
		        updated_at = now()
		  where id = $1`,
		[
			id,
			status,
			metrics.pagesProcessed || 0,
			metrics.recordsFound || 0,
			metrics.recordsInserted || 0,
			metrics.recordsUpdated || 0,
			metrics.recordsUnchanged || 0,
			metrics.errorsCount || 0,
			errorMessage,
			JSON.stringify(metadata),
		],
	);
}

module.exports = { createSyncRun, finishSyncRun, markSyncRunRunning, updateSyncRunMetrics };
