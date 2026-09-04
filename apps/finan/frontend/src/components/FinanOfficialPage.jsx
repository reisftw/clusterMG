import { useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../../../../src/context/AuthContext";
import { ROLES } from "../../../../../src/constants/roles";
import { fetchFinanRoles } from "../api/finanApi";
import { useFinanAuth } from "../state/FinanAuthContext";

function buildPermissionSet(user) {
	const permissions = new Set(Array.isArray(user?.permissions) ? user.permissions : []);
	for (const permission of Array.from(permissions)) {
		if (permission === "finan.dashboard.view") permissions.add("financeiro.visao_geral.view");
		if (permission === "finan.gestao_orcamentaria.view") {
			permissions.add("financeiro.gestao_orcamento.view");
		}
		if (permission === "finan.gestao_orcamentaria.manage") {
			permissions.add("financeiro.gestao_orcamento.manage");
		}
		if (permission === "finan.configuracoes.view") {
			[
				"configuracao.geral.view",
				"configuracao.notificacoes.view",
				"configuracao.apis.view",
				"configuracao.hubsoft.view",
				"configuracao.cvortex.view",
				"configuracao.senior.view",
				"configuracao.banco_dados.view",
				"configuracao.email.view",
				"configuracao.auditoria.view",
			].forEach((item) => permissions.add(item));
		}
		if (permission === "finan.configuracoes.manage") {
			[
				"configuracao.geral.manage",
				"configuracao.notificacoes.manage",
				"configuracao.apis.manage",
				"configuracao.hubsoft.manage",
				"configuracao.cvortex.manage",
				"configuracao.senior.manage",
				"configuracao.banco_dados.manage",
				"configuracao.email.manage",
				"manage_general_settings",
				"manage_integracoes",
				"manage_database_backups",
				"manage_email",
			].forEach((item) => permissions.add(item));
		}
		if (permission === "finan.usuarios.manage") {
			[
				"configuracao.usuarios.view",
				"configuracao.usuarios.manage",
				"configuracao.cargos_permissoes.view",
				"configuracao.cargos_permissoes.manage",
				"manage_users",
				"manage_roles",
			].forEach((item) => permissions.add(item));
		}
		if (permission.startsWith("finan.")) {
			permissions.add(permission.replace(/^finan\./, "financeiro."));
			permissions.add(permission.replace(/^finan\./, "configuracao."));
		}
	}
	if (user?.isAdmin) {
		permissions.add("*");
		[
			"manage_users",
			"manage_roles",
			"manage_general_settings",
			"manage_integracoes",
			"manage_database_backups",
			"manage_email",
			"configuracao.geral.view",
			"configuracao.geral.manage",
			"configuracao.notificacoes.view",
			"configuracao.notificacoes.manage",
			"configuracao.usuarios.view",
			"configuracao.usuarios.manage",
			"configuracao.cargos_permissoes.view",
			"configuracao.cargos_permissoes.manage",
			"configuracao.apis.view",
			"configuracao.apis.manage",
			"configuracao.hubsoft.view",
			"configuracao.hubsoft.manage",
			"configuracao.cvortex.view",
			"configuracao.cvortex.manage",
			"configuracao.senior.view",
			"configuracao.senior.manage",
			"configuracao.banco_dados.view",
			"configuracao.banco_dados.manage",
			"configuracao.email.view",
			"configuracao.email.manage",
			"configuracao.auditoria.view",
		].forEach((permission) => permissions.add(permission));
	}
	return Array.from(permissions);
}

export default function FinanOfficialPage({ children }) {
	const { user, logout, refresh } = useFinanAuth();
	const [viewAsRole, setViewAsRole] = useState("");
	const [viewAsRoles, setViewAsRoles] = useState(null);

	const isAdmin = Boolean(user?.isAdmin) || String(user?.role || "").toLowerCase() === ROLES.ADMIN;

	useEffect(() => {
		if (!isAdmin) {
			setViewAsRoles([]);
			setViewAsRole("");
			return undefined;
		}

		let active = true;
		const loadRoles = () => {
			fetchFinanRoles()
				.then((roles) => {
					if (!active) return;
					setViewAsRoles(
						(roles || [])
							.filter((role) => role?.active !== false)
							.map((role) => ({
								value: role.id,
								label: role.name || role.id,
								permissions: buildPermissionSet({
									permissions: role.permissions || [],
									isAdmin: role.is_admin || role.isAdmin,
								}),
								source: "finan",
								scope: "finan",
							})),
					);
				})
				.catch(() => {
					if (!active) return;
					setViewAsRoles([]);
				});
		};

		loadRoles();
		window.addEventListener("retiradas:roles-updated", loadRoles);
		return () => {
			active = false;
			window.removeEventListener("retiradas:roles-updated", loadRoles);
		};
	}, [isAdmin]);

	const officialUser = useMemo(
		() => ({
			...user,
			id: user?.id,
			uid: user?.id,
			nome: user?.name,
			email: user?.email,
			role: user?.isAdmin ? "admin" : user?.role || "financeiro",
			avatarUrl: user?.avatarUrl || "",
			permissions: buildPermissionSet(user),
			appScope: "finan",
			sourceSystem: "finan",
		}),
		[user],
	);
	const selectedViewAsRole = useMemo(
		() => (viewAsRoles || []).find((role) => role.value === viewAsRole),
		[viewAsRole, viewAsRoles],
	);
	const effectiveUser = useMemo(() => {
		if (!isAdmin || !viewAsRole) return officialUser;
		return {
			...officialUser,
			role: viewAsRole,
			permissions: selectedViewAsRole?.permissions || [],
			isAdmin: false,
		};
	}, [isAdmin, officialUser, selectedViewAsRole?.permissions, viewAsRole]);
	const contextValue = {
		currentUser: effectiveUser,
		realUser: officialUser,
		effectiveUser,
		effectiveRole: effectiveUser?.role,
		loading: false,
		trocarSenhaObrigatorio: false,
		isViewingAsRole: Boolean(isAdmin && viewAsRole),
		viewAsRole,
		viewAsRoles: viewAsRoles || [],
		viewAsRolesLoading: isAdmin && viewAsRoles === null,
		setViewAsRole,
		signOut: logout,
		logout,
		refreshUser: refresh,
		appScope: "finan",
	};
	return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
