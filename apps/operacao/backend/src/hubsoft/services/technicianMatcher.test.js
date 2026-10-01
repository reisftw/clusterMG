const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveHubsoftTechnician } = require("./technicianMatcher");

function fakeClient(rowsByQuery) {
	return {
		async query(sql, params) {
			if (sql.includes("hubsoft_user_id")) return { rows: rowsByQuery.byId || [] };
			if (sql.includes("lower(coalesce(email")) return { rows: rowsByQuery.byEmail || [] };
			return { rows: rowsByQuery.byName || [] };
		},
	};
}

test("resolveHubsoftTechnician prioriza hubsoft_user_id", async () => {
	const result = await resolveHubsoftTechnician(fakeClient({
		byId: [{ id: "tech-1", empresa_id: "emp-1", status: "matched", reason: "hubsoft_user_id" }],
	}), { id: 10, nome: "Teste" });
	assert.equal(result.status, "matched");
	assert.equal(result.reason, "hubsoft_user_id");
});

test("resolveHubsoftTechnician resolve por nome unico e detecta ambiguo", async () => {
	const unique = await resolveHubsoftTechnician(fakeClient({
		byName: [{ id: "tech-1", empresa_id: null, nome: "José Silva" }],
	}), { nome: "Jose Silva" });
	assert.equal(unique.status, "matched_by_name");

	const ambiguous = await resolveHubsoftTechnician(fakeClient({
		byName: [
			{ id: "tech-1", empresa_id: null, nome: "José Silva" },
			{ id: "tech-2", empresa_id: null, nome: "Jose Silva" },
		],
	}), { nome: "Jose Silva" });
	assert.equal(ambiguous.status, "ambiguous");
});
