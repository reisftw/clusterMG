export const ROLES = Object.freeze({
	ADMIN: "site_admin",
	SUPERVISOR: "supervisor",
	SUPERVISOR_ADMINISTRATIVO: "supervisor_administrativo",
	LIDER_EMPRESA: "lider_empresa",
	AGENTE_AUTORIZADO: "agente_autorizado",
});

const LEGACY_ROLE_PERMISSIONS = {
	site_admin: ["*"],
	admin: ["*"],
	supervisor_administrativo: ["manage_empresas_tecnicos"],
	supervisor: ["view_empresas_tecnicos"],
};

export function hasPermission(user, permission) {
	if (!permission) return true;
	if (!user) return false;
	if (typeof user === "string") {
		const permissions = LEGACY_ROLE_PERMISSIONS[user] || [];
		if (permissions.includes("*")) return true;
		if (Array.isArray(permission)) return permission.some((item) => permissions.includes(item));
		return permissions.includes(permission);
	}
	if (user.isAdmin || user.permissions?.includes("*")) return true;
	if (Array.isArray(permission)) return permission.some((item) => hasPermission(user, item));
	return user.permissions?.includes(permission) ?? false;
}
