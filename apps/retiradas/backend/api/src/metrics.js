const { AsyncLocalStorage } = require("node:async_hooks");
const crypto = require("node:crypto");
const db = require("./db");

const asyncLocal = new AsyncLocalStorage();

const METRICS_ENABLED =
	String(process.env.METRICS_ENABLED || "false").toLowerCase() !== "false";
const MAINTENANCE_METRICS_ENABLED =
	String(process.env.MAINTENANCE_METRICS_ENABLED || "true").toLowerCase() !==
	"false";
const OBSERVABILITY_ENABLED =
	MAINTENANCE_METRICS_ENABLED &&
	String(process.env.OBSERVABILITY_ENABLED || "true").toLowerCase() !== "false";
const FLUSH_INTERVAL_MS = Number(process.env.METRICS_FLUSH_INTERVAL_MS || 5000);
const AGGREGATE_FLUSH_INTERVAL_MS = Number(
	process.env.MAINTENANCE_METRICS_FLUSH_INTERVAL_MS || 60000,
);
const MAX_BUFFER_SIZE = Number(process.env.METRICS_MAX_BUFFER_SIZE || 200);
const MAX_QUERY_TEXT_LENGTH = Number(
	process.env.METRICS_MAX_QUERY_TEXT_LENGTH || 500,
);
const MAX_QUERY_CARDINALITY = Math.max(
	20,
	Number(process.env.METRICS_MAX_QUERY_CARDINALITY) || 200,
);
const MAX_ROUTE_CARDINALITY = Math.max(
	50,
	Number(process.env.METRICS_MAX_ROUTE_CARDINALITY || 500),
);
const MAX_OPERATION_CARDINALITY = Math.max(
	20,
	Number(process.env.METRICS_MAX_OPERATION_CARDINALITY || 200),
);

let initialized = false;
let flushTimer = null;
let aggregateCleanupTimer = null;
let flushing = false;
const requestBuffer = [];
const queryBuffer = [];
let aggregateBuffer = new Map();
let operationBuffer = new Map();
let queryCardinalityBucket = "";
let queryCardinality = new Set();

const LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000];
const LATENCY_COLUMNS = [
	"duration_le_50",
	"duration_le_100",
	"duration_le_250",
	"duration_le_500",
	"duration_le_1000",
	"duration_le_2500",
	"duration_le_5000",
	"duration_gt_5000",
];
const IGNORED_METRIC_ROUTES = ["/metrics"];
const EXPECTED_4XX_ROUTES = [
	"/api/auth/me",
	"/api/events",
	"/api/push/config",
	"/api/public/sempre/equipment",
	"/api/service-orders/return-receipts/lookup",
	"/api/tentativas/:id/iniciar",
	"/api/tentativas/tent_:id/iniciar",
	"/api/tentativas/:id/timeline",
	"/api/agendamentos/clientes/:id",
];

function nowIso() {
	return new Date().toISOString();
}

function elapsedMs(startNs) {
	return Number(process.hrtime.bigint() - startNs) / 1e6;
}

function normalizePath(path = "") {
	return String(path || "")
		.split("?")[0]
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ":id")
		.replace(/\b(?:\+?55)?\d{10,13}\b/g, ":id")
		.replace(
			/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
			":id",
		)
		.replace(/[0-9a-f]{8,}/gi, ":id")
		.replace(/\b\d{4,}\b/g, ":id")
		.replace(/\/+/g, "/");
}

function getRouteLabel(req) {
	if (req.baseUrl && req.route?.path) {
		return normalizePath(`${req.baseUrl}${req.route.path}`);
	}
	return normalizePath(req.originalUrl || req.url || req.path || "unknown");
}

function shouldIgnoreRequest(req) {
	const path = String(req.originalUrl || req.url || "");
	return (
		IGNORED_METRIC_ROUTES.includes(normalizePath(path)) ||
		path.startsWith("/api/admin/metrics") ||
		path.startsWith("/api/maintenance/dashboard")
	);
}

function compactQueryText(query) {
	if (typeof query === "object" && query?.text) {
		return String(query.text);
	}
	return String(query || "");
}

function normalizeQuery(query) {
	return compactQueryText(query)
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/--[^\r\n]*/g, " ")
		.replace(/\$([a-z_][a-z0-9_]*)?\$[\s\S]*?\$\1\$/gi, "?")
		.replace(/'(?:''|\\.|[^'])*'/g, "?")
		.replace(/\b(?:true|false|null)\b/gi, "?")
		.replace(/\b\d+(?:\.\d+)?\b/g, "?")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_QUERY_TEXT_LENGTH);
}

function limitQueryCardinality(queryText) {
	const bucket = hourBucket();
	if (bucket !== queryCardinalityBucket) {
		queryCardinalityBucket = bucket;
		queryCardinality = new Set();
	}
	if (queryCardinality.has(queryText)) return queryText;
	if (queryCardinality.size >= MAX_QUERY_CARDINALITY) return "SQL_OTHER";
	queryCardinality.add(queryText);
	return queryText;
}

function queryErrorLabel(error) {
	return error ? "query_error" : null;
}

function shouldIgnoreQuery(queryText = "") {
	const normalized = String(queryText || "").toLowerCase();
	return (
		normalized.includes("metrics_requests") ||
		normalized.includes("metrics_queries") ||
		normalized.includes("maintenance_route_metrics_hourly") ||
		normalized.includes("maintenance_operation_metrics_hourly")
	);
}

function hourBucket(date = new Date()) {
	const bucket = new Date(date);
	bucket.setUTCMinutes(0, 0, 0);
	return bucket.toISOString();
}

function latencyBucketIndex(durationMs) {
	const value = Math.max(0, Number(durationMs) || 0);
	const index = LATENCY_BUCKETS.findIndex((limit) => value <= limit);
	return index === -1 ? LATENCY_BUCKETS.length : index;
}

function createAggregate({ bucketStart, method, route }) {
	return {
		bucketStart,
		method,
		route,
		requests: 0,
		errors4xx: 0,
		errors5xx: 0,
		durationTotalMs: 0,
		durationMaxMs: 0,
		latencyBuckets: Array(LATENCY_COLUMNS.length).fill(0),
		queryCount: 0,
		queryErrors: 0,
		queryTotalMs: 0,
		queryDurationMaxMs: 0,
		responseBytes: 0,
		poolWaitCount: 0,
		poolWaitTotalMs: 0,
		poolWaitMaxMs: 0,
		poolTimeouts: 0,
		longTransactions: 0,
		lastErrorCode: "",
	};
}

function mergeAggregate(target, source) {
	target.requests += source.requests;
	target.errors4xx += source.errors4xx;
	target.errors5xx += source.errors5xx;
	target.durationTotalMs += source.durationTotalMs;
	target.durationMaxMs = Math.max(target.durationMaxMs, source.durationMaxMs);
	target.queryCount += source.queryCount;
	target.queryErrors += source.queryErrors;
	target.queryTotalMs += source.queryTotalMs;
	target.queryDurationMaxMs = Math.max(target.queryDurationMaxMs, source.queryDurationMaxMs);
	target.responseBytes += source.responseBytes;
	target.poolWaitCount += source.poolWaitCount;
	target.poolWaitTotalMs += source.poolWaitTotalMs;
	target.poolWaitMaxMs = Math.max(target.poolWaitMaxMs, source.poolWaitMaxMs);
	target.poolTimeouts += source.poolTimeouts;
	target.longTransactions += source.longTransactions;
	target.lastErrorCode = source.lastErrorCode || target.lastErrorCode;
	for (let index = 0; index < LATENCY_COLUMNS.length; index += 1) {
		target.latencyBuckets[index] += source.latencyBuckets[index];
	}
	return target;
}

function recordAggregateRequest(item) {
	if (!MAINTENANCE_METRICS_ENABLED) return;
	const bucketStart = hourBucket();
	const method = String(item.method || "UNKNOWN").toUpperCase().slice(0, 16);
	let route = normalizePath(item.route || "unknown").slice(0, 500);
	let key = `${bucketStart}\u0000${method}\u0000${route}`;
	if (!aggregateBuffer.has(key) && aggregateBuffer.size >= MAX_ROUTE_CARDINALITY) {
		route = "/__other__";
		key = `${bucketStart}\u0000${method}\u0000${route}`;
	}
	const aggregate =
		aggregateBuffer.get(key) || createAggregate({ bucketStart, method, route });
	const statusCode = Number(item.statusCode || 0);
	const durationMs = Math.max(0, Number(item.durationMs) || 0);
	aggregate.requests += 1;
	aggregate.errors4xx += statusCode >= 400 && statusCode < 500 ? 1 : 0;
	aggregate.errors5xx += statusCode >= 500 ? 1 : 0;
	aggregate.durationTotalMs += durationMs;
	aggregate.durationMaxMs = Math.max(aggregate.durationMaxMs, durationMs);
	aggregate.latencyBuckets[latencyBucketIndex(durationMs)] += 1;
	aggregate.queryCount += Math.max(0, Number(item.queryCount) || 0);
	aggregate.queryErrors += Math.max(0, Number(item.queryErrors) || 0);
	aggregate.queryTotalMs += Math.max(0, Number(item.queryTotalMs) || 0);
	aggregate.queryDurationMaxMs = Math.max(aggregate.queryDurationMaxMs, Number(item.queryDurationMaxMs) || 0);
	aggregate.responseBytes += Math.max(0, Number(item.responseBytes) || 0);
	aggregate.poolWaitCount += Math.max(0, Number(item.poolWaitCount) || 0);
	aggregate.poolWaitTotalMs += Math.max(0, Number(item.poolWaitTotalMs) || 0);
	aggregate.poolWaitMaxMs = Math.max(aggregate.poolWaitMaxMs, Number(item.poolWaitMaxMs) || 0);
	aggregate.poolTimeouts += Math.max(0, Number(item.poolTimeouts) || 0);
	aggregate.longTransactions += Math.max(0, Number(item.longTransactions) || 0);
	if (item.errorCode) {
		aggregate.lastErrorCode = sanitizeLabel(item.errorCode, 80);
	}
	aggregateBuffer.set(key, aggregate);
}

function sanitizeLabel(value, maxLength = 100) {
	return String(value || "")
		.replace(/[^a-z0-9_.:-]+/gi, "_")
		.slice(0, maxLength) || "unknown";
}

function createOperationAggregate({ bucketStart, kind, name, stage }) {
	return {
		bucketStart, kind, name, stage, calls: 0, successes: 0, failures: 0,
		timeouts: 0, fallbacks: 0, durationTotalMs: 0, durationMaxMs: 0,
		latencyBuckets: Array(LATENCY_COLUMNS.length).fill(0), queryCount: 0,
		queryErrors: 0, queryTotalMs: 0, processed: 0, updated: 0, ignored: 0,
	};
}

function recordOperation(item = {}) {
	if (!OBSERVABILITY_ENABLED) return;
	const bucketStart = hourBucket();
	const kind = sanitizeLabel(item.kind, 24);
	const name = sanitizeLabel(item.name, 100);
	let stage = sanitizeLabel(item.stage, 100);
	let key = `${bucketStart}\u0000${kind}\u0000${name}\u0000${stage}`;
	if (!operationBuffer.has(key) && operationBuffer.size >= MAX_OPERATION_CARDINALITY) {
		stage = "other";
		key = `${bucketStart}\u0000${kind}\u0000${name}\u0000${stage}`;
	}
	const aggregate = operationBuffer.get(key) || createOperationAggregate({ bucketStart, kind, name, stage });
	const durationMs = Math.max(0, Number(item.durationMs) || 0);
	aggregate.calls += 1;
	aggregate.successes += item.success === false ? 0 : 1;
	aggregate.failures += item.success === false ? 1 : 0;
	aggregate.timeouts += item.timeout ? 1 : 0;
	aggregate.fallbacks += item.fallback ? 1 : 0;
	aggregate.durationTotalMs += durationMs;
	aggregate.durationMaxMs = Math.max(aggregate.durationMaxMs, durationMs);
	aggregate.latencyBuckets[latencyBucketIndex(durationMs)] += 1;
	aggregate.queryCount += Math.max(0, Number(item.queryCount) || 0);
	aggregate.queryErrors += Math.max(0, Number(item.queryErrors) || 0);
	aggregate.queryTotalMs += Math.max(0, Number(item.queryTotalMs) || 0);
	aggregate.processed += Math.max(0, Number(item.processed) || 0);
	aggregate.updated += Math.max(0, Number(item.updated) || 0);
	aggregate.ignored += Math.max(0, Number(item.ignored) || 0);
	operationBuffer.set(key, aggregate);
}

function fingerprintQuery(queryText) {
	return crypto.createHash("sha1").update(queryText).digest("hex").slice(0, 16);
}

async function metricsQuery(text, params) {
	const queryFn = typeof db.rawQuery === "function" ? db.rawQuery : db.query;
	return queryFn(text, params, { skipMetrics: true });
}

function pushWithLimit(buffer, item) {
	buffer.push(item);
	if (buffer.length >= MAX_BUFFER_SIZE) {
		flushMetrics().catch((error) => {
			console.error("[metrics] Falha ao enviar metricas:", error);
		});
	}
}

async function ensureTables() {
	// O schema e exclusivamente responsabilidade das migrations versionadas.
}

async function flushRequests(items) {
	if (!items.length) return;
	const values = [];
	const placeholders = items.map((item, index) => {
		const base = index * 8;
		values.push(
			item.method,
			item.route,
			item.statusCode,
			item.durationMs,
			item.queryCount,
			item.queryTotalMs,
			item.userId || null,
			item.requestId || null,
		);
		return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
	});
	await metricsQuery(
		`insert into metrics_requests
      (method, route, status_code, duration_ms, query_count, query_total_ms, user_id, request_id)
     values ${placeholders.join(", ")}`,
		values,
	);
}

async function flushQueries(items) {
	if (!items.length) return;
	const values = [];
	const placeholders = items.map((item, index) => {
		const base = index * 7;
		values.push(
			item.method || null,
			item.route || null,
			item.queryFingerprint,
			item.queryText,
			item.durationMs,
			item.error || null,
			item.requestId || null,
		);
		return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
	});
	await metricsQuery(
		`insert into metrics_queries
      (method, route, query_fingerprint, query_text, duration_ms, error, request_id)
     values ${placeholders.join(", ")}`,
		values,
	);
}

async function flushAggregates(items) {
	if (!items.length) return;
	for (let offset = 0; offset < items.length; offset += 100) {
		const batch = items.slice(offset, offset + 100);
		const values = [];
		const placeholders = batch.map((item, index) => {
			const base = index * 27;
			values.push(
				item.bucketStart,
				item.method,
				item.route,
				item.requests,
				item.errors4xx,
				item.errors5xx,
				item.durationTotalMs,
				item.durationMaxMs,
				...item.latencyBuckets,
				item.queryCount,
				item.queryErrors,
				item.queryTotalMs,
				item.queryDurationMaxMs,
				item.responseBytes,
				item.poolWaitCount,
				item.poolWaitTotalMs,
				item.poolWaitMaxMs,
				item.poolTimeouts,
				item.longTransactions,
				item.lastErrorCode || null,
			);
			return `(${Array.from({ length: 27 }, (_, parameter) => `$${base + parameter + 1}`).join(",")},now())`;
		});
		await metricsQuery(
			`insert into maintenance_route_metrics_hourly (
			  bucket_start,method,route,requests,errors_4xx,errors_5xx,
			  duration_total_ms,duration_max_ms,
			  duration_le_50,duration_le_100,duration_le_250,duration_le_500,
			  duration_le_1000,duration_le_2500,duration_le_5000,duration_gt_5000,
			  query_count,query_errors,query_total_ms,query_duration_max_ms,response_bytes,
			  pool_wait_count,pool_wait_total_ms,pool_wait_max_ms,pool_timeouts,long_transactions,
			  last_error_code,updated_at
			) values ${placeholders.join(",")}
			on conflict (bucket_start,method,route) do update set
			  requests=maintenance_route_metrics_hourly.requests+excluded.requests,
			  errors_4xx=maintenance_route_metrics_hourly.errors_4xx+excluded.errors_4xx,
			  errors_5xx=maintenance_route_metrics_hourly.errors_5xx+excluded.errors_5xx,
			  duration_total_ms=maintenance_route_metrics_hourly.duration_total_ms+excluded.duration_total_ms,
			  duration_max_ms=greatest(maintenance_route_metrics_hourly.duration_max_ms,excluded.duration_max_ms),
			  duration_le_50=maintenance_route_metrics_hourly.duration_le_50+excluded.duration_le_50,
			  duration_le_100=maintenance_route_metrics_hourly.duration_le_100+excluded.duration_le_100,
			  duration_le_250=maintenance_route_metrics_hourly.duration_le_250+excluded.duration_le_250,
			  duration_le_500=maintenance_route_metrics_hourly.duration_le_500+excluded.duration_le_500,
			  duration_le_1000=maintenance_route_metrics_hourly.duration_le_1000+excluded.duration_le_1000,
			  duration_le_2500=maintenance_route_metrics_hourly.duration_le_2500+excluded.duration_le_2500,
			  duration_le_5000=maintenance_route_metrics_hourly.duration_le_5000+excluded.duration_le_5000,
			  duration_gt_5000=maintenance_route_metrics_hourly.duration_gt_5000+excluded.duration_gt_5000,
			  query_count=maintenance_route_metrics_hourly.query_count+excluded.query_count,
			  query_errors=maintenance_route_metrics_hourly.query_errors+excluded.query_errors,
			  query_total_ms=maintenance_route_metrics_hourly.query_total_ms+excluded.query_total_ms,
			  query_duration_max_ms=greatest(maintenance_route_metrics_hourly.query_duration_max_ms,excluded.query_duration_max_ms),
			  response_bytes=maintenance_route_metrics_hourly.response_bytes+excluded.response_bytes,
			  pool_wait_count=maintenance_route_metrics_hourly.pool_wait_count+excluded.pool_wait_count,
			  pool_wait_total_ms=maintenance_route_metrics_hourly.pool_wait_total_ms+excluded.pool_wait_total_ms,
			  pool_wait_max_ms=greatest(maintenance_route_metrics_hourly.pool_wait_max_ms,excluded.pool_wait_max_ms),
			  pool_timeouts=maintenance_route_metrics_hourly.pool_timeouts+excluded.pool_timeouts,
			  long_transactions=maintenance_route_metrics_hourly.long_transactions+excluded.long_transactions,
			  last_error_code=coalesce(excluded.last_error_code,maintenance_route_metrics_hourly.last_error_code),
			  updated_at=now()`,
			values,
		);
	}
}

async function flushOperations(items) {
	if (!items.length) return;
	for (let offset = 0; offset < items.length; offset += 100) {
		const batch = items.slice(offset, offset + 100);
		const values = [];
		const placeholders = batch.map((item, index) => {
			const base = index * 25;
			values.push(
				item.bucketStart, item.kind, item.name, item.stage, item.calls,
				item.successes, item.failures, item.timeouts, item.fallbacks,
				item.durationTotalMs, item.durationMaxMs, ...item.latencyBuckets,
				item.queryCount, item.queryErrors, item.queryTotalMs,
				item.processed, item.updated, item.ignored,
			);
			return `(${Array.from({ length: 25 }, (_, parameter) => `$${base + parameter + 1}`).join(",")},now())`;
		});
		await metricsQuery(
			`insert into maintenance_operation_metrics_hourly (
			 bucket_start,kind,name,stage,calls,successes,failures,timeouts,fallbacks,
			 duration_total_ms,duration_max_ms,duration_le_50,duration_le_100,duration_le_250,
			 duration_le_500,duration_le_1000,duration_le_2500,duration_le_5000,duration_gt_5000,
			 query_count,query_errors,query_total_ms,processed,updated,ignored,updated_at
			) values ${placeholders.join(",")}
			on conflict (bucket_start,kind,name,stage) do update set
			 calls=maintenance_operation_metrics_hourly.calls+excluded.calls,
			 successes=maintenance_operation_metrics_hourly.successes+excluded.successes,
			 failures=maintenance_operation_metrics_hourly.failures+excluded.failures,
			 timeouts=maintenance_operation_metrics_hourly.timeouts+excluded.timeouts,
			 fallbacks=maintenance_operation_metrics_hourly.fallbacks+excluded.fallbacks,
			 duration_total_ms=maintenance_operation_metrics_hourly.duration_total_ms+excluded.duration_total_ms,
			 duration_max_ms=greatest(maintenance_operation_metrics_hourly.duration_max_ms,excluded.duration_max_ms),
			 duration_le_50=maintenance_operation_metrics_hourly.duration_le_50+excluded.duration_le_50,
			 duration_le_100=maintenance_operation_metrics_hourly.duration_le_100+excluded.duration_le_100,
			 duration_le_250=maintenance_operation_metrics_hourly.duration_le_250+excluded.duration_le_250,
			 duration_le_500=maintenance_operation_metrics_hourly.duration_le_500+excluded.duration_le_500,
			 duration_le_1000=maintenance_operation_metrics_hourly.duration_le_1000+excluded.duration_le_1000,
			 duration_le_2500=maintenance_operation_metrics_hourly.duration_le_2500+excluded.duration_le_2500,
			 duration_le_5000=maintenance_operation_metrics_hourly.duration_le_5000+excluded.duration_le_5000,
			 duration_gt_5000=maintenance_operation_metrics_hourly.duration_gt_5000+excluded.duration_gt_5000,
			 query_count=maintenance_operation_metrics_hourly.query_count+excluded.query_count,
			 query_errors=maintenance_operation_metrics_hourly.query_errors+excluded.query_errors,
			 query_total_ms=maintenance_operation_metrics_hourly.query_total_ms+excluded.query_total_ms,
			 processed=maintenance_operation_metrics_hourly.processed+excluded.processed,
			 updated=maintenance_operation_metrics_hourly.updated+excluded.updated,
			 ignored=maintenance_operation_metrics_hourly.ignored+excluded.ignored,
			 updated_at=now()`, values,
		);
	}
}

async function pruneAggregateMetrics() {
	if (!MAINTENANCE_METRICS_ENABLED) return;
	await metricsQuery(
		"delete from maintenance_route_metrics_hourly where bucket_start < now()-interval '31 days'",
	);
	if (OBSERVABILITY_ENABLED) {
		await metricsQuery(
			"delete from maintenance_operation_metrics_hourly where bucket_start < now()-interval '31 days'",
		);
	}
}

async function flushMetrics() {
	if (flushing) return;
	if (
		!requestBuffer.length &&
		!queryBuffer.length &&
		!aggregateBuffer.size &&
		!operationBuffer.size
	) return;
	flushing = true;
	const requests = requestBuffer.splice(0, requestBuffer.length);
	const queries = queryBuffer.splice(0, queryBuffer.length);
	const aggregates = [...aggregateBuffer.values()];
	const operations = [...operationBuffer.values()];
	aggregateBuffer = new Map();
	operationBuffer = new Map();
	try {
		if (METRICS_ENABLED) {
			await flushRequests(requests);
			await flushQueries(queries);
		}
		if (MAINTENANCE_METRICS_ENABLED) await flushAggregates(aggregates);
		if (OBSERVABILITY_ENABLED) await flushOperations(operations);
	} catch (error) {
		requestBuffer.unshift(...requests.slice(-MAX_BUFFER_SIZE));
		queryBuffer.unshift(...queries.slice(-MAX_BUFFER_SIZE));
		for (const item of aggregates) {
			const key = `${item.bucketStart}\u0000${item.method}\u0000${item.route}`;
			const current = aggregateBuffer.get(key);
			aggregateBuffer.set(
				key,
				current ? mergeAggregate(current, item) : item,
			);
		}
		for (const item of operations) {
			const key = `${item.bucketStart}\u0000${item.kind}\u0000${item.name}\u0000${item.stage}`;
			operationBuffer.set(key, item);
		}
		throw error;
	} finally {
		flushing = false;
	}
}

async function initMetrics() {
	if ((!METRICS_ENABLED && !MAINTENANCE_METRICS_ENABLED) || initialized) return;
	initialized = true;
	await ensureTables();
	await pruneAggregateMetrics();
	global.__retiradasMetricsRecordQuery = recordQuery;
	global.__retiradasMetricsRecordPool = recordPoolEvent;
	flushTimer = setInterval(() => {
		flushMetrics().catch((error) => {
			console.error("[metrics] Falha ao enviar metricas:", error);
		});
	}, METRICS_ENABLED
		? Math.min(FLUSH_INTERVAL_MS, AGGREGATE_FLUSH_INTERVAL_MS)
		: AGGREGATE_FLUSH_INTERVAL_MS);
	flushTimer.unref?.();
	aggregateCleanupTimer = setInterval(() => {
		pruneAggregateMetrics().catch((error) => {
			console.error("[metrics] Falha ao limpar agregados antigos:", error);
		});
	}, 24 * 60 * 60 * 1000);
	aggregateCleanupTimer.unref?.();
}

function metricsMiddleware(req, res, next) {
	if ((!METRICS_ENABLED && !MAINTENANCE_METRICS_ENABLED) || shouldIgnoreRequest(req)) {
		next();
		return;
	}

	const startedNs = process.hrtime.bigint();
	const context = {
		requestId: crypto.randomUUID(),
		method: req.method,
		route: normalizePath(req.originalUrl || req.url || req.path || "unknown"),
		queryCount: 0,
		queryErrors: 0,
		queryTotalMs: 0,
		queryDurationMaxMs: 0,
		poolWaitCount: 0,
		poolWaitTotalMs: 0,
		poolWaitMaxMs: 0,
		poolTimeouts: 0,
		longTransactions: 0,
	};

	asyncLocal.run(context, () => {
		res.setHeader("X-Request-Id", context.requestId);
		res.on("finish", () => {
			context.route = getRouteLabel(req);
			const contentLength = Number(res.getHeader("content-length"));
			const item = {
				method: context.method,
				route: context.route,
				statusCode: res.statusCode,
				durationMs: elapsedMs(startedNs),
				queryCount: context.queryCount,
				queryErrors: context.queryErrors,
				queryTotalMs: context.queryTotalMs,
				queryDurationMaxMs: context.queryDurationMaxMs,
				responseBytes: Number.isFinite(contentLength) ? contentLength : 0,
				poolWaitCount: context.poolWaitCount,
				poolWaitTotalMs: context.poolWaitTotalMs,
				poolWaitMaxMs: context.poolWaitMaxMs,
				poolTimeouts: context.poolTimeouts,
				longTransactions: context.longTransactions,
				errorCode: res.locals.metricsErrorCode || "",
				userId: req.user?.uid || null,
				requestId: context.requestId,
			};
			recordAggregateRequest(item);
			if (METRICS_ENABLED) pushWithLimit(requestBuffer, item);
		});
		next();
	});
}

function recordQuery({ query, durationMs, error }) {
	if (!METRICS_ENABLED && !MAINTENANCE_METRICS_ENABLED) return;

	const context = asyncLocal.getStore();
	if (context) {
		context.queryCount += 1;
		context.queryErrors += error ? 1 : 0;
		context.queryTotalMs += durationMs;
		context.queryDurationMaxMs = Math.max(context.queryDurationMaxMs || 0, durationMs);
	}

	if (!METRICS_ENABLED) return;
	const queryText = normalizeQuery(query);
	if (!queryText || shouldIgnoreQuery(queryText)) return;
	const boundedQueryText = limitQueryCardinality(queryText);
	pushWithLimit(queryBuffer, {
		method: context?.method || null,
		route: context?.route || null,
		queryFingerprint: fingerprintQuery(boundedQueryText),
		queryText: boundedQueryText,
		durationMs,
		error: queryErrorLabel(error),
		requestId: context?.requestId || null,
	});
}

function recordPoolEvent({ waitMs = 0, error = null, transactionMs = 0 } = {}) {
	if (!OBSERVABILITY_ENABLED) return;
	const context = asyncLocal.getStore();
	const timeout = Boolean(error) && /timeout|tempo esgotado|connection terminated/i.test(String(error?.message || error));
	if (context) {
		context.poolWaitCount = (context.poolWaitCount || 0) + 1;
		context.poolWaitTotalMs = (context.poolWaitTotalMs || 0) + Math.max(0, Number(waitMs) || 0);
		context.poolWaitMaxMs = Math.max(context.poolWaitMaxMs || 0, Number(waitMs) || 0);
		context.poolTimeouts = (context.poolTimeouts || 0) + (timeout ? 1 : 0);
		context.longTransactions = (context.longTransactions || 0) + (Number(transactionMs) >= 2000 ? 1 : 0);
	}
	recordOperation({
		kind: "database",
		name: "postgresql",
		stage: transactionMs ? "rls_transaction" : "pool_wait",
		durationMs: transactionMs || waitMs,
		success: !error,
		timeout,
	});
}

async function observeOperation(definition, callback) {
	if (!OBSERVABILITY_ENABLED) return callback();
	const parent = asyncLocal.getStore();
	const context = parent || {
		queryCount: 0, queryErrors: 0, queryTotalMs: 0, queryDurationMaxMs: 0,
		poolWaitCount: 0, poolWaitTotalMs: 0, poolWaitMaxMs: 0,
		poolTimeouts: 0, longTransactions: 0,
	};
	const before = {
		queryCount: context.queryCount || 0,
		queryErrors: context.queryErrors || 0,
		queryTotalMs: context.queryTotalMs || 0,
	};
	const startedNs = process.hrtime.bigint();
	const execute = async () => {
		try {
			const result = await callback();
			const summary = typeof definition.summarize === "function" ? definition.summarize(result) || {} : {};
			recordOperation({
				...definition,
				...summary,
				durationMs: elapsedMs(startedNs),
				success: true,
				queryCount: (context.queryCount || 0) - before.queryCount,
				queryErrors: (context.queryErrors || 0) - before.queryErrors,
				queryTotalMs: (context.queryTotalMs || 0) - before.queryTotalMs,
			});
			return result;
		} catch (error) {
			recordOperation({
				...definition,
				durationMs: elapsedMs(startedNs),
				success: false,
				timeout: /timeout|tempo esgotado|aborted/i.test(String(error?.message || error)),
				queryCount: (context.queryCount || 0) - before.queryCount,
				queryErrors: (context.queryErrors || 0) - before.queryErrors,
				queryTotalMs: (context.queryTotalMs || 0) - before.queryTotalMs,
			});
			throw error;
		}
	};
	return parent ? execute() : asyncLocal.run(context, execute);
}

function numberValue(value) {
	return Number(value || 0);
}

function approximatePercentile(row = {}, percentile = 0.95) {
	const requests = numberValue(row.requests ?? row.total_requests);
	if (!requests) return 0;
	const threshold = Math.max(1, Math.ceil(requests * Math.min(1, Math.max(0, percentile))));
	let accumulated = 0;
	for (let index = 0; index < LATENCY_COLUMNS.length; index += 1) {
		accumulated += numberValue(row[LATENCY_COLUMNS[index]]);
		if (accumulated >= threshold) {
			const bucketLimit = LATENCY_BUCKETS[index];
			const observedMaximum = Math.round(numberValue(row.duration_max_ms));
			if (!bucketLimit) return observedMaximum;
			return observedMaximum > 0
				? Math.min(bucketLimit, observedMaximum)
				: bucketLimit;
		}
	}
	return Math.round(numberValue(row.duration_max_ms));
}

function approximateP95(row = {}) {
	return approximatePercentile(row, 0.95);
}

function approximateP95Range(row = {}) {
	const requests = numberValue(row.requests ?? row.total_requests);
	if (!requests) return { lower: 0, upper: 0 };
	const threshold = Math.max(1, Math.ceil(requests * 0.95));
	let accumulated = 0;
	for (let index = 0; index < LATENCY_COLUMNS.length; index += 1) {
		accumulated += numberValue(row[LATENCY_COLUMNS[index]]);
		if (accumulated < threshold) continue;
		const previousLimit = index > 0 ? LATENCY_BUCKETS[index - 1] : 0;
		const bucketLimit = LATENCY_BUCKETS[index];
		const observedMaximum = Math.max(0, Math.ceil(numberValue(row.duration_max_ms)));
		return {
			lower: previousLimit ? previousLimit + 1 : 0,
			upper: bucketLimit
				? Math.min(bucketLimit, observedMaximum || bucketLimit)
				: observedMaximum,
		};
	}
	const maximum = Math.max(0, Math.ceil(numberValue(row.duration_max_ms)));
	return { lower: LATENCY_BUCKETS.at(-1) + 1, upper: maximum };
}

function mapAggregateRow(row = {}, requestsField = "requests") {
	const requests = numberValue(row[requestsField]);
	const p95Range = approximateP95Range({ ...row, requests });
	return {
		...row,
		[requestsField]: requests,
		errors_4xx: numberValue(row.errors_4xx),
		errors_5xx: numberValue(row.errors_5xx),
		avg_ms: requests
			? Math.round((numberValue(row.duration_total_ms) / requests) * 100) / 100
			: 0,
		p95_ms: approximateP95({ ...row, requests }),
		p50_ms: approximatePercentile({ ...row, requests }, 0.5),
		p99_ms: approximatePercentile({ ...row, requests }, 0.99),
		p95_lower_bound_ms: p95Range.lower,
		p95_upper_bound_ms: p95Range.upper,
		max_ms: Math.round(numberValue(row.duration_max_ms) * 100) / 100,
	};
}

async function getRequestSummary({ hours = 1 } = {}) {
	await flushMetrics();
	const result = await metricsQuery(
		`
      select
        method,
        route,
        count(*)::integer as total_requests,
        round(avg(duration_ms)::numeric, 2)::float as avg_ms,
        round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 2)::float as p95_ms,
        round(max(duration_ms)::numeric, 2)::float as max_ms,
        round(avg(query_total_ms)::numeric, 2)::float as avg_query_ms,
        round(max(query_total_ms)::numeric, 2)::float as max_query_ms,
        round(avg(query_count)::numeric, 2)::float as avg_query_count,
        count(*) filter (where status_code >= 500)::integer as errors_5xx
      from metrics_requests
      where created_at >= now() - ($1::numeric * interval '1 hour')
      group by method, route
      order by p95_ms desc, total_requests desc
      limit 200
    `,
		[Number(hours) || 1],
	);
	return result.rows;
}

async function getQuerySummary({ hours = 1 } = {}) {
	await flushMetrics();
	const result = await metricsQuery(
		`
      select
        coalesce(method, '-') as method,
        coalesce(route, '-') as route,
        query_fingerprint,
        min(query_text) as sample_query,
        count(*)::integer as calls,
        round(sum(duration_ms)::numeric, 2)::float as total_ms,
        round(avg(duration_ms)::numeric, 2)::float as avg_ms,
        round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 2)::float as p95_ms,
        round(max(duration_ms)::numeric, 2)::float as max_ms,
        count(*) filter (where error is not null and error <> '')::integer as errors
      from metrics_queries
      where created_at >= now() - ($1::numeric * interval '1 hour')
      group by method, route, query_fingerprint
      order by total_ms desc
      limit 200
    `,
		[Number(hours) || 1],
	);
	return result.rows;
}

async function getMaintenanceMetrics({ hours = 24 } = {}) {
	await flushMetrics();
	const safeHours = Math.min(24 * 30, Math.max(1, Number(hours) || 24));
	const aggregateColumns = LATENCY_COLUMNS.map(
		(column) => `coalesce(sum(${column}),0)::bigint ${column}`,
	).join(",");
	const [totalsResult, timelineResult, routesResult] = await Promise.all([
		metricsQuery(
			`select coalesce(sum(requests),0)::bigint total_requests,
			 coalesce(sum(case when route=any($2::text[]) then 0 else errors_4xx end),0)::bigint errors_4xx,
			 coalesce(sum(case when route=any($2::text[]) then errors_4xx else 0 end),0)::bigint expected_errors_4xx,
			 coalesce(sum(errors_5xx),0)::bigint errors_5xx,
			 coalesce(sum(duration_total_ms),0)::float duration_total_ms,
			 coalesce(max(duration_max_ms),0)::float duration_max_ms,
			 coalesce(sum(query_count),0)::bigint query_count,
			 coalesce(sum(query_errors),0)::bigint query_errors,
			 coalesce(sum(query_total_ms),0)::float query_total_ms,
			 coalesce(max(query_duration_max_ms),0)::float query_duration_max_ms,
			 coalesce(sum(response_bytes),0)::bigint response_bytes,
			 coalesce(sum(pool_wait_count),0)::bigint pool_wait_count,
			 coalesce(sum(pool_wait_total_ms),0)::float pool_wait_total_ms,
			 coalesce(max(pool_wait_max_ms),0)::float pool_wait_max_ms,
			 coalesce(sum(pool_timeouts),0)::bigint pool_timeouts,
			 coalesce(sum(long_transactions),0)::bigint long_transactions,
			 ${aggregateColumns}
			 from maintenance_route_metrics_hourly
			 where bucket_start>=now()-($1::numeric*interval '1 hour')
			   and not(route=any($3::text[]))`,
			[safeHours, EXPECTED_4XX_ROUTES, IGNORED_METRIC_ROUTES],
		),
		metricsQuery(
			`select bucket_start bucket,
			 coalesce(sum(requests),0)::bigint requests,
			 coalesce(sum(case when route=any($2::text[]) then 0 else errors_4xx end),0)::bigint errors_4xx,
			 coalesce(sum(case when route=any($2::text[]) then errors_4xx else 0 end),0)::bigint expected_errors_4xx,
			 coalesce(sum(errors_5xx),0)::bigint errors_5xx,
			 coalesce(sum(duration_total_ms),0)::float duration_total_ms,
			 coalesce(max(duration_max_ms),0)::float duration_max_ms,
			 coalesce(sum(response_bytes),0)::bigint response_bytes,
			 ${aggregateColumns}
			 from maintenance_route_metrics_hourly
			 where bucket_start>=now()-($1::numeric*interval '1 hour')
			   and not(route=any($3::text[]))
			 group by bucket_start order by bucket_start`,
			[safeHours, EXPECTED_4XX_ROUTES, IGNORED_METRIC_ROUTES],
		),
		metricsQuery(
			`select method,route,
			 coalesce(sum(requests),0)::bigint requests,
			 coalesce(sum(errors_4xx),0)::bigint errors_4xx,
			 coalesce(sum(errors_5xx),0)::bigint errors_5xx,
			 coalesce(sum(duration_total_ms),0)::float duration_total_ms,
			 coalesce(max(duration_max_ms),0)::float duration_max_ms,
			 coalesce(sum(response_bytes),0)::bigint response_bytes,
			 coalesce(max(last_error_code),'') last_error_code,
			 ${aggregateColumns}
			 from maintenance_route_metrics_hourly
			 where bucket_start>=now()-($1::numeric*interval '1 hour')
			   and not(route=any($2::text[]))
			 group by method,route`,
			[safeHours, IGNORED_METRIC_ROUTES],
		),
	]);
	const totals = mapAggregateRow(
		{ ...(totalsResult.rows[0] || {}), requests: totalsResult.rows[0]?.total_requests },
		"requests",
	);
	const queryCount = numberValue(totalsResult.rows[0]?.query_count);
	const topRoutes = routesResult.rows
		.map((row) => mapAggregateRow(row))
		.sort(
			(a, b) =>
				b.errors_5xx - a.errors_5xx ||
				b.requests - a.requests ||
				b.p95_ms - a.p95_ms,
		)
		.slice(0, 50);
	return {
		totals: {
			total_requests: totals.requests,
			errors_4xx: totals.errors_4xx,
			expected_errors_4xx: numberValue(
				totalsResult.rows[0]?.expected_errors_4xx,
			),
			errors_5xx: totals.errors_5xx,
			avg_ms: totals.avg_ms,
			p50_ms: totals.p50_ms,
			p95_ms: totals.p95_ms,
			p99_ms: totals.p99_ms,
			p95_lower_bound_ms: totals.p95_lower_bound_ms,
			p95_upper_bound_ms: totals.p95_upper_bound_ms,
			max_ms: totals.max_ms,
			requests_per_minute: Math.round((totals.requests / (safeHours * 60)) * 100) / 100,
			response_bytes: numberValue(totalsResult.rows[0]?.response_bytes),
		},
		timeline: timelineResult.rows.map((row) => mapAggregateRow(row)),
		topRoutes,
		queries: {
			total_queries: queryCount,
			errors: numberValue(totalsResult.rows[0]?.query_errors),
			avg_ms: queryCount
				? Math.round(
						(numberValue(totalsResult.rows[0]?.query_total_ms) / queryCount) *
							100,
					) / 100
				: 0,
			max_ms: numberValue(totalsResult.rows[0]?.query_duration_max_ms),
		},
		pool: {
			wait_count: numberValue(totalsResult.rows[0]?.pool_wait_count),
			wait_avg_ms: numberValue(totalsResult.rows[0]?.pool_wait_count)
				? Math.round((numberValue(totalsResult.rows[0]?.pool_wait_total_ms) / numberValue(totalsResult.rows[0]?.pool_wait_count)) * 100) / 100
				: 0,
			wait_max_ms: numberValue(totalsResult.rows[0]?.pool_wait_max_ms),
			timeouts: numberValue(totalsResult.rows[0]?.pool_timeouts),
			long_transactions: numberValue(totalsResult.rows[0]?.long_transactions),
		},
	};
}

async function getOperationMetrics({ hours = 24 } = {}) {
	if (!OBSERVABILITY_ENABLED) return { enabled: false, items: [] };
	await flushMetrics();
	const safeHours = Math.min(24 * 30, Math.max(1, Number(hours) || 24));
	const aggregateColumns = LATENCY_COLUMNS.map(
		(column) => `coalesce(sum(${column}),0)::bigint ${column}`,
	).join(",");
	const result = await metricsQuery(
		`select kind,name,stage,coalesce(sum(calls),0)::bigint calls,
		 coalesce(sum(successes),0)::bigint successes,coalesce(sum(failures),0)::bigint failures,
		 coalesce(sum(timeouts),0)::bigint timeouts,coalesce(sum(fallbacks),0)::bigint fallbacks,
		 coalesce(sum(duration_total_ms),0)::float duration_total_ms,
		 coalesce(max(duration_max_ms),0)::float duration_max_ms,
		 coalesce(sum(query_count),0)::bigint query_count,
		 coalesce(sum(query_errors),0)::bigint query_errors,
		 coalesce(sum(query_total_ms),0)::float query_total_ms,
		 coalesce(sum(processed),0)::bigint processed,
		 coalesce(sum(updated),0)::bigint updated,
		 coalesce(sum(ignored),0)::bigint ignored,
		 ${aggregateColumns}
		 from maintenance_operation_metrics_hourly
		 where bucket_start>=now()-($1::numeric*interval '1 hour')
		 group by kind,name,stage order by failures desc,duration_total_ms desc limit 200`,
		[safeHours],
	);
	return {
		enabled: true,
		items: result.rows.map((row) => {
			const aggregate = mapAggregateRow({ ...row, requests: row.calls });
			return {
				...row,
				calls: numberValue(row.calls), successes: numberValue(row.successes),
				failures: numberValue(row.failures), timeouts: numberValue(row.timeouts),
				fallbacks: numberValue(row.fallbacks), processed: numberValue(row.processed),
				updated: numberValue(row.updated), ignored: numberValue(row.ignored),
				avg_ms: aggregate.avg_ms, p50_ms: aggregate.p50_ms,
				p95_ms: aggregate.p95_ms, p99_ms: aggregate.p99_ms, max_ms: aggregate.max_ms,
				query_count: numberValue(row.query_count), query_errors: numberValue(row.query_errors),
			};
		}),
	};
}

async function resetMetrics() {
	const tables = ["maintenance_route_metrics_hourly"];
	if (OBSERVABILITY_ENABLED) tables.push("maintenance_operation_metrics_hourly");
	if (METRICS_ENABLED) tables.push("metrics_queries", "metrics_requests");
	await metricsQuery(`truncate table ${tables.join(", ")} restart identity`);
	requestBuffer.splice(0, requestBuffer.length);
	queryBuffer.splice(0, queryBuffer.length);
	aggregateBuffer = new Map();
	operationBuffer = new Map();
	return { ok: true, resetAt: nowIso() };
}

function rowsToCsv(rows = []) {
	if (!rows.length) return "";
	const headers = Object.keys(rows[0]);
	const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
	return [
		headers.join(","),
		...rows.map((row) =>
			headers.map((header) => escape(row[header])).join(","),
		),
	].join("\n");
}

async function metricsController(req, res, next) {
	try {
		const hours = Number(req.query.hours || 1);
		const format = String(req.query.format || "json").toLowerCase();
		const requests = await getRequestSummary({ hours });
		const queries = await getQuerySummary({ hours });

		if (format === "csv") {
			res
				.type("text/csv")
				.send(
					[
						"# requests",
						rowsToCsv(requests),
						"",
						"# queries",
						rowsToCsv(queries),
					].join("\n"),
				);
			return;
		}

		res.json({
			ok: true,
			generatedAt: nowIso(),
			windowHours: hours,
			requests,
			queries,
		});
	} catch (error) {
		next(error);
	}
}

async function resetMetricsController(_req, res, next) {
	try {
		res.json(await resetMetrics());
	} catch (error) {
		next(error);
	}
}

module.exports = {
	__testing: {
		LATENCY_COLUMNS,
		approximatePercentile,
		approximateP95,
		approximateP95Range,
		hourBucket,
		latencyBucketIndex,
		mapAggregateRow,
		normalizeQuery,
		normalizePath,
		queryErrorLabel,
		limitQueryCardinality,
		recordAggregateRequest,
		getAggregateBuffer() {
			return [...aggregateBuffer.values()];
		},
		resetAggregateBuffer() {
			aggregateBuffer = new Map();
		},
		resetQueryCardinality() {
			queryCardinalityBucket = "";
			queryCardinality = new Set();
		},
	},
	flushMetrics,
	getMaintenanceMetrics,
	getOperationMetrics,
	initMetrics,
	metricsController,
	metricsMiddleware,
	observeOperation,
	recordOperation,
	resetMetrics,
	resetMetricsController,
};
