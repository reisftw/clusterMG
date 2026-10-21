const assert = require("node:assert/strict");
const test = require("node:test");

const {
	getMigrationVersion,
	getPendingMigrations,
} = require("./run-sql-migrations");

test("identifica migrations aplicadas pelo numero da versao", () => {
	const files = [
		"013_documentos_agentes_midia.sql",
		"013_roles_permissions.sql",
		"067_hubsoft_sync_profiles.sql",
		"067_totp_mfa.sql",
		"079_tecnico_sem_mfa.sql",
	];

	assert.deepEqual(
		getPendingMigrations(files, new Set(["013", "067"])),
		["079_tecnico_sem_mfa.sql"],
	);
});

test("mantem todos os arquivos de uma versao ainda nao aplicada", () => {
	const files = [
		"013_documentos_agentes_midia.sql",
		"013_roles_permissions.sql",
	];

	assert.deepEqual(getPendingMigrations(files, new Set()), files);
	assert.equal(getMigrationVersion(files[0]), "013");
	assert.equal(getMigrationVersion(files[1]), "013");
});
