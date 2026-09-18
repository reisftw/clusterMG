import { useEffect, useMemo, useState } from "react";
import FinanceiroPage from "../modules/financeiro/components/FinanceiroPage";
import { AuthContext } from "../modules/financeiro/financeiroAuthContext";
import { fetchFinanRoles } from "../api/finanApi";
import { useFinanAuth } from "../state/FinanAuthContext";

function toFinanceiroPermission(permission) {
	const value = String(permission || "");
	if (value.startsWith("financeiro.")) return value;
	if (!value.startsWith("finan.")) return value;
	return value
		.replace(/^finan\.dashboard\.view$/, "financeiro.visao_geral.view")
		.replace(/^finan\.gestao_orcamentaria\./, "financeiro.gestao_orcamento.")
		.replace(/^finan\./, "financeiro.");
}

function buildFinanceiroUser(user) {
	const permissions = new Set(user?.permissions || []);
	for (const permission of user?.permissions || []) {
		permissions.add(toFinanceiroPermission(permission));
	}
	if (user?.isAdmin) {
		permissions.add("*");
		permissions.add("financeiro.visao_geral.view");
		permissions.add("financeiro.visao_geral.manage");
		permissions.add("financeiro.configuracoes.view");
		permissions.add("financeiro.configuracoes.manage");
		permissions.add("financeiro.gestao_orcamento.view");
		permissions.add("financeiro.gestao_orcamento.manage");
		permissions.add("financeiro.equipe.view");
		permissions.add("financeiro.equipe.manage");
	}

	return {
		...user,
		uid: user?.id || user?.uid,
		nome: user?.name || user?.nome,
		avatarUrl: user?.avatarUrl || "",
		role: user?.isAdmin ? "admin" : user?.role || "analista_financeiro",
		permissions: [...permissions],
		appScope: "finan",
		sourceSystem: "finan",
	};
}

export default function FinanFinanceiroPage({ page }) {
	const auth = useFinanAuth();
	const [viewAsRole, setViewAsRole] = useState("");
	const [viewAsRoles, setViewAsRoles] = useState(null);
	const currentUser = useMemo(() => buildFinanceiroUser(auth.user), [auth.user]);
	const isAdmin =
		Boolean(auth.user?.isAdmin) ||
		String(auth.user?.role || "").toLowerCase() === "admin";
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
							.map((role) => {
								const roleUser = buildFinanceiroUser({
									role: role.id,
									permissions: role.permissions || [],
									isAdmin: role.is_admin || role.isAdmin,
								});
								return {
									value: role.id,
									label: role.name || role.id,
									permissions: roleUser.permissions || [],
									source: "finan",
									scope: "finan",
								};
							}),
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
	const selectedViewAsRole = useMemo(
		() => (viewAsRoles || []).find((role) => role.value === viewAsRole),
		[viewAsRole, viewAsRoles],
	);
	const effectiveUser = useMemo(() => {
		if (!isAdmin || !viewAsRole) return currentUser;
		return {
			...currentUser,
			role: viewAsRole,
			permissions: selectedViewAsRole?.permissions || [],
			isAdmin: false,
		};
	}, [currentUser, isAdmin, selectedViewAsRole?.permissions, viewAsRole]);
	const value = useMemo(
		() => ({
			currentUser: effectiveUser,
			effectiveUser,
			realUser: currentUser,
			effectiveRole: effectiveUser?.role,
			isViewingAsRole: Boolean(isAdmin && viewAsRole),
			viewAsRole,
			viewAsRoles: viewAsRoles || [],
			viewAsRolesLoading: isAdmin && viewAsRoles === null,
			setViewAsRole,
			appScope: "finan",
			refreshUser: async () => currentUser,
			signOut: auth.logout,
			logout: auth.logout,
		}),
		[auth.logout, currentUser, effectiveUser, isAdmin, viewAsRole, viewAsRoles],
	);

	return (
		<AuthContext.Provider value={value}>
			<FinanceiroPage page={page} />
		</AuthContext.Provider>
	);
}
