const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PGPASSWORD ||= "test";

const { __testing } = require("./metrics");

test("normaliza identificadores dinamicos sem multiplicar rotas", () => {
	assert.equal(
		__testing.normalizePath("/api/users/123456/profile?full=true"),
		"/api/users/:id/profile",
	);
	assert.equal(
		__testing.normalizePath("/api/jobs/74808d73-7120-40e4-9b69-b8a9adc1865c"),
		"/api/jobs/:id",
	);
	assert.equal(
		__testing.normalizePath(
			"/api/tentativas/tent_74808d73-7120-40e4-9b69-b8a9adc1865c/iniciar",
		),
		"/api/tentativas/tent_:id/iniciar",
	);
});

test("calcula p95 aproximado a partir do histograma agregado", () => {
	const row = {
		requests: 100,
		duration_le_50: 80,
		duration_le_100: 10,
		duration_le_250: 5,
		duration_le_500: 5,
		duration_max_ms: 440,
	};
	assert.equal(__testing.approximateP95(row), 250);
});

test("p95 aproximado nunca ultrapassa a maior latencia observada", () => {
	assert.equal(
		__testing.approximateP95({
			requests: 7,
			duration_le_50: 3,
			duration_le_100: 2,
			duration_le_1000: 1,
			duration_le_2500: 1,
			duration_max_ms: 1111.72,
		}),
		1112,
	);
});

test("explicita a faixa do histograma usada no p95", () => {
	assert.deepEqual(
		__testing.approximateP95Range({
			requests: 100,
			duration_le_50: 80,
			duration_le_100: 10,
			duration_le_1000: 5,
			duration_gt_5000: 5,
			duration_max_ms: 8200,
		}),
		{ lower: 501, upper: 1000 },
	);
});

test("resume contagem e latencia sem amostras individuais", () => {
	const row = __testing.mapAggregateRow({
		requests: "4",
		errors_4xx: "1",
		errors_5xx: "1",
		duration_total_ms: 400,
		duration_max_ms: 220,
		duration_le_50: 1,
		duration_le_100: 2,
		duration_le_250: 1,
	});
	assert.equal(row.requests, 4);
	assert.equal(row.avg_ms, 100);
	assert.equal(row.p95_ms, 220);
	assert.equal(row.p95_lower_bound_ms, 101);
	assert.equal(row.p95_upper_bound_ms, 220);
	assert.equal(row.errors_4xx, 1);
	assert.equal(row.errors_5xx, 1);
});
