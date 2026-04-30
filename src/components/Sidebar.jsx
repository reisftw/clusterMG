import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Truck, CalendarCheck, Users, Mail, LogOut } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { hasPermission } from '../constants/roles';
import { ROUTES } from '../router/routes';

const NAVITEMS = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: LayoutDashboard, permission: 'view_dashboard' },
  { label: 'Férias', path: ROUTES.FERIAS, icon: CalendarDays, permission: 'request_ferias' },
  { label: 'Frota', path: ROUTES.FROTA, icon: Truck, permission: 'checklist_frota' },
  { label: 'Feriados', path: ROUTES.FERIADOS, icon: CalendarCheck, permission: 'manage_feriados' },
  { label: 'Usuários', path: ROUTES.USUARIOS, icon: Users, permission: 'manage_users' },
  { label: 'E-mail', path: '/email', icon: Mail, permission: 'manage_email' }, // ✅ NOVA
];

const Sidebar = () => {
  const { currentUser, signOut } = useAuthContext();
  const visibleItems = NAVITEMS.filter(item => hasPermission(currentUser?.role, item.permission));

  return (
    <aside className="flex flex-col w-64 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 px-4 py-6">
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Sempre Internet</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Gestão Retiradas</p>
      </div>
      <nav className="flex-1 space-y-1">
        {visibleItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-3">{currentUser?.nome} • {currentUser?.role}</p>
        <button onClick={signOut} className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 dark:text-red-400 transition-colors">
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;