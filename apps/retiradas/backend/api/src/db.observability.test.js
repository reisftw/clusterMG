const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

process.env.PGPASSWORD ||= "test";

function loadDbWithClient(client) {
	const originalConnect = Pool.prototype.connect;
	Pool.prototype.connect = async () => client;
	delete require.cache[require.resolve("./db")];
	const db = require("./db");
	return {
		db,
		restore() {
			Pool.prototype.connect = originalConnect;
			delete require.cache[require.resolve("./db")];
		},
	};
}

test("rawQuery mede espera, registra a consulta e libera a conexao", async () => {
	const events = [];
	let releases = 0;
	global.__retiradasMetricsRecordPool = (event) => events.push(["pool", event]);
	global.__retiradasMetricsRecordQuery = (event) => events.push(["query", event]);
	const fixture = loadDbWithClient({
		query: async () => ({ rows: [{ ok: true }] }),
		release: () => {
			releases += 1;
		},
	});
	try {
		const result = await fixture.db.rawQuery("select 1");
		assert.deepEqual(result.rows, [{ ok: true }]);
		assert.equal(releases, 1);
		assert.equal(events.filter(([kind]) => kind === "pool").length, 1);
		assert.equal(events.filter(([kind]) => kind === "query").length, 1);
	} finally {
		fixture.restore();
		delete global.__retiradasMetricsRecordPool;
		delete global.__retiradasMetricsRecordQuery;
	}
});

test("flush interno ignora a propria telemetria sem suspender outras requisicoes", async () => {
	const events = [];
	global.__retiradasMetricsRecordPool = (event) => events.push(["pool", event]);
	global.__retiradasMetricsRecordQuery = (event) => events.push(["query", event]);
	const fixture = loadDbWithClient({
		query: async () => ({ rows: [] }),
		release: () => {},
	});
	try {
		await fixture.db.rawQuery("insert into maintenance_route_metrics_hourly values ($1)", [1], {
			skipMetrics: true,
		});
		assert.deepEqual(events, []);
	} finally {
		fixture.restore();
		delete global.__retiradasMetricsRecordPool;
		delete global.__retiradasMetricsRecordQuery;
	}
});
