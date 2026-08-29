import { Navigate, useLocation } from "react-router-dom";
import Spinner from "../components/ui/Spinner";
import { hasAnyPermission } from "../constants/roles";
import { useAuthContext } from "../context/AuthContext";
import { ROUTES } from "./routes";

const ProtectedRoute = ({ children, requiredPermission }) => {
	const { currentUser, loading, realUser, isViewingAsRole } = useAuthContext();
	const location = useLocation();

	if (loading) return <Spinner fullScreen />;
	if (!currentUser) return <Navigate to={ROUTES.LOGIN} replace />;
	if (
		requiredPermission &&
		!hasAnyPermission(currentUser, requiredPermission)
	) {
		const isAdminUsingSimulator =
			isViewingAsRole &&
			String(realUser?.role || "").toLowerCase() === "admin" &&
			location.pathname === ROUTES.CONFIGURACOES_GERAIS;
		if (isAdminUsingSimulator) return children;
		return <Navigate to={ROUTES.ACCESS_DENIED} replace />;
	}

	return children;
};

export default ProtectedRoute;
