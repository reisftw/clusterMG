// Roteiro Finan #27 (Fase 4A — Observabilidade): acumula em memória as
// métricas de cada requisição (latência, 4xx, 5xx) e persiste em buckets
// de ~1 minuto — 1 linha por minuto de tráfego real, não 1 linha por
// requisição (pesaria o Postgres). Chamado a partir do
// requestTimingLogger que já existe em app.js (mede toda requisição há
// tempo, só não persistia nada até agora).
//
// Aproximação aceita: o flush roda a cada 60s por um timer, não
// exatamente na virada do minuto — perto da borda, uma requisição pode
// cair no bucket "certo" com alguns segundos de folga pra mais ou menos.
// Pra um painel operacional interno isso é suficiente; não é dado de
// cobrança.
const db = require("../db");

const FLUSH_INTERVAL_MS = 60 * 1000;

function emptyAccumulator() {
	return { total: 0, err4xx: 0, err5xx: 0, latencySum: 0, latencyMax: 0 };
}

let accumulator = emptyAccumulator();
let flushTimer = null;

function recordRequest(durationMs, statusCode) {
	accumulator.total += 1;
	if (statusCode >= 500) accumulator.err5xx += 1;
	else if (statusCode >= 400) accumulator.err4xx += 1;
	accumulator.latencySum += Math.max(0, durationMs);
	if (durationMs > accumulator.latencyMax) accumulator.latencyMax = durationMs;
}

function currentMinuteBucket() {
	const now = new Date();
	now.setSeconds(0, 0);
	return now.toISOString();
}

async function flush() {
	const snapshot = accumulator;
	accumulator = emptyAccumulator();
	if (!snapshot.total) return;
	try {
		await db.query(
			`insert into finan_observabilidade_metricas
				(bucket_start, requests_total, requests_4xx, requests_5xx, latency_sum_ms, latency_max_ms)
			values ($1, $2, $3, $4, $5, $6)
			on conflict (bucket_start) do update set
				requests_total = finan_observabilidade_metricas.requests_total + excluded.requests_total,
				requests_4xx = finan_observabilidade_metricas.requests_4xx + excluded.requests_4xx,
				requests_5xx = finan_observabilidade_metricas.requests_5xx + excluded.requests_5xx,
				latency_sum_ms = finan_observabilidade_metricas.latency_sum_ms + excluded.latency_sum_ms,
				latency_max_ms = greatest(finan_observabilidade_metricas.latency_max_ms, excluded.latency_max_ms)`,
			[
				currentMinuteBucket(),
				snapshot.total,
				snapshot.err4xx,
				snapshot.err5xx,
				Math.round(snapshot.latencySum),
				Math.round(snapshot.latencyMax),
			],
		);
	} catch (error) {
		console.error("[finan-observabilidade] falha ao persistir metricas:", error?.message || error);
	}
}

// Chamado uma vez, no boot do servidor (ver app.js). unref() pra nao
// impedir o processo de encerrar em testes/scripts que sobem o app sem
// rodar pra sempre.
function startMetricsFlusher() {
	if (flushTimer) return;
	flushTimer = setInterval(() => {
		flush().catch(() => {});
	}, FLUSH_INTERVAL_MS);
	flushTimer.unref?.();
}

async function getTimeSeries({ hours = 24 } = {}) {
	const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
	const { rows } = await db.query(
		`select bucket_start, requests_total, requests_4xx, requests_5xx, latency_sum_ms, latency_max_ms
		from finan_observabilidade_metricas
		where bucket_start >= now() - ($1 || ' hours')::interval
		order by bucket_start asc`,
		[safeHours],
	);
	return rows.map((row) => ({
		bucketStart: row.bucket_start,
		requestsTotal: row.requests_total,
		requests4xx: row.requests_4xx,
		requests5xx: row.requests_5xx,
		latencyAvgMs: row.requests_total ? Math.round(row.latency_sum_ms / row.requests_total) : 0,
		latencyMaxMs: row.latency_max_ms,
	}));
}

async function getSummary({ hours = 24 } = {}) {
	const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
	const { rows } = await db.query(
		`select
			coalesce(sum(requests_total), 0) as requests_total,
			coalesce(sum(requests_4xx), 0) as requests_4xx,
			coalesce(sum(requests_5xx), 0) as requests_5xx,
			coalesce(sum(latency_sum_ms), 0) as latency_sum_ms,
			coalesce(max(latency_max_ms), 0) as latency_max_ms
		from finan_observabilidade_metricas
		where bucket_start >= now() - ($1 || ' hours')::interval`,
		[safeHours],
	);
	const row = rows[0] || {};
	const total = Number(row.requests_total || 0);
	return {
		requestsTotal: total,
		requests4xx: Number(row.requests_4xx || 0),
		requests5xx: Number(row.requests_5xx || 0),
		latencyAvgMs: total ? Math.round(Number(row.latency_sum_ms || 0) / total) : 0,
		latencyMaxMs: Number(row.latency_max_ms || 0),
		errorRatePct: total
			? Number((((Number(row.requests_4xx || 0) + Number(row.requests_5xx || 0)) / total) * 100).toFixed(2))
			: 0,
	};
}

module.exports = {
	recordRequest,
	startMetricsFlusher,
	flush,
	getTimeSeries,
	getSummary,
	// exportado so pra teste (evita depender de timer real)
	_forTest: { emptyAccumulator, resetForTest: () => { accumulator = emptyAccumulator(); } },
};
