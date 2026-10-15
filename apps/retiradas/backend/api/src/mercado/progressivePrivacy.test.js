const test = require("node:test");
const assert = require("node:assert/strict");
const { canAccessOs, currentGroup, visibleRows } = require("./progressivePrivacy");

test("only the unlocked current group is visible to a provider", () => {
	const rows = [
		{ id: "a", status: "IN_PROGRESS", grupo_liberacao: 1, liberada_em: new Date() },
		{ id: "b", status: "IN_PROGRESS", grupo_liberacao: 1, liberada_em: new Date() },
		{ id: "c", status: "IN_PROGRESS", grupo_liberacao: 1, liberada_em: new Date() },
		{ id: "d", status: "IN_PROGRESS", grupo_liberacao: 2, liberada_em: null },
	];
	assert.equal(currentGroup(rows), 1);
	assert.deepEqual(visibleRows(rows).map((row) => row.id), ["a", "b", "c"]);
});

test("blocked or foreign OS cannot be accessed directly", () => {
	assert.equal(canAccessOs({ accepted_by_empresa_id: "empresa-a", liberada_em: null }, "empresa-a"), false);
	assert.equal(canAccessOs({ accepted_by_empresa_id: "empresa-a", liberada_em: new Date() }, "empresa-b"), false);
	assert.equal(canAccessOs({ accepted_by_empresa_id: "empresa-a", liberada_em: new Date() }, "empresa-a"), true);
});

test("a completed previous group is not re-sent when the next group opens", () => {
	const rows = [
		{ id: "old", status: "SUBMITTED", grupo_liberacao: 1, liberada_em: new Date() },
		{ id: "next", status: "IN_PROGRESS", grupo_liberacao: 2, liberada_em: new Date() },
		{ id: "blocked", status: "IN_PROGRESS", grupo_liberacao: 3, liberada_em: null },
	];
	assert.equal(currentGroup(rows), 2);
	assert.deepEqual(visibleRows(rows).map((row) => row.id), ["next"]);
});
