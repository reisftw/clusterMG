import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Truck, CalendarCheck,
  Users, UserSquare2, ClipboardList, DollarSign, Clock,
  Package, MapPin, Star, CalendarRange, LogOut, Zap, Target,
} from 'lucide-react';
import { useAuthContext } from '../../../context/AuthContext';
import { hasPermission } from '../../../constants/roles';
import { ROUTES } from '../../../router/routes';

const NAV_ITEMS = [
  { label: 'Dashboard',           path: ROUTES.DASHBOARD,    icon: LayoutDashboard, permission: 'view_dashboard'       },
  { label: 'Colaboradores',       path: ROUTES.COLABORADORES, icon: UserSquare2,    permission: 'manage_colaboradores' },
  { label: 'Presença',            path: ROUTES.PRESENCA,      icon: ClipboardList,  permission: 'manage_presenca'      },
  { label: 'Férias',              path: ROUTES.FERIAS,        icon: CalendarDays,   permission: 'request_ferias'       },
  { label: 'Frota',               path: ROUTES.FROTA,         icon: Truck,          permission: 'checklist_frota'      },
  { label: 'Comissão',            path: ROUTES.COMISSAO,      icon: DollarSign,     permission: 'view_comissao'        },
  { label: 'Banco de Horas',      path: ROUTES.BANCO_HORAS,   icon: Clock,          permission: 'view_banco_horas'     },
  { label: 'Equipamentos',        path: ROUTES.EQUIPAMENTOS,  icon: Package,        permission: 'view_equipamentos'    },
  { label: 'Regionais',           path: ROUTES.REGIONAIS,     icon: MapPin,         permission: 'view_regionais'       },
  { label: 'Agentes Autorizados', path: ROUTES.AGENTES,       icon: Star,           permission: 'view_agentes'         },
  { label: 'Agenda',              path: ROUTES.AGENDA,        icon: CalendarRange,  permission: 'view_agenda'          },
  { label: 'Metas',               path: ROUTES.METAS,         icon: Target,         permission: 'view_metas'           },
  { label: 'Feriados',            path: ROUTES.FERIADOS,      icon: CalendarCheck,  permission: 'manage_feriados'      },
  { label: 'Usuários',            path: ROUTES.USUARIOS,      icon: Users,          permission: 'manage_users'         },
];

const Sidebar = () => {
  const { currentUser, signOut } = useAuthContext();
  const visibleItems = NAV_ITEMS.filter((item) =>
    hasPermission(currentUser?.role, item.permission)
  );

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center shadow-md shadow-orange-100">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <p className="text-gray-900 font-bold text-sm leading-none">Gestão</p>
            <p className="text-orange-500 text-xs font-medium mt-0.5">Retiradas</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">Menu</p>
        {visibleItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`
            }
          >
            <Icon size={16} className="shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">
              {currentUser?.nome?.charAt(0)?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-gray-900 text-sm font-semibold truncate">{currentUser?.nome}</p>
            <p className="text-gray-400 text-xs truncate capitalize">{currentUser?.role}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="nav-item nav-item-inactive w-full text-red-400 hover:bg-red-50 hover:text-red-500"
        >
          <LogOut size={16} className="shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
