import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ROLES } from "../constants/roles";
import { useAuth } from "../modules/auth/hooks/useAuth";
import { listarCargosAdmin } from "../modules/auth/services/authService";

export const AuthContext = createContext(null);
const EMPTY_VIEW_AS_ROLES = [];

export const AuthProvider = ({ children }) => {
	const auth = useAuth();
	const [viewAsRole, setViewAsRole] = useState("");
	const [viewAsRoles, setViewAsRoles] = useState(null);
	const isAdmin =
		String(auth.currentUser?.role || "").toLowerCase() === ROLES.ADMIN;
	const effectiveRole =
		isAdmin && viewAsRole ? viewAsRole : auth.currentUser?.role;
	const safeViewAsRoles = Array.isArray(viewAsRoles)
		? viewAsRoles
		: EMPTY_VIEW_AS_ROLES;
	const viewAsRolesLoading = isAdmin && viewAsRoles === null;

	useEffect(() => {
		if (!isAdmin) {
			return undefined;
		}

		let active = true;

		const loadViewAsRoles = () => {
			listarCargosAdmin()
				.then((roles) => {
					if (!active) return;
					setViewAsRoles(roles || []);
				})
				.catch(() => {
					if (!active) return;
					setViewAsRoles([]);
				});
		};

		loadViewAsRoles();
		window.addEventListener("retiradas:roles-updated", loadViewAsRoles);

		return () => {
			active = false;
			window.removeEventListener("retiradas:roles-updated", loadViewAsRoles);
		};
	}, [isAdmin]);

	const selectedViewAsRole = useMemo(
		() => safeViewAsRoles.find((role) => role.value === viewAsRole),
		[safeViewAsRoles, viewAsRole],
	);

	const effectiveUser = useMemo(() => {
		if (!auth.currentUser) return null;
		if (isAdmin && viewAsRole) {
			if (viewAsRolesLoading) return auth.currentUser;
			const user = { ...auth.currentUser };
			delete user.permissions;
			delete user.isAdmin;
			return {
				...user,
				role: effectiveRole,
				permissions: selectedViewAsRole?.permissions || [],
			};
		}
		return { ...auth.currentUser, role: effectiveRole };
	}, [
		auth.currentUser,
		effectiveRole,
		isAdmin,
		selectedViewAsRole?.permissions,
		viewAsRole,
		viewAsRolesLoading,
	]);
	const value = useMemo(
		() => ({
			...auth,
			realUser: auth.currentUser,
			currentUser: effectiveUser,
			effectiveUser,
			effectiveRole,
			viewAsRole,
			viewAsRoles: safeViewAsRoles,
			viewAsRolesLoading,
			setViewAsRole,
			isViewingAsRole: Boolean(isAdmin && viewAsRole),
		}),
		[
			auth,
			effectiveUser,
			effectiveRole,
			isAdmin,
			safeViewAsRoles,
			viewAsRole,
			viewAsRolesLoading,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
	const context = useContext(AuthContext);
	if (!context)
		throw new Error("useAuthContext must be used within AuthProvider");
	return context;
};
