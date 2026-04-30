import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Truck,
  CalendarCheck,
  Users,
  UserSquare2,
  ClipboardList,
  DollarSign,
  Clock,
  Package,
  MapPin,
  Star,
  CalendarRange,
  BookOpen,
  LogOut,
  Target,
  Wrench,
  MessageSquareWarning,
  CalendarClock,
  UsersRound,
  BarChart2,
  MonitorPlay,
  Map,
} from "lucide-react";
import { useAuthContext } from "../../context/AuthContext";
import { useSystem } from "../../context/SystemContext";
import { hasPermission } from "../../constants/roles";
import { ROUTES } from "../../router/routes";

const NAV_RETIRADAS = [
  {
    label: "Dashboard",
    path: ROUTES.DASHBOARD,
    icon: LayoutDashboard,
    permission: "view_dashboard",
  },
  {
    label: "Mapa O.S",
    path: ROUTES.MAPA,
    icon: Map,
    permission: "view_mapa",
  },
  {
    label: "Ferramentas",
    path: ROUTES.FERRAMENTAS,
    icon: BarChart2,
    permission: "view_ferramentas",
  },
  {
    label: "Colaboradores",
    path: ROUTES.COLABORADORES,
    icon: UserSquare2,
    permission: "manage_colaboradores",
  },
  {
    label: "Presenca",
    path: ROUTES.PRESENCA,
    icon: ClipboardList,
    permission: "manage_presenca",
  },
  {
    label: "Ferias",
    path: ROUTES.FERIAS,
    icon: CalendarDays,
    permission: "request_ferias",
  },
  {
    label: "Frota",
    path: ROUTES.FROTA,
    icon: Truck,
    permission: "checklist_frota",
  },
  {
    label: "Comissao",
    path: ROUTES.COMISSAO,
    icon: DollarSign,
    permission: "view_comissao",
  },
  {
    label: "Banco de Horas",
    path: ROUTES.BANCO_HORAS,
    icon: Clock,
    permission: "view_banco_horas",
  },
  {
    label: "Equipamentos",
    path: ROUTES.EQUIPAMENTOS,
    icon: Package,
    permission: "view_equipamentos",
  },
  {
    label: "Regionais",
    path: ROUTES.REGIONAIS,
    icon: MapPin,
    permission: "view_regionais",
  },
  {
    label: "Agentes",
    path: ROUTES.AGENTES,
    icon: Star,
    permission: "view_agentes",
  },
  {
    label: "Agenda",
    path: ROUTES.AGENDA,
    icon: CalendarRange,
    permission: "view_agenda",
  },
  {
    label: "Gestao Duvidas",
    path: ROUTES.GESTAO_DUVIDAS,
    icon: BookOpen,
    permission: "view_duvidas",
  },
  {
    label: "Metas",
    path: ROUTES.METAS,
    icon: Target,
    permission: "view_metas",
  },
  {
    label: "Feriados",
    path: ROUTES.FERIADOS,
    icon: CalendarCheck,
    permission: "manage_feriados",
  },
  {
    label: "Usuarios",
    path: ROUTES.USUARIOS,
    icon: Users,
    permission: "manage_users",
  },
];

const NAV_FS = [
  {
    label: "Dashboard",
    path: ROUTES.FS_DASHBOARD,
    icon: LayoutDashboard,
    permission: "view_fs_dashboard",
  },
  {
    label: "Colaboradores",
    path: ROUTES.FS_COLABORADORES,
    icon: UsersRound,
    permission: "manage_fs_colaboradores",
  },
  {
    label: "Banco de Horas",
    path: ROUTES.FS_BANCO_HORAS,
    icon: Clock,
    permission: "view_fs_banco_horas",
  },
  {
    label: "Ferias",
    path: ROUTES.FS_FERIAS,
    icon: CalendarDays,
    permission: "view_fs_ferias",
  },
  {
    label: "Frota",
    path: ROUTES.FS_FROTA,
    icon: Truck,
    permission: "view_fs_frota",
  },
  {
    label: "Ferramentas",
    path: ROUTES.FS_FERRAMENTAS,
    icon: Wrench,
    permission: "manage_fs_ferramentas",
  },
  {
    label: "Reclamacoes",
    path: ROUTES.FS_RECLAMACOES,
    icon: MessageSquareWarning,
    permission: "view_fs_reclamacoes",
  },
  {
    label: "Reunioes",
    path: ROUTES.FS_REUNIOES,
    icon: CalendarRange,
    permission: "view_fs_reunioes",
  },
  {
    label: "Escala de Folgas",
    path: ROUTES.FS_ESCALA,
    icon: CalendarClock,
    permission: "view_fs_escala",
  },
];

const Sidebar = () => {
  const { currentUser, signOut } = useAuthContext();
  const { sistema } = useSystem();

  const isFS = sistema === "fs";
  const navItems = isFS ? NAV_FS : NAV_RETIRADAS;

  const visibleItems = navItems.filter((item) =>
    hasPermission(currentUser?.role, item.permission),
  );

  return (
    <div className="flex h-full flex-col border-r border-gray-100 bg-white">
      <div className="border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md">
            <img
              src="https://i.ibb.co/3mckLZfk/favicon.png"
              alt="Logo"
              className="h-6 w-6"
            />
          </div>
          <div>
            <p className="text-sm font-bold leading-none text-gray-900">
              Sempre Internet
            </p>
            <p
              className={`mt-0.5 text-xs font-medium ${isFS ? "text-blue-500" : "text-orange-500"}`}
            >
              {isFS ? "Field Service" : "Gestao Retiradas"}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {isFS ? "Field Service" : "Menu"}
        </p>
        {visibleItems.map(({ label, path, icon: IconComponent }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `nav-item ${isActive ? "nav-item-active" : "nav-item-inactive"}`
            }
          >
            <IconComponent size={16} className="shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}

        <div className="my-3 border-t border-gray-100" />
        <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Publico
        </p>
        <NavLink
          to={ROUTES.PAINEL_PUBLICO}
          className={({ isActive }) =>
            `nav-item ${isActive ? "nav-item-active" : "nav-item-inactive"} text-orange-500`
          }
        >
          <MonitorPlay size={16} className="shrink-0" />
          <span>Painel Publico</span>
        </NavLink>
      </nav>

      <div className="border-t border-gray-100 px-3 py-4">
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600">
            <span className="text-xs font-bold text-white">
              {currentUser?.nome?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {currentUser?.nome}
            </p>
            <p className="truncate text-xs capitalize text-gray-400">
              {currentUser?.role}
            </p>
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
