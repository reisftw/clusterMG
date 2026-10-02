const assert = require("node:assert/strict");
const test = require("node:test");
const { parseCompanyNameFromTechnicianName, resolveHubsoftTechnician } = require("./technicianMatcher");

function fakeClient(rowsByQuery) {
	return {
		async query(sql, _params) {
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

test("resolveHubsoftTechnician nao consulta cadastro quando HubSoft envia FILA", async () => {
	const result = await resolveHubsoftTechnician(fakeClient({
		byName: [{ id: "tech-1", empresa_id: null, nome: "FILA" }],
	}), { nome: "FILA" });
	assert.equal(result.status, "not_found");
	assert.equal(result.reason, "unassigned");
});

test("parseCompanyNameFromTechnicianName extrai empresa mantendo nome do tecnico completo", () => {
	assert.equal(parseCompanyNameFromTechnicianName("GUSTAVO LEANDRO | JMD SERVIÇOS"), "JMD SERVIÇOS");
	assert.equal(parseCompanyNameFromTechnicianName("AK ENGENHARIA 1"), "AK ENGENHARIA");
	assert.equal(parseCompanyNameFromTechnicianName("AK ENGENHARIA 2"), "AK ENGENHARIA");
	assert.equal(parseCompanyNameFromTechnicianName("GUSTAVO LEANDRO"), "");
});

test("resolveHubsoftTechnician cria empresa e tecnico quando nome HubSoft contem empresa", async () => {
	const calls = [];
	const client = {
		async query(sql, params = []) {
			calls.push({ sql, params });
			if (sql.includes("from operacao_empresas")) return { rows: [] };
			if (sql.includes("insert into operacao_empresas")) return { rows: [{ id: "emp-1", nome: "JMD SERVIÇOS" }] };
			if (sql.includes("insert into operacao_tecnicos")) return { rows: [{ id: "tech-1", empresa_id: "emp-1", nome: "GUSTAVO LEANDRO | JMD SERVIÇOS" }] };
			if (sql.includes("hubsoft_user_id")) return { rows: [] };
			if (sql.includes("lower(coalesce(email")) return { rows: [] };
			if (sql.includes("from operacao_tecnicos") && !sql.includes("insert")) return { rows: [] };
			return { rows: [] };
		},
	};
	const result = await resolveHubsoftTechnician(client, { id: 99, nome: "GUSTAVO LEANDRO | JMD SERVIÇOS" });
	assert.equal(result.status, "matched");
	assert.equal(result.reason, "auto_created_from_hubsoft_name");
	assert.equal(result.nome, "GUSTAVO LEANDRO | JMD SERVIÇOS");
	assert.equal(result.empresa_id, "emp-1");
	assert.equal(calls.filter((call) => call.sql.includes("insert into operacao_empresas")).length, 1);
	assert.equal(calls.filter((call) => call.sql.includes("insert into operacao_tecnicos")).length, 1);
});
