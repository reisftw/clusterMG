const assert = require("node:assert/strict");
const test = require("node:test");
const { localDateKey, localDateTimeForHubsoft, parseHubsoftDate } = require("./dates");

test("parseHubsoftDate interpreta datas sem fuso como horario local do HubSoft", () => {
	assert.equal(parseHubsoftDate("2026-09-01 10:00:00"), "2026-09-01T13:00:00.000Z");
	assert.equal(parseHubsoftDate("2026-09-01T10:00:00"), "2026-09-01T13:00:00.000Z");
	assert.equal(parseHubsoftDate("01/09/2026 10:00:00"), "2026-09-01T13:00:00.000Z");
});

test("parseHubsoftDate preserva datas com fuso explicito", () => {
	assert.equal(parseHubsoftDate("2026-09-01T10:00:00-03:00"), "2026-09-01T13:00:00.000Z");
	assert.equal(parseHubsoftDate("2026-09-01T13:00:00Z"), "2026-09-01T13:00:00.000Z");
});

test("localDateKey agrupa pelo dia local de Sao Paulo", () => {
	assert.equal(localDateKey("2026-09-02T02:30:00.000Z"), "2026-09-01");
	assert.equal(localDateTimeForHubsoft("2026-09-01", false), "2026-09-01T00:00:00-03:00");
	assert.equal(localDateTimeForHubsoft("2026-09-01", true), "2026-09-01T23:59:59-03:00");
});
