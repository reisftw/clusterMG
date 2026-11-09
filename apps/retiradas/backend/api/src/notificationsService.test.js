const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("./db");
const realtimePath = require.resolve("./realtime");
const pushPath = require.resolve("./pushNotificationsService");
let updateCall = null;
let notificationRows = [];

require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		query: async (sql, params) => {
			if (/^select /i.test(sql.trim())) {
				const requestedIds = /document_id = any/.test(sql) ? params[1] : null;
				return { rows: requestedIds ? notificationRows.filter((row) => requestedIds.includes(row.document_id)) : notificationRows };
			}
			updateCall = { sql, params };
			return { rowCount: 1, rows: [] };
		},
	},
};
require.cache[realtimePath] = { id: realtimePath, filename: realtimePath, loaded: true, exports: { broadcastRealtime: () => {} } };
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { recordRead: async () => {} } };

const service = require("./notificationsService");

test("mark all updates only notifications visible to the authenticated user", async () => {
	updateCall = null;
	notificationRows = [
		{ document_id: "visible", path: "system_notifications/visible", data: { targets: { users: ["u1"] } } },
		{ document_id: "hidden", path: "system_notifications/hidden", data: { targets: { users: ["u2"] } } },
		{ document_id: "arrived-later", path: "system_notifications/arrived-later", data: { targets: { users: ["u1"] } } },
	];
	const existingRows = notificationRows;
	let selected = false;
	const originalQuery = require.cache[dbPath].exports.query;
	require.cache[dbPath].exports.query = async (sql, params) => {
		if (/^select /i.test(sql.trim()) && !selected) {
			selected = true;
			return { rows: existingRows.slice(0, 2) };
		}
		return originalQuery(sql, params);
	};
	const result = await service.markNotificationsRead({
		user: { uid: "u1", role: "tecnico" },
		all: true,
	});

	assert.equal(result.updated, 1);
	assert.match(updateCall.sql, /document_id = any/);
	assert.deepEqual(updateCall.params[1], ["visible"]);
	require.cache[dbPath].exports.query = originalQuery;
});

test("validates explicit ids against user, role, regional and company targets", async () => {
	updateCall = null;
	notificationRows = [
		{ document_id: "by-user", data: { targets: { users: ["u1"] } } },
		{ document_id: "by-role", data: { targets: { roles: ["tecnico"] } } },
		{ document_id: "by-regional", data: { targets: { regionais: ["Betim"] } } },
		{ document_id: "by-company", data: { targets: { empresas: ["empresa-1"] } } },
		{ document_id: "other-user", data: { targets: { users: ["u2"] } } },
		{ document_id: "other-role", data: { targets: { roles: ["admin"] } } },
	];
	const ids = notificationRows.map((row) => row.document_id);
	await service.markNotificationsRead({
		user: { uid: "u1", role: "tecnico", regional: "Betim", empresaId: "empresa-1" },
		ids,
	});

	assert.deepEqual(updateCall.params[1], ["by-user", "by-role", "by-regional", "by-company"]);
});

test("validates alternative user and profile formats without trusting requested ids", async () => {
	updateCall = null;
	notificationRows = [
		{ document_id: "by-email", data: { targets: { users: ["tecnico@example.com"] } } },
		{ document_id: "by-profile-regional", data: { targets: { regionais: ["Betím"] } } },
		{ document_id: "by-profile-company", data: { targets: { empresas: ["empresa-2"] } } },
		{ document_id: "forged-id", data: { targets: { users: ["outro@example.com"] } } },
	];
	await service.markNotificationsRead({
		user: {
			email: "tecnico@example.com",
			role: "tecnico",
			profile: { regional: "Betim", empresa_id: "empresa-2" },
		},
		ids: notificationRows.map((row) => row.document_id),
	});

	assert.deepEqual(updateCall.params[1], [
		"by-email",
		"by-profile-regional",
		"by-profile-company",
	]);
});
