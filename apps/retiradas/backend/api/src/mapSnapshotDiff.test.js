const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSnapshotDiff } = require("./mapSnapshotDiff");

test("detects added and removed orders without inferring execution", () => {
	const diff = buildSnapshotDiff(["1001", "1002", "1003"].map((id) => ({ id })), ["1002", "1003", "1004"].map((id) => ({ id })));
	assert.deepEqual(diff.added.map((item) => item.id), ["1004"]);
	assert.deepEqual(diff.removed.map((item) => item.id), ["1001"]);
	assert.equal(diff.updated.length, 0);
	assert.equal(diff.removed[0].executed, undefined);
});

test("repeated snapshots are idempotent and duplicate rows are counted once", () => {
	const records = [{ id: "1", status: "Pendente" }, { id: "1", status: "Pendente" }];
	const diff = buildSnapshotDiff(records, records);
	assert.equal(diff.current.length, 1);
	assert.equal(diff.added.length + diff.removed.length + diff.updated.length, 0);
});

test("tracks changes to operational fields", () => {
	const diff = buildSnapshotDiff([{ id: "1", city: "Betim" }], [{ id: "1", city: "Contagem" }]);
	assert.equal(diff.updated.length, 1);
	assert.equal(diff.added.length + diff.removed.length, 0);
});
