const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { validate } = require("../dtos/middleware");
const { IdParamDTO, UserPatchDTO } = require("../dtos/userDto");
const { RoleCreateDTO, RoleUpdateDTO } = require("../dtos/roleDto");

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

router.patch(
	"/:id",
	validate({ params: IdParamDTO, body: { schema: UserPatchDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const { id } = req.validated.params;
			const { role_id: roleId = null, status = null, mfa_enabled: mfaEnabled = null } =
				req.validated.body;

			if (roleId) {
				const role = await db.query("select id from finan_roles where id = $1", [roleId]);
				if (!role.rows.length) {
					res.status(400).json({ ok: false, error: "Perfil do Finan não encontrado." });
					return;
				}
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
		} catch (error) {
			next(error);
		}
	},
);

router.get("/roles", async (_req, res) => {
	const { rows } = await db.query(
		`select id, name, description, permissions, is_admin, system_role, active, hierarchy_level
		from finan_roles
		order by is_admin desc, active desc, name`,
	);
	res.json({ ok: true, roles: rows });
});

router.post("/roles", validate({ body: RoleCreateDTO }), async (req, res, next) => {
	try {
		const dto = req.validated.body;
		const id = String(dto.id || dto.name)
			.trim()
			.toLowerCase()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");
		if (!id) {
			res.status(400).json({ ok: false, error: "Informe o nome do cargo/perfil." });
			return;
		}

		// `is_admin: true` so pode ser concedido por quem ja e admin — mass
		// assignment de forma (o DTO) nao cobre isso, e regra de negocio: sem
		// essa checagem, qualquer ator com `finan.usuarios.manage` poderia
		// criar um cargo com acesso total mesmo sem ser admin.
		if (dto.is_admin && !req.finanUser?.is_admin) {
			res.status(403).json({
				ok: false,
				error: "Somente um administrador pode criar um cargo com acesso total (is_admin).",
			});
			return;
		}

		const { rows } = await db.query(
			`insert into finan_roles (
				id, name, description, permissions, is_admin, system_role, active, hierarchy_level
			)
			values ($1, $2, $3, $4::jsonb, $5, false, true, $6)
			on conflict (id) do update set
				name = excluded.name,
				description = excluded.description,
				permissions = excluded.permissions,
				is_admin = excluded.is_admin,
				hierarchy_level = excluded.hierarchy_level,
				active = true,
				updated_at = now()
			returning id, name, description, permissions, is_admin, system_role, active, hierarchy_level`,
			[
				id,
				dto.name,
				dto.description || null,
				JSON.stringify(dto.permissions || []),
				Boolean(dto.is_admin),
				dto.hierarchy_level ?? 999,
			],
		);
		res.json({ ok: true, role: rows[0] });
	} catch (error) {
		next(error);
	}
});

router.patch(
	"/roles/:id",
	validate({ params: IdParamDTO, body: { schema: RoleUpdateDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const { id } = req.validated.params;
			const dto = req.validated.body;

			if (dto.is_admin && !req.finanUser?.is_admin) {
				res.status(403).json({
					ok: false,
					error: "Somente um administrador pode conceder acesso total (is_admin) a um cargo.",
				});
				return;
			}

			const { rows } = await db.query(
				`update finan_roles
				set
					name = coalesce($2, name),
					description = coalesce($3, description),
					permissions = coalesce($4::jsonb, permissions),
					is_admin = coalesce($5, is_admin),
					active = coalesce($6, active),
					hierarchy_level = coalesce($7, hierarchy_level),
					updated_at = now()
				where id = $1
				returning id, name, description, permissions, is_admin, system_role, active, hierarchy_level`,
				[
					id,
					dto.name ?? null,
					dto.description ?? null,
					dto.permissions ? JSON.stringify(dto.permissions) : null,
					dto.is_admin ?? null,
					dto.active ?? null,
					dto.hierarchy_level ?? null,
				],
			);
			if (!rows.length) {
				res.status(404).json({ ok: false, error: "Cargo/perfil não encontrado." });
				return;
			}
			res.json({ ok: true, role: rows[0] });
		} catch (error) {
			next(error);
		}
	},
);

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
