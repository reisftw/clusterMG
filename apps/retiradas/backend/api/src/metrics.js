const { AsyncLocalStorage } = require("node:async_hooks");
const crypto = require("node:crypto");
const db = require("./db");

const asyncLocal = new AsyncLocalStorage();

const METRICS_ENABLED =
	String(process.env.METRICS_ENABLED || "true").toLowerCase() !== "false";
const FLUSH_INTERVAL_MS = Number(process.env.METRICS_FLUSH_INTERVAL_MS || 5000);
const MAX_BUFFER_SIZE = Number(process.env.METRICS_MAX_BUFFER_SIZE || 200);
const MAX_QUERY_TEXT_LENGTH = Number(
	process.env.METRICS_MAX_QUERY_TEXT_LENGTH || 500,
);

let initialized = false;
let flushTimer = null;
let flushing = false;
const requestBuffer = [];
const queryBuffer = [];

function nowIso() {
	return new Date().toISOString();
}

function elapsedMs(startNs) {
	return Number(process.hrtime.bigint() - startNs) / 1e6;
}

function normalizePath(path = "") {
	return String(path || "")
		.split("?")[0]
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
	return path.startsWith("/api/admin/metrics");
}

function compactQueryText(query) {
	if (typeof query === "object" && query?.text) {
		return String(query.text);
	}
	return String(query || "");
}

function normalizeQuery(query) {
	return compactQueryText(query)
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_QUERY_TEXT_LENGTH);
}

function shouldIgnoreQuery(queryText = "") {
	const normalized = String(queryText || "").toLowerCase();
	return (
		normalized.includes("metrics_requests") ||
		normalized.includes("metrics_queries")
	);
}

function fingerprintQuery(queryText) {
	return crypto.createHash("sha1").update(queryText).digest("hex").slice(0, 16);
}

async function metricsQuery(text, params) {
	const queryFn = typeof db.rawQuery === "function" ? db.rawQuery : db.query;
	const previous = global.__retiradasMetricsSuspended === true;
	global.__retiradasMetricsSuspended = true;
	try {
		return await queryFn(text, params);
	} finally {
		global.__retiradasMetricsSuspended = previous;
	}
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
	await metricsQuery(`
    create table if not exists metrics_requests (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      method text not null,
      route text not null,
      status_code integer not null,
      duration_ms numeric(12,3) not null,
      query_count integer not null default 0,
      query_total_ms numeric(12,3) not null default 0,
      user_id text,
      request_id text
    )
  `);
	await metricsQuery(`
    create index if not exists idx_metrics_requests_created_route
    on metrics_requests (created_at desc, route, method)
  `);
	await metricsQuery(`
    create table if not exists metrics_queries (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      method text,
      route text,
      query_fingerprint text not null,
      query_text text not null,
      duration_ms numeric(12,3) not null,
      error text,
      request_id text
    )
  `);
	await metricsQuery(`
    create index if not exists idx_metrics_queries_created_route
    on metrics_queries (created_at desc, route, method)
  `);
	await metricsQuery(`
    create index if not exists idx_metrics_queries_fingerprint
    on metrics_queries (query_fingerprint, created_at desc)
  `);
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

async function flushMetrics() {
	if (!METRICS_ENABLED || flushing) return;
	if (!requestBuffer.length && !queryBuffer.length) return;
	flushing = true;
	const requests = requestBuffer.splice(0, requestBuffer.length);
	const queries = queryBuffer.splice(0, queryBuffer.length);
	try {
		await flushRequests(requests);
		await flushQueries(queries);
	} catch (error) {
		requestBuffer.unshift(...requests.slice(-MAX_BUFFER_SIZE));
		queryBuffer.unshift(...queries.slice(-MAX_BUFFER_SIZE));
		throw error;
	} finally {
		flushing = false;
	}
}

async function initMetrics() {
	if (!METRICS_ENABLED || initialized) return;
	initialized = true;
	await ensureTables();
	global.__retiradasMetricsRecordQuery = recordQuery;
	flushTimer = setInterval(() => {
		flushMetrics().catch((error) => {
			console.error("[metrics] Falha ao enviar metricas:", error);
		});
	}, FLUSH_INTERVAL_MS);
	flushTimer.unref?.();
}

function metricsMiddleware(req, res, next) {
	if (!METRICS_ENABLED || shouldIgnoreRequest(req)) {
		next();
		return;
	}

	const startedNs = process.hrtime.bigint();
	const context = {
		requestId: crypto.randomUUID(),
		method: req.method,
		route: normalizePath(req.originalUrl || req.url || req.path || "unknown"),
		queryCount: 0,
		queryTotalMs: 0,
	};

	asyncLocal.run(context, () => {
		res.on("finish", () => {
			context.route = getRouteLabel(req);
			pushWithLimit(requestBuffer, {
				method: context.method,
				route: context.route,
				statusCode: res.statusCode,
				durationMs: elapsedMs(startedNs),
				queryCount: context.queryCount,
				queryTotalMs: context.queryTotalMs,
				userId: req.user?.uid || req.user?.email || null,
				requestId: context.requestId,
			});
		});
		next();
	});
}

function recordQuery({ query, durationMs, error }) {
	if (!METRICS_ENABLED) return;
	const queryText = normalizeQuery(query);
	if (!queryText) return;
	if (shouldIgnoreQuery(queryText)) return;

	const context = asyncLocal.getStore();
	if (context) {
		context.queryCount += 1;
		context.queryTotalMs += durationMs;
	}

	pushWithLimit(queryBuffer, {
		method: context?.method || null,
		route: context?.route || null,
		queryFingerprint: fingerprintQuery(queryText),
		queryText,
		durationMs,
		error,
		requestId: context?.requestId || null,
	});
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

async function resetMetrics() {
	await metricsQuery(
		"truncate table metrics_queries, metrics_requests restart identity",
	);
	requestBuffer.splice(0, requestBuffer.length);
	queryBuffer.splice(0, queryBuffer.length);
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
	flushMetrics,
	initMetrics,
	metricsController,
	metricsMiddleware,
	resetMetrics,
	resetMetricsController,
};
