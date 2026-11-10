const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../db");
const db = { query: async () => ({ rows: [] }) };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const service = require("./mapsV2Service");

test("reconciliation uses explicit map coordinates when source orders also expose latitude", async (t) => {
	const originalQuery = db.query;
	t.after(() => {
		db.query = originalQuery;
	});

	db.query = async (sql) => {
		if (sql.includes("from maps_order_locations) as geocoded")) {
			return { rows: [{ geocoded: 1, geocode_pending: 0, requests_pending: 0 }] };
		}
		if (sql.includes("from hubsoft_sync_runs")) {
			return { rows: [{ lastOrderSync: "2026-11-09T23:00:00.000Z" }] };
		}
		if (sql.includes("with source as")) {
			assert.match(sql, /location\.latitude as map_latitude/i);
			assert.match(sql, /location\.longitude as map_longitude/i);
			assert.match(sql, /map_latitude between -34 and 6/i);
			assert.doesNotMatch(sql, /where latitude between -34 and 6/i);
			return {
				rows: [{
					sourceRows: 1,
					sourceOrders: 1,
					typeExcluded: 0,
					statusExcluded: 0,
					eligibleTotal: 1,
					geolocated: 1,
					locationPending: 0,
					sourceCoordinates: 1,
					geocodedCoordinates: 0,
					geocodePending: 0,
					geocodeNotFound: 0,
					geocodeFailed: 0,
				}],
			};
		}
		throw new Error(`Unexpected query: ${sql}`);
	};

	const result = await service.getHealth();
	assert.equal(result.ok, true);
	assert.equal(result.reconciliation.available, true);
	assert.equal(result.reconciliation.geolocated, 1);
});

test("retry recognizes an order already assigned to the requested technician", () => {
	assert.equal(
		service.__testables.requestAlreadyEffected(
			{ status: "EFFECTUATION_FAILED", tecnico: "ANA ANDRADE | FABIO TELECOM" },
			{ technicianHubsoftName: "ANA ANDRADE | FABIO TELECOM" },
		),
		true,
	);
	assert.equal(
		service.__testables.requestAlreadyEffected(
			{ status: "EFFECTUATION_FAILED", tecnico: "FILA" },
			{ technicianHubsoftName: "ANA ANDRADE | FABIO TELECOM" },
		),
		false,
	);
});
