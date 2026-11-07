const assert = require("node:assert/strict");
const test = require("node:test");
process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
const { normalizeDateRange } = require("./movimentacoesRepository");

test("normalizes a range crossing month boundaries in Sao Paulo", () => {
	const range = normalizeDateRange({
		dataInicio: "2026-10-28",
		dataFim: "2026-11-03",
	});
	assert.equal(range.dataInicio, "2026-10-28T03:00:00.000Z");
	assert.equal(range.dataFim, "2026-11-04T02:59:59.999Z");
});

test("rejects inverted movement ranges", () => {
	assert.throws(
		() => normalizeDateRange({ dataInicio: "2026-11-03", dataFim: "2026-10-28" }),
		/data inicial/i,
	);
});
