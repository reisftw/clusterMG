const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");

const router = express.Router();

router.use(requireFinanPermission("finan.usuarios.manage"));

router.get("/", async (_req, res) => {
	const { rows } = await db.query(
		`select
			u.id,
			u.name,
			u.email,
			u.role_id,
			u.status,
			u.mfa_enabled,
			u.source_system,
			u.source_role,
			u.source_permissions,
			u.created_at,
			u.updated_at
		from finan_users u
		order by u.name, u.email`,
	);
	res.json({ ok: true, users: rows });
});

router.get("/roles", async (_req, res) => {
	const { rows } = await db.query(
		`select id, name, description, permissions, is_admin
		from finan_roles
		order by is_admin desc, name`,
	);
	res.json({ ok: true, roles: rows });
});

router.get("/migration-snapshots", async (_req, res) => {
	const { rows } = await db.query(
		`select source_table, count(*)::integer as rows, max(imported_at) as imported_at
		from finan_migration_snapshots
		group by source_table
		order by source_table`,
	);
	res.json({ ok: true, snapshots: rows });
});

module.exports = router;
