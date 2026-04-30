import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { hasPermission } from '../constants/roles';
import { ROUTES } from './routes';
import Spinner from '../components/ui/Spinner';

const ProtectedRoute = ({ children, requiredPermission }) => {
  const { currentUser, loading } = useAuthContext();

  if (loading) return <Spinner fullScreen />;
  if (!currentUser) return <Navigate to={ROUTES.LOGIN} replace />;
  if (requiredPermission && !hasPermission(currentUser.role, requiredPermission)) {
    return <Navigate to={ROUTES.ACCESS_DENIED} replace />;
  }

  return children;
};

export default ProtectedRoute;
