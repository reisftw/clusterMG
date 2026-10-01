const crypto = require("node:crypto");
const { HubsoftActivationSyncService } = require("../services/HubsoftActivationSyncService");

const jobs = new Map();

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

module.exports = { getHubsoftActivationSyncJob, startHubsoftActivationSyncJob };
