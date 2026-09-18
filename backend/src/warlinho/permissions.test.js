const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.NODE_ENV = "test";
const queries = [];
require.cache[require.resolve("../db")] = { exports: { query: async (sql, params) => {
	queries.push({ sql, params });
	return { rows: [] };
} } };
const { buildAvailableTools, findTool } = require("./tools");
const { absenceReadTypes } = require("../auth/readPermissions");
const user = (permissions, extra = {}) => ({ id: "test", regional_id: "regional-a", permissions, ...extra });

test("unauthenticated users receive no tools; a role without grants sees only holidays", () => {
	assert.deepEqual(buildAvailableTools(null), []);
	assert.deepEqual(buildAvailableTools(user([])).map(t => t.name), ["consultarFeriados"]);
});
test("view/manage and administrator grants authorize the expected tools", () => {
	for (const grant of ["rot.tickets.view", "rot.tickets.manage"]) {
		assert.deepEqual(buildAvailableTools(user([grant])).map(t => t.name), ["consultarChamados", "consultarFeriados"]);
	}
	assert.equal(buildAvailableTools(user(["*"])).length, 6);
	assert.equal(buildAvailableTools(user([], { role_id: "site_admin" })).length, 6);
});
test("direct tool execution is denied before any database query", async () => {
	queries.length = 0;
	await assert.rejects(findTool("consultarChamados").handler({ rotUser: user([]) }, {}), { status: 403 });
	assert.equal(queries.length, 0);
});
test("absence types and regional scope are enforced together in SQL", async () => {
	const reader = user(["rot.vacations.view"]);
	assert.deepEqual(absenceReadTypes(reader), ["ferias"]);
	assert.deepEqual(absenceReadTypes(user(["rot.timeoff.approve"])), ["folga"]);
	queries.length = 0;
	await findTool("consultarAusencias").handler({ rotUser: reader }, {});
	assert.match(queries[0].sql, /a.regional_id = \$1/);
	assert.match(queries[0].sql, /a.type = any\(\$2::text\[\]\)/);
	assert.deepEqual(queries[0].params, ["regional-a", ["ferias"]]);
});
test("all protected list routes reject a role without grants", () => {
	for (const resource of ["tickets", "shifts", "activities", "absences", "ranking"]) {
		const router = require(`../${resource}/routes`);
		const route = router.stack.find(layer => layer.route?.path === "/" && layer.route.methods.get).route;
		let status;
		let passed = false;
		const response = { status(code) { status = code; return this; }, json() {} };
		route.stack[0].handle({ rotUser: user([]) }, response, () => { passed = true; });
		assert.equal(status, 403, resource);
		assert.equal(passed, false, resource);
	}
});
