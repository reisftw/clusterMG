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

test("divides November into four contiguous periods without losing 01/11", () => {
	assert.deepEqual(service.getFourWeekMonthRange("2026-11-02"), {
		week: 1,
		start: "2026-11-01",
		end: "2026-11-08",
	});
	assert.deepEqual(service.getFourWeekMonthRange("2026-11-24"), {
		week: 4,
		start: "2026-11-24",
		end: "2026-11-30",
	});
});

test("divides a 31-day month into balanced periods covering every day", () => {
	assert.deepEqual(service.getFourWeekMonthRange("2026-10-08"), {
		week: 1,
		start: "2026-10-01",
		end: "2026-10-08",
	});
	assert.deepEqual(service.getFourWeekMonthRange("2026-10-09"), {
		week: 2,
		start: "2026-10-09",
		end: "2026-10-16",
	});
	assert.deepEqual(service.getFourWeekMonthRange("2026-10-31"), {
		week: 4,
		start: "2026-10-25",
		end: "2026-10-31",
	});
});

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

test("consolida chamadas simultaneas e reutiliza o resumo operacional por 15 segundos", async () => {
	calls = [];
	const [first, concurrent] = await Promise.all([
		service.getOperationalSummary({ date: "2026-11-03" }),
		service.getOperationalSummary({ date: "2026-11-03" }),
	]);
	const queryCount = calls.length;

	assert.deepEqual(concurrent, first);
	assert.ok(queryCount > 0);
	assert.deepEqual(
		await service.getOperationalSummary({ date: "2026-11-03" }),
		first,
	);
	assert.equal(calls.length, queryCount);
});
