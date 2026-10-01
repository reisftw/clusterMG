const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSourceHash } = require("./hash");

test("buildSourceHash e deterministico e sensivel a campos relevantes", () => {
	const left = buildSourceHash({ b: 2, a: { y: 2, x: 1 } });
	const right = buildSourceHash({ a: { x: 1, y: 2 }, b: 2 });
	const changed = buildSourceHash({ a: { x: 1, y: 3 }, b: 2 });
	assert.equal(left, right);
	assert.notEqual(left, changed);
});
