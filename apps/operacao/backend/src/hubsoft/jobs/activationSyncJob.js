const crypto = require("node:crypto");
const { localDateKey } = require("../normalizers/dates");
const { HubsoftActivationSyncService } = require("../services/HubsoftActivationSyncService");

const jobs = new Map();
let schedulerTimer = null;
let schedulerRunning = false;

function publicJob(job) {
	return {
		id: job.id,
		status: job.status,
		stage: job.stage,
		startedAt: job.startedAt,
		finishedAt: job.finishedAt,
		error: job.error,
		result: job.result,
		options: job.options,
	};
}

function startHubsoftActivationSyncJob(options = {}) {
	const id = crypto.randomUUID();
	const job = {
		id,
		status: "running",
		stage: "queued",
		startedAt: new Date().toISOString(),
		finishedAt: null,
		error: "",
		result: null,
		options: {
			dateFrom: options.dateFrom || null,
			dateTo: options.dateTo || null,
			orderTypeIds: options.orderTypeIds || null,
			triggerType: options.triggerType || "manual",
		},
	};
	jobs.set(id, job);
	(async () => {
		try {
			job.stage = "syncing";
			const service = new HubsoftActivationSyncService();
			job.result = await service.syncActivations({ ...options, triggerType: options.triggerType || "job" });
			job.status = "success";
			job.stage = "finished";
		} catch (error) {
			job.status = "failed";
			job.stage = "failed";
			job.error = error?.message || "Falha no job HubSoft Ativações.";
		} finally {
			job.finishedAt = new Date().toISOString();
		}
	})();
	return publicJob(job);
}

function getHubsoftActivationSyncJob(id) {
	const job = jobs.get(id);
	return job ? publicJob(job) : null;
}

function isoDateOnly(value) {
	const date = value ? new Date(value) : new Date();
	if (Number.isNaN(date.getTime())) return null;
	return localDateKey(date);
}

function daysAgo(days) {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return isoDateOnly(date);
}

function startHubsoftActivationHourlyScheduler(options = {}) {
	if (schedulerTimer || process.env.NODE_ENV === "test" || process.env.HUBSOFT_ACTIVATIONS_SCHEDULER === "disabled") return;
	const intervalMs = Number(options.intervalMs || process.env.HUBSOFT_ACTIVATIONS_SYNC_INTERVAL_MS || 60 * 60 * 1000);
	const windowDays = Number(options.windowDays || process.env.HUBSOFT_ACTIVATIONS_INCREMENTAL_DAYS || 7);
	const run = async () => {
		if (schedulerRunning) return;
		schedulerRunning = true;
		try {
			const service = new HubsoftActivationSyncService();
			await service.syncActivations({
				dateFrom: daysAgo(windowDays),
				dateTo: isoDateOnly(new Date()),
				triggerType: "scheduled-hourly",
				limit: Number(process.env.HUBSOFT_SYNC_PAGE_SIZE || 50),
				maxPages: Number(process.env.HUBSOFT_SYNC_MAX_PAGES || 20),
			});
		} catch (error) {
			console.error("[hubsoft_activation_scheduler] Falha:", error?.message || error);
		} finally {
			schedulerRunning = false;
		}
	};
	schedulerTimer = setInterval(run, intervalMs);
	schedulerTimer.unref?.();
	setTimeout(run, Number(process.env.HUBSOFT_ACTIVATIONS_SYNC_BOOT_DELAY_MS || 60_000)).unref?.();
	console.log(`[hubsoft_activation_scheduler] ativo a cada ${Math.round(intervalMs / 60000)} min`);
}

function stopHubsoftActivationHourlyScheduler() {
	if (schedulerTimer) clearInterval(schedulerTimer);
	schedulerTimer = null;
}

module.exports = {
	getHubsoftActivationSyncJob,
	startHubsoftActivationHourlyScheduler,
	startHubsoftActivationSyncJob,
	stopHubsoftActivationHourlyScheduler,
};
