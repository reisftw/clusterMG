import { emitRealtimeUpdate } from "./realtimeEvents";
import { requestVpsApi } from "./vpsApiClient";

const JOB_POLL_INTERVAL_MS = 1500;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const JOB_POLL_NETWORK_RETRY_LIMIT = 20;
const JOB_POLL_NETWORK_RETRY_DELAY_MS = 3000;

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitImportRealtime(source, result) {
	const eventPayload = { ...result, source: result?.source || source };
	emitRealtimeUpdate(source, eventPayload);
	emitRealtimeUpdate("dashboard", eventPayload);
	emitRealtimeUpdate("acompanhamento", eventPayload);
}

async function pollImportJob(jobId, { onProgress } = {}) {
	const startedAt = Date.now();
	let networkFailures = 0;

	while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
		let job = null;
		try {
			job = await requestVpsApi(`/imports/jobs/${encodeURIComponent(jobId)}`);
			networkFailures = 0;
		} catch (error) {
			const isTransientNetworkError =
				!error?.status || /failed to fetch|network/i.test(error?.message || "");
			if (
				isTransientNetworkError &&
				networkFailures < JOB_POLL_NETWORK_RETRY_LIMIT
			) {
				networkFailures += 1;
				onProgress?.({
					id: jobId,
					status: "running",
					stage: "Reconectando ao processamento...",
					error: null,
				});
				await wait(JOB_POLL_NETWORK_RETRY_DELAY_MS);
				continue;
			}
			throw error;
		}
		onProgress?.(job);

		if (job.status === "completed") {
			return job.result || {};
		}

		if (job.status === "failed") {
			throw new Error(job.error || "Falha no processamento.");
		}

		await wait(JOB_POLL_INTERVAL_MS);
	}

	throw new Error("Tempo limite aguardando processamento no backend.");
}

async function startImportJob(path, payload, { onProgress } = {}) {
	const started = await requestVpsApi(path, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});

	if (!started?.jobId) return started;

	onProgress?.(started);
	return pollImportJob(started.jobId, { onProgress });
}

export async function persistMapaImport(payload, options = {}) {
	const result = await startImportJob("/imports/mapa", payload, {
		onProgress: options.onProgress,
	});
	emitImportRealtime("mapa", result);
	return result;
}

export async function persistMatchImport(payload, options = {}) {
	const result = await startImportJob("/imports/match", payload, {
		onProgress: options.onProgress,
	});
	emitImportRealtime("match", result);
	return result;
}

export async function persistMetasImport(payload) {
	const result = await requestVpsApi("/imports/metas", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
	emitImportRealtime("metas", result);
	return result;
}

export async function saveMetasForceTaskConfig(config) {
	const result = await requestVpsApi("/imports/metas/forca-tarefa", {
		method: "POST",
		body: JSON.stringify({ config }),
	});
	emitImportRealtime("metas", result);
	return result;
}

export async function getMatchConfig(payload = {}) {
	const params = new URLSearchParams(payload || {});
	const suffix = params.toString() ? `?${params.toString()}` : "";
	return requestVpsApi(`/imports/match/config${suffix}`);
}

export async function saveMatchConfig(payload) {
	const result = await requestVpsApi("/imports/match/config", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
	const eventPayload = { ...result, source: result?.source || "match" };
	emitRealtimeUpdate("match", eventPayload);
	emitRealtimeUpdate("acompanhamento", eventPayload);
	return result;
}
