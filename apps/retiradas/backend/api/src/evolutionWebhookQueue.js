const crypto = require("node:crypto");
const db = require("./db");

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 10;

function text(value) {
	return String(value ?? "").trim();
}

function eventMessageId(payload = {}) {
	return text(
		payload?.data?.key?.id ||
			payload?.key?.id ||
			payload?.messageId ||
			payload?.id ||
			payload?.data?.id,
	);
}

function dedupeKey(payload = {}, eventName = "") {
	const messageId = eventMessageId(payload);
	const identity = messageId || JSON.stringify(payload);
	return crypto
		.createHash("sha256")
		.update(`${text(eventName)}|${text(payload.instance)}|${identity}`)
		.digest("hex");
}

function payloadWithoutSecret(payload = {}) {
	const safe = { ...payload };
	delete safe.secret;
	delete safe.apiKey;
	delete safe.apikey;
	return safe;
}

async function enqueue(payload = {}, eventName = "") {
	const safePayload = payloadWithoutSecret(payload);
	const result = await db.query(
		`insert into evolution_webhook_events (dedupe_key, event_name, payload)
		 values ($1, $2, $3::jsonb)
		 on conflict (dedupe_key) do nothing
		 returning id`,
		[dedupeKey(safePayload, eventName), text(eventName) || null, JSON.stringify(safePayload)],
	);
	const rowCount = Number(result?.rowCount || result?.rows?.length || 0);
	return { queued: rowCount > 0, duplicate: rowCount === 0 };
}

async function claimNext() {
	const result = await db.query(
		`with candidate as (
			select id
			  from evolution_webhook_events
			 where (status = 'PENDING' and next_attempt_at <= now())
			    or (status = 'PROCESSING' and locked_at < now() - interval '5 minutes')
			 order by id
			 for update skip locked
			 limit 1
		)
		update evolution_webhook_events event
		   set status = 'PROCESSING', attempts = attempts + 1,
		       locked_at = now(), updated_at = now()
		  from candidate
		 where event.id = candidate.id
		 returning event.*`,
	);
	return result?.rows?.[0] || null;
}

async function markProcessed(id) {
	await db.query(
		`update evolution_webhook_events
		    set status = 'PROCESSED', processed_at = now(), locked_at = null,
		        last_error = null, updated_at = now()
		  where id = $1`,
		[id],
	);
}

async function markFailed(event, error) {
	const attempts = Number(event.attempts || 1);
	const exhausted = attempts >= MAX_ATTEMPTS;
	const delaySeconds = Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));
	await db.query(
		`update evolution_webhook_events
		    set status = $2,
		        next_attempt_at = now() + ($3::text || ' seconds')::interval,
		        locked_at = null, last_error = $4, updated_at = now()
		  where id = $1`,
		[
			event.id,
			exhausted ? "FAILED" : "PENDING",
			String(delaySeconds),
			text(error?.message || error).slice(0, 2000),
		],
	);
}

async function requeueFailed(id) {
	const result = await db.query(
		`update evolution_webhook_events
		    set status = 'PENDING', attempts = 0, next_attempt_at = now(),
		        locked_at = null, processed_at = null, last_error = null,
		        updated_at = now()
		  where id = $1 and status = 'FAILED'
		  returning id`,
		[id],
	);
	return Number(result?.rowCount || result?.rows?.length || 0) > 0;
}

function createProcessor({
	agendamentoConfirmacao,
	evolutionMessaging,
	queueStore = { claimNext, markFailed, markProcessed },
}) {
	let running = false;

	async function processEvent(event) {
		const confirmation = await agendamentoConfirmacao.registerIncomingResponse(
			event.payload || {},
		);
		if (!confirmation?.confirmed) {
			await evolutionMessaging.registerCallback({
				...(event.payload || {}),
				webhookEvent: event.event_name || event.payload?.event || "",
			});
		}
		await queueStore.markProcessed(event.id);
	}

	async function runBatch() {
		if (running) return;
		running = true;
		try {
			for (let index = 0; index < BATCH_SIZE; index += 1) {
				const event = await queueStore.claimNext();
				if (!event) break;
				await processEvent(event).catch((error) =>
					queueStore.markFailed(event, error),
				);
			}
		} finally {
			running = false;
		}
	}

	return { runBatch };
}

function startWorker(app, dependencies) {
	if (app.locals.evolutionWebhookWorkerTimer) return;
	const processor = createProcessor(dependencies);
	const bootstrap = setTimeout(() => processor.runBatch().catch(console.error), 2_000);
	bootstrap.unref?.();
	const timer = setInterval(() => processor.runBatch().catch(console.error), 1_000);
	timer.unref?.();
	app.locals.evolutionWebhookWorkerBootstrap = bootstrap;
	app.locals.evolutionWebhookWorkerTimer = timer;
}

module.exports = {
	createProcessor,
	dedupeKey,
	enqueue,
	requeueFailed,
	startWorker,
	_test: { markFailed },
};
