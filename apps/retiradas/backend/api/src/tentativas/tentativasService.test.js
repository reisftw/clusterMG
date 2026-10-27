const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../db");
const auditPath = require.resolve("../auditLog");
const centralPath = require.resolve("./tentativasCentralService");
const alertsPath = require.resolve("./tentativasAlertsService");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
require.cache[auditPath] = { id: auditPath, filename: auditPath, loaded: true, exports: async () => ({}) };
require.cache[centralPath] = { id: centralPath, filename: centralPath, loaded: true, exports: {} };
require.cache[alertsPath] = { id: alertsPath, filename: alertsPath, loaded: true, exports: {} };

const { buildNeighborhoodDistributionPlan } = require("./tentativasService").__testables;

const technicians = [
	{ user_id: "tech-a", user_email: "a@example.com", user_name: "Ana" },
	{ user_id: "tech-b", user_email: "b@example.com", user_name: "Bruno" },
];

test("distribui cada bairro inteiro para somente um tecnico", () => {
	const plan = buildNeighborhoodDistributionPlan(
		[
			{ group_key: "centro", bairro: "Centro", opportunities: 12 },
			{ group_key: "industrial", bairro: "Industrial", opportunities: 8 },
			{ group_key: "novo horizonte", bairro: "Novo Horizonte", opportunities: 5 },
		],
		technicians,
	);

	assert.equal(plan.length, 3);
	assert.equal(new Set(plan.map((item) => item.group_key)).size, 3);
	assert.equal(plan.filter((item) => item.group_key === "centro").length, 1);
	assert.deepEqual(new Set(plan.map((item) => item.user_id)), new Set(["tech-a", "tech-b"]));
});

test("mantem bairro ja trabalhado com o tecnico que realizou o contato", () => {
	const plan = buildNeighborhoodDistributionPlan(
		[
			{ group_key: "tres poderes", bairro: "Tres Poderes", opportunities: 20 },
			{ group_key: "centro", bairro: "Centro", opportunities: 18 },
		],
		technicians,
		[{ group_key: "tres poderes", technician_user_id: "tech-b" }],
	);

	const preserved = plan.find((item) => item.group_key === "tres poderes");
	assert.equal(preserved.user_id, "tech-b");
	assert.equal(preserved.preserved, true);
});

test("transferencia manual prevalece sobre o historico de contato", () => {
	const plan = buildNeighborhoodDistributionPlan(
		[{ group_key: "centro", bairro: "Centro", opportunities: 18 }],
		technicians,
		[
			{ group_key: "centro", technician_user_id: "tech-a", preference_source: "CONTACT_HISTORY" },
			{ group_key: "centro", technician_user_id: "tech-b", preference_source: "MANUAL" },
		],
	);

	assert.equal(plan[0].user_id, "tech-b");
	assert.equal(plan[0].assignment_source, "MANUAL");
});

test("ao restar um tecnico ele recebe todos os bairros da cidade", () => {
	const plan = buildNeighborhoodDistributionPlan(
		[
			{ group_key: "centro", bairro: "Centro", opportunities: 12 },
			{ group_key: "icarai", bairro: "Icarai", opportunities: 9 },
		],
		[technicians[0]],
	);

	assert.equal(plan.length, 2);
	assert.ok(plan.every((item) => item.user_id === "tech-a"));
	assert.equal(plan.reduce((total, item) => total + item.opportunities, 0), 21);
});
