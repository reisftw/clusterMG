const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../db");
const notificationsPath = require.resolve("../notificationsService");
const servicePath = require.resolve("./tentativasCentralService");
const calls = [];

require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		query: async (sql, params) => {
			calls.push({ sql, params });
			if (calls.length === 1) {
				return {
					rows: [{
						assigned: "10",
						worked: "4",
						attempts: "5",
						effective_contacts: "3",
						scheduled: "2",
						pending_callbacks: "1",
						overdue_callbacks: "0",
						recovered: "1",
					}],
				};
			}
			return {
				rows: [{ day: "2026-10-01", attempts: 2, effective_contacts: 1 }],
			};
		},
	},
};
require.cache[notificationsPath] = {
	id: notificationsPath,
	filename: notificationsPath,
	loaded: true,
	exports: { createNotification: async () => ({}) },
};
delete require.cache[servicePath];
const service = require("./tentativasCentralService");

test("produtividade usa apenas os tres parametros referenciados na serie diaria", async () => {
	calls.length = 0;
	const result = await service.getMyProductivity(
		{ startDate: "2026-10-01", endDate: "2026-10-30" },
		{ uid: "tech-1", email: "tecnico@example.com" },
	);

	assert.equal(calls.length, 2);
	assert.deepEqual(calls[1].params, ["tech-1", "2026-10-01", "2026-10-30"]);
	assert.match(calls[1].sql, /generate_series\(\$2::date,\$3::date/);
	assert.equal(result.summary.assigned, 10);
	assert.equal(result.summary.progress, 40);
});
