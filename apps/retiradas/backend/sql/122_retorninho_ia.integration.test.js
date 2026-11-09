const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");
const { applyMigration } = require("../scripts/run-sql-migrations");
const { LIST_PROTOCOLS_SQL, LIST_QUEUE_SQL } = require("../api/src/retorninho/retorninhoSql");

const DATABASE_URL = process.env.OBSERVABILITY_TEST_DATABASE_URL;

test("Retorninho IA migration is additive, paused and idempotent", { skip: !DATABASE_URL }, async () => {
	const client = new Client({ connectionString: DATABASE_URL });
	const schema = `retorninho_${Date.now()}_${Math.random().toString(16).slice(2)}`;
	await client.connect();
	try {
		await client.query(`create schema ${schema}`);
		await client.query(`set search_path to ${schema}, public`);
		await client.query(`create table app_users (uid text primary key, display_name text)`);
		await client.query(`create table app_roles (id text primary key)`);
		await client.query(`insert into app_roles (id) values ('admin')`);
		await client.query(`create table app_permissions (
			id text primary key, section_id text, section_label text, feature_id text,
			feature_label text, action text, sort_order integer, legacy_permission text,
			description text, active boolean, deprecated boolean
		)`);
		await client.query(`create table app_role_permissions (
			role_id text references app_roles(id), permission text references app_permissions(id),
			primary key (role_id, permission)
		)`);
		await client.query(`create table schema_migrations (
			version text primary key, file_name text not null, applied_at timestamptz default now()
		)`);
		await client.query(`create function touch_updated_at() returns trigger language plpgsql as $$
		begin new.updated_at = now(); return new; end $$`);

		await applyMigration(client, "122_retorninho_ia.sql");
		await applyMigration(client, "122_retorninho_ia.sql");

		const config = await client.query("select enabled, automatic_replies, instance_name, meta_phone_number_id from retorninho_config");
		assert.deepEqual(config.rows[0], {
			enabled: false,
			automatic_replies: false,
			instance_name: "retorninho-ia",
			meta_phone_number_id: null,
		});
		const sequence = await client.query("select to_regclass('retorninho_protocol_number_seq') is not null present");
		assert.equal(sequence.rows[0].present, true);
		const permissions = await client.query("select count(*)::int total from app_role_permissions where role_id='admin'");
		assert.equal(permissions.rows[0].total, 4);

		const protocols = await client.query(LIST_PROTOCOLS_SQL, ["", "SELF_ASSIGNMENT", "", "%%", 25, 0]);
		assert.deepEqual(protocols.rows, []);
		const queue = await client.query(LIST_QUEUE_SQL, [6, "", 25, 0]);
		assert.deepEqual(queue.rows, []);
	} finally {
		await client.query(`drop schema if exists ${schema} cascade`);
		await client.end();
	}
});
