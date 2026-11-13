const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../db");
const auditPath = require.resolve("../auditLog");
const centralPath = require.resolve("./tentativasCentralService");
const alertsPath = require.resolve("./tentativasAlertsService");
const notificationsPath = require.resolve("../notificationsService");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
require.cache[auditPath] = {
	id: auditPath,
	filename: auditPath,
	loaded: true,
	exports: { recordAuditLog: async () => ({}) },
};
require.cache[centralPath] = { id: centralPath, filename: centralPath, loaded: true, exports: {} };
require.cache[alertsPath] = { id: alertsPath, filename: alertsPath, loaded: true, exports: {} };
const sentNotifications = [];
require.cache[notificationsPath] = {
	id: notificationsPath,
	filename: notificationsPath,
	loaded: true,
	exports: { createNotification: async (payload) => { sentNotifications.push(payload); return payload; } },
};

const tentativasService = require("./tentativasService");
const { buildNeighborhoodDistributionPlan, normalizeNeighborhoodClaimHours } = tentativasService.__testables;

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

test("pre-agrega oportunidades antes de cruzar a distribuicao por bairro", async () => {
	const db = require("../db");
	db.query = async (sql, params) => {
		assert.match(sql, /opportunity_counts as materialized/i);
		assert.match(sql, /left join opportunity_counts o/i);
		assert.deepEqual(params, ["^55[0-9]{10,11}$"]);
		return {
			rows: [{
				technician_user_id: "tech-a",
				technician_name: "Ana",
				cidade: "Betim",
				neighborhoods: 2,
				opportunities: 20,
				worked: 5,
				pending: 15,
			}],
		};
	};

	const result = await tentativasService.listDistribution();
	assert.deepEqual(result.items[0], {
		technician_user_id: "tech-a",
		technician_name: "Ana",
		cidade: "Betim",
		neighborhoods: 2,
		opportunities: 20,
		worked: 5,
		pending: 15,
		coverage: 25,
	});
});

test("limita a solicitação de bairro entre uma e vinte e quatro horas", () => {
	assert.equal(normalizeNeighborhoodClaimHours(undefined), 24);
	assert.equal(normalizeNeighborhoodClaimHours(0), 1);
	assert.equal(normalizeNeighborhoodClaimHours(6.2), 7);
	assert.equal(normalizeNeighborhoodClaimHours(48), 24);
});

test("registra a solicitação do bairro de forma transacional", async () => {
	const db = require("../db");
	const statements = [];
	db.query = async (sql, params) => {
		assert.match(sql, /tentativas_technician_cities/i);
		assert.deepEqual(params, ["betim", "tech-a", "a@example.com"]);
		return { rowCount: 1, rows: [{ ok: 1 }] };
	};
	db.connect = async () => ({
		query: async (sql, params = []) => {
			statements.push({ sql, params });
			if (/select \* from tentativas_neighborhood_claims/i.test(sql)) {
				return { rowCount: 0, rows: [] };
			}
			if (/insert into tentativas_neighborhood_claims/i.test(sql)) {
				return {
					rowCount: 1,
					rows: [{ technician_name: "Ana", expires_at: "2026-11-14T12:00:00.000Z" }],
				};
			}
			return { rowCount: 0, rows: [] };
		},
		release() {},
	});

	const result = await tentativasService.requestNeighborhood(
		{ cidade: "Betim", bairroGrupo: "Centro", hours: 48 },
		{ uid: "tech-a", email: "a@example.com", nome: "Ana", role: "tecnico" },
	);

	assert.equal(result.hours, 24);
	assert.equal(result.groupKey, "centro");
	assert.ok(statements.some(({ sql }) => /pg_advisory_xact_lock/i.test(sql)));
	assert.ok(statements.some(({ sql, params }) =>
		/insert into tentativas_neighborhood_claims/i.test(sql) && params.at(-1) === 24,
	));
	assert.equal(statements.at(-1).sql, "commit");
});

test("encaminha ao BackOffice quando o bairro pertence a outro técnico", async () => {
	const db = require("../db");
	sentNotifications.length = 0;
	db.query = async () => ({ rowCount: 1, rows: [{ ok: 1 }] });
	db.connect = async () => ({
		query: async (sql) => {
			if (/select \* from tentativas_neighborhood_claims/i.test(sql)) {
				return { rows: [{ technician_user_id: "tech-b", technician_name: "Bruno" }] };
			}
			if (/insert into tentativas_neighborhood_claim_requests/i.test(sql)) {
				return { rows: [{ id: "request-1", current_owner_name: "Bruno" }] };
			}
			return { rows: [] };
		},
		release() {},
	});

	const result = await tentativasService.requestNeighborhood(
		{ cidade: "Betim", bairroGrupo: "Centro", bairroNome: "Centro", hours: 8 },
		{ uid: "tech-a", email: "a@example.com", nome: "Ana", role: "tecnico" },
	);

	assert.equal(result.status, "PENDING_APPROVAL");
	assert.equal(result.currentOwnerName, "Bruno");
	assert.deepEqual(sentNotifications[0].targets.roles, ["admin", "backoffice", "backoffice_retirada"]);
});

test("aprovação transfere a reserva somente para técnico ainda associado à cidade", async () => {
	const db = require("../db");
	const statements = [];
	sentNotifications.length = 0;
	db.connect = async () => ({
		query: async (sql, params = []) => {
			statements.push({ sql, params });
			if (/select \* from tentativas_neighborhood_claim_requests/i.test(sql)) {
				return { rowCount: 1, rows: [{
					id: "request-1", status: "PENDING", cidade: "Betim",
					cidade_normalizada: "betim", bairro_grupo: "centro", bairro_nome: "Centro",
					requester_user_id: "tech-a", requester_email: "a@example.com",
					requester_name: "Ana", requested_hours: 8,
				}] };
			}
			if (/from tentativas_technician_cities c/i.test(sql)) return { rowCount: 1, rows: [{ ok: 1 }] };
			if (/update tentativas_neighborhood_claim_requests/i.test(sql)) {
				return { rowCount: 1, rows: [{
					id: "request-1", status: "APPROVED", cidade: "Betim",
					bairro_grupo: "centro", bairro_nome: "Centro", requester_user_id: "tech-a",
					requester_name: "Ana", requested_hours: 8,
				}] };
			}
			return { rowCount: 1, rows: [] };
		},
		release() {},
	});

	const result = await tentativasService.resolveNeighborhoodClaimRequest(
		"request-1",
		{},
		{ uid: "admin-1", nome: "Gestor", role: "admin" },
		"approve",
	);

	assert.equal(result.item.status, "APPROVED");
	assert.ok(statements.some(({ sql, params }) =>
		/insert into tentativas_neighborhood_claims/i.test(sql) && params.at(-1) === 8,
	));
	assert.deepEqual(sentNotifications[0].targets.users, ["tech-a"]);
});
