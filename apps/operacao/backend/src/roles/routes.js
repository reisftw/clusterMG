const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validateBody } = require("../security/bodyValidation");

// CRUD de cargos (rot_roles) — mesmo padrao de
// apps/finan/backend/src/settings/routes.js (createFinanRole/updateFinanRole):
// sem rota de delete (cargo em uso nunca deve sumir, so desativar via
// `active`), mesma regra de hierarquia ja aplicada em users/routes.js (so
// site_admin mexe em cargo de nivel >= o proprio).
const router = express.Router();
router.use(requireRotAuth);

function publicRole(row) {
	return {
		id: row.id,
		name: row.name,
		description: row.description || "",
		level: Number(row.level),
		isGlobal: Boolean(row.is_global),
		permissions: Array.isArray(row.permissions) ? row.permissions : [],
		systemRole: Boolean(row.system_role),
		active: row.active !== false,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const ROLE_SELECT = `
	select
		r.*,
		case
			when exists (select 1 from rot_role_permissions rp where rp.role_id = r.id)
				then (
					select coalesce(jsonb_agg(rp.permission_id order by rp.permission_id), '[]'::jsonb)
					from rot_role_permissions rp
					join rot_permissions p on p.id = rp.permission_id and p.active = true
					where rp.role_id = r.id
				)
			else coalesce(r.permissions, '[]'::jsonb)
		end as permissions
	from rot_roles r
`;

async function syncRolePermissions(client, roleId, permissions = [], actorId = null) {
	const uniquePermissions = [...new Set((Array.isArray(permissions) ? permissions : []).map(String).filter(Boolean))].sort();
	if (!uniquePermissions.length) {
		await client.query(`delete from rot_role_permissions where role_id = $1`, [roleId]);
		return uniquePermissions;
	}
	await client.query(
		`insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, description)
		select permission_id, 'legado', 'Legado', 'legacy', permission_id, 'system', 'Permissao criada por compatibilidade durante a transicao do RBAC.'
		from unnest($1::text[]) as permission_id
		where btrim(permission_id) <> ''
		on conflict (id) do nothing`,
		[uniquePermissions],
	);
	await client.query(`delete from rot_role_permissions where role_id = $1`, [roleId]);
	await client.query(
		`insert into rot_role_permissions (role_id, permission_id, created_by)
		select $1, permission_id, $3
		from unnest($2::text[]) as permission_id
		on conflict do nothing`,
		[roleId, uniquePermissions, actorId],
	);
	return uniquePermissions;
}

async function auditLog(req, { action, entity, entityId, before, after }) {
	await db.query(
		`insert into rot_audit_logs (user_id, user_name, action, entity, entity_id, before_data, after_data, ip_address, user_agent)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		[
			req.rotUser?.id || null,
			req.rotUser?.name || null,
			action,
			entity,
			entityId,
			before ? JSON.stringify(before) : null,
			after ? JSON.stringify(after) : null,
			String(req.ip || ""),
			String(req.get?.("user-agent") || "").slice(0, 500),
		],
	);
}

function slugify(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 60);
}

// So cargo global ve todos os cargos. Cargo regional (supervisor,
// lider, etc.) so enxerga cargos de nivel estritamente abaixo do
// proprio — nunca o proprio nivel nem acima (SEC: antes essa rota nao
// filtrava nada, qualquer um com rot.users.manage via TODOS os cargos,
// incluindo site_admin/coordinator).
router.get("/", requireRotPermission("rot.users.manage"), noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(`${ROLE_SELECT} order by r.level desc`);
		const visible = req.rotUser.is_global ? rows : rows.filter((row) => Number(row.level) < req.rotUser.role_level);
		res.json({ ok: true, items: visible.map(publicRole), total: visible.length });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.users.manage"), validateBody(["id", "name", "description", "level", "isGlobal", "permissions", "active"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const name = String(req.body?.name || "").trim();
		const description = String(req.body?.description || "").trim();
		const level = Number(req.body?.level);
		const isGlobal = Boolean(req.body?.isGlobal);
		const active = req.body?.active !== false;
		const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions.map(String) : [];

		if (!name || !Number.isFinite(level) || level < 0) {
			res.status(400).json({ ok: false, error: "Informe nome e um nível hierárquico válido." });
			return;
		}
		if (req.rotUser.role_id !== "site_admin" && level >= req.rotUser.role_level) {
			res.status(403).json({ ok: false, error: "Você não pode criar um cargo de nível igual ou superior ao seu." });
			return;
		}

		let id = slugify(req.body?.id || name);
		if (!id) id = randomId("role");
		const { rows: existing } = await db.query(`select id from rot_roles where id = $1`, [id]);
		if (existing[0]) id = `${id}_${randomId("", 4)}`.replace(/__+/g, "_");

		const client = await db.connect();
		try {
			await client.query("begin");
			await client.query(
				`insert into rot_roles (id, name, description, level, is_global, permissions, system_role, active)
				values ($1, $2, $3, $4, $5, $6::jsonb, false, $7)`,
				[id, name, description, level, isGlobal, JSON.stringify(permissions), active],
			);
			await syncRolePermissions(client, id, permissions, req.rotUser?.id || null);
			const { rows } = await client.query(`${ROLE_SELECT} where r.id = $1`, [id]);
			await client.query("commit");
			await auditLog(req, { action: "create", entity: "rot_roles", entityId: id, after: publicRole(rows[0]) });
			res.json({ ok: true, role: publicRole(rows[0]) });
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
	} catch (error) {
		if (error?.constraint === "rot_roles_pkey") {
			res.status(409).json({ ok: false, error: "Já existe um cargo com esse identificador." });
			return;
		}
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.users.manage"), validateBody(["name", "description", "level", "isGlobal", "permissions", "active"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const { rows: beforeRows } = await db.query(`${ROLE_SELECT} where r.id = $1`, [req.params.id]);
		const before = beforeRows[0];
		if (!before) {
			res.status(404).json({ ok: false, error: "Cargo não encontrado." });
			return;
		}

		const payload = req.body || {};
		const targetLevel = payload.level !== undefined ? Number(payload.level) : Number(before.level);
		if (!Number.isFinite(targetLevel) || targetLevel < 0) {
			res.status(400).json({ ok: false, error: "Nível hierárquico inválido." });
			return;
		}
		// So site_admin mexe em cargo de nivel igual/maior que o proprio, e so
		// site_admin pode elevar um cargo pra nivel igual/maior que o seu.
		if (
			req.rotUser.role_id !== "site_admin" &&
			(Number(before.level) >= req.rotUser.role_level || targetLevel >= req.rotUser.role_level)
		) {
			res.status(403).json({ ok: false, error: "Você não pode alterar esse cargo." });
			return;
		}

		const client = await db.connect();
		let rows;
		try {
			await client.query("begin");
			await client.query(
				`update rot_roles set
					name = coalesce($2, name),
					description = coalesce($3, description),
					level = $4,
					is_global = coalesce($5, is_global),
					permissions = coalesce($6::jsonb, permissions),
					active = coalesce($7, active),
					updated_at = now()
				where id = $1`,
				[
					req.params.id,
					payload.name || null,
					payload.description ?? null,
					targetLevel,
					payload.isGlobal ?? null,
					Array.isArray(payload.permissions) ? JSON.stringify(payload.permissions.map(String)) : null,
					payload.active ?? null,
				],
			);
			if (Array.isArray(payload.permissions)) {
				await syncRolePermissions(client, req.params.id, payload.permissions, req.rotUser?.id || null);
			}
			({ rows } = await client.query(`${ROLE_SELECT} where r.id = $1`, [req.params.id]));
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
		await auditLog(req, {
			action: "update",
			entity: "rot_roles",
			entityId: req.params.id,
			before: publicRole(before),
			after: publicRole(rows[0]),
		});
		res.json({ ok: true, role: publicRole(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.users.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`select * from rot_roles where id = $1`, [req.params.id]);
		const role = rows[0];
		if (!role) {
			res.status(404).json({ ok: false, error: "Cargo não encontrado." });
			return;
		}
		if (role.system_role) {
			res.status(400).json({ ok: false, error: "Cargos do sistema não podem ser excluídos — desative-o em vez disso." });
			return;
		}
		if (req.rotUser.role_id !== "site_admin" && Number(role.level) >= req.rotUser.role_level) {
			res.status(403).json({ ok: false, error: "Você não pode excluir esse cargo." });
			return;
		}
		const { rows: usersUsing } = await db.query(`select count(*)::int as total from rot_users where role_id = $1`, [req.params.id]);
		if (usersUsing[0]?.total > 0) {
			res.status(409).json({ ok: false, error: "Existem usuários com esse cargo. Reatribua-os antes de excluir." });
			return;
		}
		await db.query(`delete from rot_roles where id = $1`, [req.params.id]);
		await auditLog(req, { action: "delete", entity: "rot_roles", entityId: req.params.id, before: publicRole(role) });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
