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
			u.avatar_url,
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

router.patch("/:id", async (req, res) => {
	const id = String(req.params.id || "");
	const roleId = req.body?.role_id ? String(req.body.role_id) : null;
	const status = req.body?.status ? String(req.body.status) : null;
	const mfaEnabled =
		req.body?.mfa_enabled === undefined ? null : Boolean(req.body.mfa_enabled);

	if (!id) {
		res.status(400).json({ ok: false, error: "Usuário inválido." });
		return;
	}

	if (roleId) {
		const role = await db.query("select id from finan_roles where id = $1", [roleId]);
		if (!role.rows.length) {
			res.status(400).json({ ok: false, error: "Perfil do Finan não encontrado." });
			return;
		}
	}

	if (status && !["ativo", "inativo"].includes(status)) {
		res.status(400).json({ ok: false, error: "Status inválido." });
		return;
	}

	const { rows } = await db.query(
		`update finan_users
		set
			role_id = coalesce($2, role_id),
			status = coalesce($3, status),
			mfa_enabled = coalesce($4, mfa_enabled),
			updated_at = now()
		where id = $1
		returning
			id,
			name,
			email,
			role_id,
			status,
			mfa_enabled,
			avatar_url,
			source_system,
			source_role,
			source_permissions,
			created_at,
			updated_at`,
		[id, roleId, status, mfaEnabled],
	);
	if (!rows.length) {
		res.status(404).json({ ok: false, error: "Usuário não encontrado." });
		return;
	}
	res.json({ ok: true, user: rows[0] });
});

router.get("/roles", async (_req, res) => {
	const { rows } = await db.query(
		`select id, name, description, permissions, is_admin, system_role, active
		from finan_roles
		order by is_admin desc, active desc, name`,
	);
	res.json({ ok: true, roles: rows });
});

router.post("/roles", async (req, res) => {
	const id = String(req.body?.id || req.body?.name || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	const name = String(req.body?.name || "").trim();
	const description = String(req.body?.description || "").trim();
	const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
	const isAdmin = Boolean(req.body?.is_admin);

	if (!id || !name) {
		res.status(400).json({ ok: false, error: "Informe o nome do cargo/perfil." });
		return;
	}

	const { rows } = await db.query(
		`insert into finan_roles (
			id, name, description, permissions, is_admin, system_role, active
		)
		values ($1, $2, $3, $4::jsonb, $5, false, true)
		on conflict (id) do update set
			name = excluded.name,
			description = excluded.description,
			permissions = excluded.permissions,
			is_admin = excluded.is_admin,
			active = true,
			updated_at = now()
		returning id, name, description, permissions, is_admin, system_role, active`,
		[id, name, description || null, JSON.stringify(permissions), isAdmin],
	);
	res.json({ ok: true, role: rows[0] });
});

router.patch("/roles/:id", async (req, res) => {
	const id = String(req.params.id || "").trim();
	const name = req.body?.name === undefined ? null : String(req.body.name || "").trim();
	const description =
		req.body?.description === undefined
			? null
			: String(req.body.description || "").trim();
	const permissions =
		req.body?.permissions === undefined
			? null
			: Array.isArray(req.body.permissions)
				? req.body.permissions
				: [];
	const isAdmin =
		req.body?.is_admin === undefined ? null : Boolean(req.body.is_admin);
	const active = req.body?.active === undefined ? null : Boolean(req.body.active);

	const { rows } = await db.query(
		`update finan_roles
		set
			name = coalesce($2, name),
			description = coalesce($3, description),
			permissions = coalesce($4::jsonb, permissions),
			is_admin = coalesce($5, is_admin),
			active = coalesce($6, active),
			updated_at = now()
		where id = $1
		returning id, name, description, permissions, is_admin, system_role, active`,
		[
			id,
			name || null,
			description,
			permissions ? JSON.stringify(permissions) : null,
			isAdmin,
			active,
		],
	);
	if (!rows.length) {
		res.status(404).json({ ok: false, error: "Cargo/perfil não encontrado." });
		return;
	}
	res.json({ ok: true, role: rows[0] });
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
