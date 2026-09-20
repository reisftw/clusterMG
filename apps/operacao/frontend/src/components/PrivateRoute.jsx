import { Navigate } from "react-router-dom";
import { useRotAuth } from "../state/RotAuthContext";

export default function PrivateRoute({ children, permission }) {
	const { user, loading, hasPermission } = useRotAuth();

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center text-slate-500 font-bold">
				Carregando...
			</div>
		);
	}
	if (!user) return <Navigate to="/login" replace />;
	if (permission && !(Array.isArray(permission) ? permission.some(hasPermission) : hasPermission(permission))) {
		return (
			<div className="flex min-h-screen items-center justify-center text-slate-500 font-bold">
				Você não tem permissão para acessar esta página.
			</div>
		);
	}
	return children;
}
