const assert = require("node:assert/strict");
const test = require("node:test");

const {
	applyMigration,
	acquireMigrationLock,
	getMigrationVersion,
	getPendingMigrations,
	isNoTransactionMigration,
} = require("./run-sql-migrations");

test("falha imediatamente quando outro runner possui a trava global", async () => {
	const client = {
		query: async () => ({ rows: [{ acquired: false }] }),
	};

	await assert.rejects(
		() => acquireMigrationLock(client),
		/Outra execucao de migrations ja esta em andamento/,
	);
});

test("identifica migrations aplicadas pelo nome completo", () => {
	const files = [
		"013_documentos_agentes_midia.sql",
		"013_roles_permissions.sql",
		"067_hubsoft_sync_profiles.sql",
		"067_totp_mfa.sql",
		"079_tecnico_sem_mfa.sql",
	];

	assert.deepEqual(
		getPendingMigrations(
			files,
			new Set([
				"013_documentos_agentes_midia.sql",
				"067_hubsoft_sync_profiles.sql",
			]),
		),
		[
			"013_roles_permissions.sql",
			"067_totp_mfa.sql",
			"079_tecnico_sem_mfa.sql",
		],
	);
});

test("mantem migrations de mesmo numero como arquivos independentes", () => {
	const files = [
		"013_documentos_agentes_midia.sql",
		"013_roles_permissions.sql",
	];

	assert.deepEqual(getPendingMigrations(files, new Set()), files);
	assert.equal(getMigrationVersion(files[0]), "013");
	assert.equal(getMigrationVersion(files[1]), "013");
});

test("aplica timeouts locais dentro da migration transacional", async () => {
	const calls = [];
	const client = {
		query: async (sql, params) => {
			calls.push({ sql, params });
			return { rows: [] };
		},
	};

	await applyMigration(client, "013_documentos_agentes_midia.sql");

	assert.deepEqual(
		calls.slice(0, 3).map((call) => call.sql),
		[
			"begin",
			"set local lock_timeout = '5s'",
			"set local statement_timeout = '15min'",
		],
	);
	assert.equal(calls.at(-1).sql, "commit");
});

test("identifica migration que precisa rodar fora de transacao", () => {
	assert.equal(
		isNoTransactionMigration(
			"-- migration:no-transaction\ncreate index concurrently example_idx on example(id);",
		),
		true,
	);
	assert.equal(isNoTransactionMigration("create table example(id text);"), false);
});

test("aplica indice concorrente sem abrir transacao e restaura timeouts", async () => {
	const calls = [];
	const client = {
		query: async (sql, params) => {
			calls.push({ sql, params });
			return { rows: [] };
		},
	};

	await applyMigration(client, "114_maps_geocode_jobs_address_hash_idx.sql");

	assert.equal(calls.some((call) => call.sql === "begin"), false);
	assert.equal(calls.some((call) => /create index concurrently/i.test(call.sql)), true);
	assert.equal(calls.at(-2).sql, "reset lock_timeout");
	assert.equal(calls.at(-1).sql, "reset statement_timeout");
});
