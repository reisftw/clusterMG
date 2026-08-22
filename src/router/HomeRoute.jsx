import { Navigate } from "react-router-dom";
import { hasPermission } from "../constants/roles";
import { useAuthContext } from "../context/AuthContext";
import { ROUTES } from "./routes";

const HomeRoute = ({ dashboard: DashboardComponent }) => {
  const { currentUser } = useAuthContext();

  if (hasPermission(currentUser, "view_dashboard")) {
    return <DashboardComponent />;
  }

  if (hasPermission(currentUser, "view_acerto_estoque")) {
    return <Navigate to={ROUTES.ACERTO_ESTOQUE} replace />;
  }

  if (hasPermission(currentUser, "view_documentos")) {
    return <Navigate to={ROUTES.DOCUMENTOS_PENDENTES} replace />;
  }

  return <Navigate to={ROUTES.ACCESS_DENIED} replace />;
};

export default HomeRoute;

