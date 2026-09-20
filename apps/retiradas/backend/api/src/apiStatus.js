const fs = require("node:fs/promises");
const db = require("./db");
const databaseBackups = require("./databaseBackups");
const sempreIntegration = require("./sempreIntegration");
const hubsoftIntegration = require("./hubsoftIntegration");
const cvortexIntegration = require("./cvortexIntegration");
const mensageriaRepository = require("./mensageriaRepository");
const operationalEventsRepository = require("./operationalEventsRepository");
const API_PROCESS_STARTED_AT = new Date();
const API_STATUS_CACHE_TTL_MS = Math.max(
	Number(process.env.API_STATUS_CACHE_TTL_MS || 30000),
	0,
);
let apiStatusCache = null;

function nowIso() {
	return new Date().toISOString();
}

function formatDuration(secondsRaw) {
	const seconds = Math.max(0, Math.floor(Number(secondsRaw || 0)));
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m ${seconds % 60}s`;
}

async function recordRuntimeEvent(type, details = {}) {
	const event = operationalEventsRepository.buildRuntimeEvent(type, details);
	try {
		await operationalEventsRepository.recordRuntimeEvent(event);
	} catch (error) {
		console.error(
			"[apiStatus] Falha ao registrar evento de runtime:",
			error?.message || error,
		);
	}
}

async function listRuntimeEvents() {
	return operationalEventsRepository.listRuntimeEvents(30);
}

async function listServiceEvents() {
	return operationalEventsRepository.listServiceEvents(50);
}

async function getLastServiceStatuses() {
	return operationalEventsRepository.getLastServiceStatuses(300);
}

async function recordServiceEvent(service, previousStatus = "") {
	const data = operationalEventsRepository.buildServiceEvent(
		service,
		previousStatus,
	);
	await operationalEventsRepository.recordServiceEvent(data);
	return data;
}

async function syncServiceEvents(services = []) {
	try {
		const previousMap = await getLastServiceStatuses();
		const created = [];
		for (const service of services) {
			const previous = previousMap.get(service.id);
			if (!previous || previous.status !== service.status) {
				created.push(await recordServiceEvent(service, previous?.status || ""));
			}
		}
		return created;
	} catch (error) {
		console.error(
			"[apiStatus] Falha ao sincronizar eventos de serviço:",
			error?.message || error,
		);
		return [];
	}
}

function onlineService(id, name, details = {}) {
	return {
		id,
		name,
		status: "online",
		checkedAt: nowIso(),
		reason: "",
		details,
	};
}

function offlineService(id, name, error, details = {}) {
	return {
		id,
		name,
		status: "offline",
		checkedAt: nowIso(),
		reason: error?.message || String(error || "Falha desconhecida."),
		details,
	};
}

async function checkService(id, name, fn) {
	const startedAt = Date.now();
	try {
		const details = await fn();
		return onlineService(id, name, {
			responseMs: Date.now() - startedAt,
			...(details || {}),
		});
	} catch (error) {
		return offlineService(id, name, error, {
			responseMs: Date.now() - startedAt,
		});
	}
}

async function countTable(tableName) {
	const allowedTables = new Set([
		"app_users",
		"app_sessions",
		"app_documents",
		"static_snapshots",
	]);
	if (!allowedTables.has(tableName)) {
		throw new Error(`Tabela nao permitida para contagem: ${tableName}`);
	}
	const result = await db.query(
		`select count(*)::bigint as total from ${tableName}`,
	);
	return Number(result.rows[0]?.total || 0);
}

async function checkEvolutionStatus() {
	const config = await mensageriaRepository.getMessagingConfig();
	const baseUrl = String(config.evolutionBaseUrl || "").replace(/\/+$/, "");
	const apiKey = String(config.evolutionApiKey || "");
	const instance = String(config.evolutionInstance || "");
	if (!baseUrl || !apiKey || !instance) {
		throw new Error("Evolution API não configurada em Mensageria.");
	}
	const endpoint = `${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`;
	const response = await fetch(endpoint, {
		headers: {
			apikey: apiKey,
			Authorization: `Bearer ${apiKey}`,
		},
	});
	let payload = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}
	if (!response.ok) {
		throw new Error(
			payload?.message || payload?.error || `Evolution HTTP ${response.status}`,
		);
	}
	return {
		endpoint,
		instance,
		paused: Boolean(config.evolutionPaused),
		enabled: Boolean(config.evolutionEnabled),
		state:
			payload?.instance?.state ||
			payload?.state ||
			payload?.connectionState ||
			"desconhecido",
	};
}

function getCachedApiStatus() {
	if (!API_STATUS_CACHE_TTL_MS || !apiStatusCache) return null;
	const ageMs = Date.now() - apiStatusCache.createdAt;
	if (ageMs > API_STATUS_CACHE_TTL_MS) {
		apiStatusCache = null;
		return null;
	}
	return {
		...apiStatusCache.value,
		cache: {
			hit: true,
			ageMs,
			ttlMs: API_STATUS_CACHE_TTL_MS,
		},
	};
}

function setCachedApiStatus(value) {
	if (!API_STATUS_CACHE_TTL_MS) return value;
	apiStatusCache = { createdAt: Date.now(), value };
	return value;
}

async function buildApiStatus() {
	const uptimeSeconds = Math.floor(process.uptime());
	const runtimeEvents = await listRuntimeEvents().catch(() => []);
	const services = await Promise.all([
		checkService("database", "API do Banco de Dados", async () => {
			const health = await db.healthcheck();
			const size = await db.query(
				`select pg_size_pretty(pg_database_size(current_database())) as pretty`,
			);
			return {
				databaseTime: health.now,
				databaseSize: size.rows[0]?.pretty || "",
			};
		}),

		checkService("auth", "API de Login", async () => {
			const secret = process.env.APP_AUTH_SECRET || "";
			if (secret.length < 24) {
				throw new Error("APP_AUTH_SECRET não configurado ou muito curto.");
			}

			const users = await countTable("app_users");
			const sessions = await countTable("app_sessions");
			return {
				users,
				sessions,
				tokenTtl: `${Math.round(Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 365) / 3600)}h`,
			};
		}),

		checkService("documents", "API de Documentos", async () => {
			const total = await countTable("app_documents");
			const sample = await db.query(
				`select collection_path as "collectionPath", count(*)::bigint as total
           from app_documents
          group by collection_path
          order by total desc
          limit 5`,
			);
			return {
				documents: total,
				topCollections: sample.rows.map((row) => ({
					collectionPath: row.collectionPath,
					total: Number(row.total || 0),
				})),
			};
		}),

		checkService("public-data", "API de Dados Públicos", async () => {
			const snapshots = await countTable("static_snapshots");
			const result = await db.query(
				`select domain, generated_at as "generatedAt"
           from static_snapshots
          order by domain`,
			);
			return {
				snapshots,
				domains: result.rows,
			};
		}),

		checkService("imports", "API de Importações", async () => {
			const result = await db.query(
				`select collection_path as "collectionPath", count(*)::bigint as total
           from app_documents
          where collection_path = any($1::text[])
          group by collection_path
          order by collection_path`,
				[
					[
						"ordens_abertas",
						"match_os_abertas",
						"metas",
						"acompanhamento_diario",
						"agendamentos",
					],
				],
			);

			return {
				collections: result.rows.map((row) => ({
					collectionPath: row.collectionPath,
					total: Number(row.total || 0),
				})),
			};
		}),

		checkService("backups", "API de Backups", async () => {
			const status = await databaseBackups.getBackupStatus();
			await fs.access(status.storage.backupDir);
			return {
				backupDir: status.storage.backupDir,
				backups: status.retention.currentBackups,
				maxBackups: status.retention.maxBackups,
				usedBytes: status.storage.usedBytes,
				maxBytes: status.storage.maxBytes,
				lastBackupAt: status.backups[0]?.createdAt || null,
			};
		}),

		checkService("realtime", "API de Tempo Real", async () => ({
			endpoint: "/api/events",
			transport: "server-sent events",
		})),

		checkService("sempre-playground", "API Sempre Playground", async () =>
			sempreIntegration.checkStatus(),
		),

		checkService("hubsoft", "API Hubsoft", async () =>
			hubsoftIntegration.checkStatus(),
		),

		checkService("cvortex", "API Cvortex", async () =>
			cvortexIntegration.checkStatus(),
		),

		checkService("evolution-whatsapp", "API Evolution WhatsApp", async () =>
			checkEvolutionStatus(),
		),
	]);

	const online = services.filter(
		(service) => service.status === "online",
	).length;
	await syncServiceEvents(services);
	const serviceEvents = await listServiceEvents().catch(() => []);
	return {
		ok: online === services.length,
		checkedAt: nowIso(),
		runtime: {
			status: "online",
			startedAt: API_PROCESS_STARTED_AT.toISOString(),
			uptimeSeconds,
			uptimeLabel: formatDuration(uptimeSeconds),
			pid: process.pid,
			nodeVersion: process.version,
			memory: process.memoryUsage(),
			events: runtimeEvents,
			lastRestartAt:
				runtimeEvents.find((event) => event.type === "startup")?.createdAt ||
				API_PROCESS_STARTED_AT.toISOString(),
			recentIssues: runtimeEvents
				.filter((event) =>
					["uncaughtException", "unhandledRejection", "shutdown"].includes(
						event.type,
					),
				)
				.slice(0, 10),
		},
		summary: {
			online,
			offline: services.length - online,
			total: services.length,
		},
		services,
		serviceEvents,
	};
}

async function getApiStatus({ force = false } = {}) {
	if (!force) {
		const cached = getCachedApiStatus();
		if (cached) return cached;
	}
	return setCachedApiStatus(await buildApiStatus());
}

module.exports = {
	getApiStatus,
	recordRuntimeEvent,
};
