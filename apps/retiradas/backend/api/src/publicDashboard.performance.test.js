const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const db = require("./db");
const { buildCompactDashboardDomain } = require("./publicDashboard");
const { combineMetaRecords } = require("./operationalImports");

test("compact dashboard projects nested sources in SQL and stays below 500 KB", async (t) => {
	const originalQuery = db.query;
	const queries = [];
	db.query = async (sql, params) => {
		queries.push({ sql, params });
		if (sql.includes("group by collection_path")) {
			return { rows: [
				{ collection: "feriados", total: 12 },
				{ collection: "ferias", total: 11 },
				{ collection: "colaboradores", total: 15 },
			] };
		}
		if (sql.includes("collection_path = 'dashboard'")) {
			return { rows: [{
				documentId: "Novembro",
				data: {
					month: "Novembro",
					totalOS: 100,
					onnet: { totalOS: 20 },
					onnetSempre: { totalOS: 120 },
				},
			}] };
		}
		if (sql.includes("where path = $1")) {
			return { rows: [{ data: { lastUpdate: "2026-11-14T00:00:00.000Z", baseConfig: {}, forcaTarefa: {} } }] };
		}
		throw new Error(`Unexpected query: ${sql}`);
	};
	t.after(() => { db.query = originalQuery; });

	const result = await buildCompactDashboardDomain();
	const serialized = JSON.stringify(result);

	assert.equal(result.compact, true);
	assert.equal(result.dashboard.data.colaboradoresTotal, 15);
	assert.equal(result.painel.retiradas.result.Novembro.onnetSempre.totalOS, 120);
	assert.ok(Buffer.byteLength(serialized) < 500_000);
	assert.match(queries[0].sql, /data - 'onnet' - 'onnetSempre'/);
	assert.match(queries[0].sql, /\(data->'onnetSempre'\) - 'onnet' - 'onnetSempre'/);
});

test("combined meta does not retain recursively nested source records", () => {
	const sempre = {
		month: "Novembro",
		meta: 100,
		rawDays: [{ dia: 1, totalDia: 10 }],
		onnet: { totalOS: 3 },
		onnetSempre: { onnetSempre: { onnetSempre: { totalOS: 999 } } },
	};
	const onnet = { meta: 50, rawDays: [{ dia: 1, totalDia: 5 }] };
	const combined = combineMetaRecords(sempre, onnet, "Novembro", 2026);

	assert.equal(combined.totalOS, 15);
	assert.equal(combined.meta, 150);
	assert.equal(combined.onnet, undefined);
	assert.equal(combined.onnetSempre, undefined);
});
