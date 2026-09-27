const { test } = require("node:test");
const assert = require("node:assert/strict");
const dbPath = require.resolve("./db");
let runStatus = "FAILED";
let calls = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
	query: async (sql) => { calls.push(sql); return { rows: [{ id: "run", profile: "MAPA", status: runStatus }] }; },
	connect: async () => { throw new Error("Invalid sync must never write a diff"); },
} };
const service = require("./mapSyncUpdatesService");

for (const status of ["FAILED", "FAILED_AUTH", "INCOMPLETE", "SCHEMA_CHANGED", "SUSPICIOUS", "VALID_EMPTY_RESULT"]) {
	test(`${status} preserves the valid snapshot without recording removals`, async () => {
		runStatus = status;
		calls = [];
		const result = await service.processCompletedMapRun({ runId: "run", previousSnapshot: { records: Array.from({ length: 850 }, (_, id) => ({ id: String(id) })) }, currentRecords: [] });
		assert.equal(result, null);
		assert.equal(calls.length, 1);
		assert.match(calls[0], /^select /);
	});
}
