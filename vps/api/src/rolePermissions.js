const db = require("./db");

const ADMIN_ROLE = "admin";

const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
	admin: ["*"],
	backoffice_retirada: [
		"view_dashboard",
		"view_diario",
		"view_acerto_estoque",
		"manage_acerto_estoque",
		"view_estoque_integrado",
		"view_equipamentos",
		"view_mapa",
		"view_metas",
		"view_cobrancas",
		"view_relatorios",
		"view_agenda",
		"view_agendamentos",
		"view_visitas",
		"view_duvidas",
		"view_retiradas",
		"view_entregas_tecnicos",
		"tecnicos.auditoria_bolsa.view",
		"tecnicos.auditoria_bolsa.manage",
		"view_logistica",
		"manage_logistica",
		"view_ferramentas",
		"view_regionais",
		"view_agentes",
		"request_ferias",
		"manage_colaboradores",
		"manage_metas",
		"manage_cobrancas",
		"manage_duvidas",
		"manage_retiradas",
		"manage_entregas_tecnicos",
		"manage_feriados",
		"manage_regionais",
		"manage_agentes",
		"manage_agenda",
		"manage_agendamentos",
		"manage_visitas",
		"manage_equipamentos",
		"manage_veiculos",
		"view_mensageria",
		"view_confirmacao_agendamentos",
		"view_insumos_requisicoes",
		"view_insumos_administrativos",
		"manage_insumos_administrativos",
	],
	supervisor: [
		"view_dashboard",
		"view_diario",
		"view_acerto_estoque",
		"manage_acerto_estoque",
		"view_estoque_integrado",
		"view_equipamentos",
		"view_mapa",
		"view_metas",
		"view_cobrancas",
		"view_relatorios",
		"view_agenda",
		"view_agendamentos",
		"view_visitas",
		"view_duvidas",
		"view_retiradas",
		"view_entregas_tecnicos",
		"tecnicos.auditoria_bolsa.view",
		"tecnicos.auditoria_bolsa.manage",
		"view_logistica",
		"manage_logistica",
		"view_empresas_tecnicos",
		"manage_empresas_tecnicos",
		"view_documentos",
		"view_documentos_tratativas",
		"view_ferramentas",
		"view_regionais",
		"view_agentes",
		"request_ferias",
		"manage_colaboradores",
		"manage_metas",
		"manage_cobrancas",
		"manage_duvidas",
		"manage_retiradas",
		"manage_entregas_tecnicos",
		"manage_feriados",
		"manage_regionais",
		"manage_agentes",
		"manage_agenda",
		"manage_agendamentos",
		"manage_visitas",
		"manage_equipamentos",
		"manage_veiculos",
		"view_mensageria",
		"view_confirmacao_agendamentos",
		"manage_users",
		"manage_general_settings",
		"view_insumos_administrativos",
		"view_insumos_requisicoes",
		"manage_insumos_administrativos",
	],
	supervisor_administrativo: [
		"view_dashboard",
		"view_empresas_tecnicos",
		"manage_empresas_tecnicos",
		"view_documentos",
		"view_documentos_tratativas",
		"manage_documentos",
		"view_documentos_relatorios",
		"view_insumos_administrativos",
		"view_insumos_requisicoes",
		"manage_insumos_administrativos",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
		"manage_general_settings",
		"manage_users",
		"manage_roles",
	],
	analista_administrativo: [
		"view_dashboard",
		"view_empresas_tecnicos",
		"manage_empresas_tecnicos",
		"view_documentos",
		"view_documentos_tratativas",
		"view_documentos_relatorios",
		"view_insumos_administrativos",
		"view_insumos_requisicoes",
		"manage_insumos_administrativos",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
	],
	lider_empresa: [
		"view_dashboard",
		"view_empresas_tecnicos",
		"view_documentos",
		"view_insumos_requisicoes",
		"tecnicos.auditoria_bolsa.view",
	],
	agente_autorizado: [
		"view_empresas_tecnicos",
		"view_documentos",
		"view_insumos_requisicoes",
	],
	backoffice: [
		"view_dashboard",
		"view_acerto_estoque",
		"manage_acerto_estoque",
		"view_insumos_requisicoes",
		"tecnicos.auditoria_bolsa.view",
		"tecnicos.auditoria_bolsa.manage",
	],
	visitante: ["view_dashboard", "view_insumos_requisicoes"],
});

function normalizeRole(role) {
	return String(role || "")
		.trim()
		.toLowerCase();
}

function normalizePermissions(permissions = []) {
	return [
		...new Set(
			(Array.isArray(permissions) ? permissions : [])
				.map((permission) => String(permission || "").trim())
				.filter(Boolean),
		),
	].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function listRoles() {
	const result = await db.query(
		`select r.id, r.name, r.description, r.system_role, r.active,
            coalesce(array_agg(rp.permission order by rp.permission) filter (where rp.permission is not null), '{}') as permissions
       from app_roles r
       left join app_role_permissions rp on rp.role_id = r.id
      group by r.id
      order by r.system_role desc, r.name asc`,
	);
	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description || "",
		systemRole: Boolean(row.system_role),
		active: Boolean(row.active),
		permissions: normalizePermissions(row.permissions || []),
	}));
}

async function listPermissionCatalog() {
	try {
		const result = await db.query(
			`select id,
              section_id as "sectionId",
              section_label as "sectionLabel",
              feature_id as "featureId",
              feature_label as "featureLabel",
              action,
              description,
              sort_order as "sortOrder",
              legacy_permission as "legacyPermission"
         from app_permissions
        where active = true
          and deprecated = false
        order by sort_order asc, id asc`,
		);
		return result.rows;
	} catch (error) {
		if (error?.code !== "42P01") throw error;
		return [];
	}
}

async function getRoleById(id) {
	const roleId = normalizeRole(id);
	if (!roleId) return null;
	const result = await db.query(
		`select r.id, r.name, r.description, r.system_role, r.active,
            coalesce(array_agg(rp.permission order by rp.permission) filter (where rp.permission is not null), '{}') as permissions
       from app_roles r
       left join app_role_permissions rp on rp.role_id = r.id
      where r.id = $1
      group by r.id`,
		[roleId],
	);
	const row = result.rows[0];
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		description: row.description || "",
		systemRole: Boolean(row.system_role),
		active: Boolean(row.active),
		permissions: normalizePermissions(row.permissions || []),
	};
}

async function getRolePermissions(role) {
	const roleId = normalizeRole(role);
	if (!roleId) return [];
	if (roleId === ADMIN_ROLE) return ["*"];

	try {
		const result = await db.query(
			`select rp.permission
         from app_roles r
         join app_role_permissions rp on rp.role_id = r.id
        where r.id = $1
          and r.active = true
        order by rp.permission`,
			[roleId],
		);
		if (result.rows.length)
			return normalizePermissions(result.rows.map((row) => row.permission));
	} catch (error) {
		if (error?.code !== "42P01") throw error;
	}

	return DEFAULT_ROLE_PERMISSIONS[roleId] || [];
}

async function enrichUserWithPermissions(user) {
	if (!user) return user;
	const role = normalizeRole(user.role);
	const permissions = await getRolePermissions(role);
	return {
		...user,
		role,
		permissions,
		isAdmin: role === ADMIN_ROLE || permissions.includes("*"),
	};
}

async function deleteRole(id) {
	const roleId = normalizeRole(id);
	if (!roleId || roleId === ADMIN_ROLE) {
		const error = new Error("Este cargo nao pode ser excluido.");
		error.statusCode = 400;
		throw error;
	}

	await db.query("begin");
	try {
		const current = await getRoleById(roleId);
		if (!current) {
			const error = new Error("Cargo nao encontrado.");
			error.statusCode = 404;
			throw error;
		}
		if (current.systemRole) {
			const error = new Error("Cargos do sistema nao podem ser excluidos.");
			error.statusCode = 400;
			throw error;
		}
		const users = await db.query(
			"select count(*)::int as total from app_users where lower(role) = $1",
			[roleId],
		);
		if (Number(users.rows[0]?.total || 0) > 0) {
			const error = new Error("Nao e possivel excluir cargo vinculado a usuarios.");
			error.statusCode = 409;
			throw error;
		}

		await db.query("delete from app_role_permissions where role_id = $1", [roleId]);
		await db.query("delete from app_roles where id = $1", [roleId]);
		await db.query("commit");
		return current;
	} catch (error) {
		await db.query("rollback").catch(() => {});
		throw error;
	}
}

async function saveRole({
	id,
	name,
	description = "",
	active = true,
	permissions = [],
}) {
	const roleId = normalizeRole(id);
	if (!roleId || roleId === ADMIN_ROLE) {
		const error = new Error("Este cargo nao pode ser alterado por aqui.");
		error.statusCode = 400;
		throw error;
	}

	const catalog = await listPermissionCatalog();
	const catalogIds = new Set(catalog.map((permission) => permission.id));
	const cleanPermissions = normalizePermissions(permissions).filter(
		(permission) =>
			permission !== "*" && (!catalogIds.size || catalogIds.has(permission)),
	);
	await db.query("begin");
	try {
		const current = await db.query(
			"select system_role from app_roles where id = $1",
			[roleId],
		);
		await db.query(
			`insert into app_roles (id, name, description, system_role, active)
       values ($1, $2, $3, coalesce($4, false), $5)
       on conflict (id) do update set
         name = excluded.name,
         description = excluded.description,
         active = excluded.active`,
			[
				roleId,
				String(name || roleId).trim(),
				String(description || "").trim(),
				current.rows[0]?.system_role ?? false,
				Boolean(active),
			],
		);
		await db.query("delete from app_role_permissions where role_id = $1", [
			roleId,
		]);
		for (const permission of cleanPermissions) {
			await db.query(
				`insert into app_role_permissions (role_id, permission)
         values ($1, $2)
         on conflict do nothing`,
				[roleId, permission],
			);
		}
		await db.query("commit");
	} catch (error) {
		await db.query("rollback");
		throw error;
	}
}

module.exports = {
	deleteRole,
	enrichUserWithPermissions,
	getRoleById,
	getRolePermissions,
	listPermissionCatalog,
	listRoles,
	saveRole,
};
