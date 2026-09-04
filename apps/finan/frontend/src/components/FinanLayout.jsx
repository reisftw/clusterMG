import {
	BarChart3,
	Building2,
	ChevronRight,
	FileCheck2,
	FileText,
	Landmark,
	LayoutDashboard,
	LogOut,
	ReceiptText,
	Settings,
	ShieldCheck,
	Users,
	WalletCards,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";

const navItems = [
	{
		label: "Dashboard",
		path: FINAN_ROUTES.DASHBOARD,
		icon: LayoutDashboard,
		permission: "finan.dashboard.view",
	},
	{
		label: "Gestão Orçamentária",
		path: FINAN_ROUTES.GESTAO_ORCAMENTARIA,
		icon: BarChart3,
		permission: "finan.gestao_orcamentaria.view",
	},
	{
		label: "Dados Orçamentários",
		path: FINAN_ROUTES.DADOS_ORCAMENTARIOS,
		icon: FileText,
		permission: "finan.gestao_orcamentaria.manage",
	},
	{
		label: "Orçamento",
		path: FINAN_ROUTES.ORCAMENTO,
		icon: WalletCards,
		permission: "finan.gestao_orcamentaria.view",
	},
	{
		label: "DRE",
		path: FINAN_ROUTES.DRE,
		icon: ReceiptText,
		permission: "finan.dashboard.view",
	},
	{
		label: "Aprovações",
		path: FINAN_ROUTES.APROVACOES,
		icon: ShieldCheck,
		permission: "finan.gestao_orcamentaria.manage",
	},
	{
		label: "Contas a Pagar",
		path: FINAN_ROUTES.CONTAS_PAGAR,
		icon: Landmark,
		permission: "finan.contas_pagar.view",
	},
	{
		label: "Contas a Receber",
		path: FINAN_ROUTES.CONTAS_RECEBER,
		icon: FileCheck2,
		permission: "finan.contas_receber.view",
	},
	{
		label: "Faturamento",
		path: FINAN_ROUTES.FATURAMENTO,
		icon: Building2,
		permission: "finan.faturamento.view",
	},
	{
		label: "Notas",
		path: FINAN_ROUTES.NOTAS,
		icon: FileText,
		permission: "finan.notas.view",
	},
	{
		label: "Reports",
		path: FINAN_ROUTES.REPORTS,
		icon: BarChart3,
		permission: "finan.reports.view",
	},
	{
		label: "Equipe",
		path: FINAN_ROUTES.EQUIPE,
		icon: Users,
		permission: "finan.equipe.view",
	},
	{
		label: "Configuração Geral",
		path: FINAN_ROUTES.CONFIGURACAO_GERAL,
		icon: Settings,
		permission: "finan.configuracoes.view",
	},
];

export default function FinanLayout() {
	const { user, logout } = useFinanAuth();
	const visibleNavItems = navItems.filter((item) => canAccess(user, item.permission));

	return (
		<div className="finan-shell">
			<aside className="finan-sidebar">
				<div className="finan-brand">
					<div className="finan-brand-mark">F</div>
					<div>
						<strong>Finan</strong>
						<span>Gestão financeira</span>
					</div>
				</div>
				<nav className="finan-nav">
					{visibleNavItems.map((item) => {
						const Icon = item.icon;
						return (
							<NavLink
								key={item.path}
								to={item.path}
								end={item.path === FINAN_ROUTES.DASHBOARD}
								className={({ isActive }) =>
									`finan-nav-link ${isActive ? "is-active" : ""}`
								}
							>
								<Icon size={18} />
								<span>{item.label}</span>
								<ChevronRight size={14} className="finan-nav-chevron" />
							</NavLink>
						);
					})}
				</nav>
			</aside>
			<div className="finan-main">
				<header className="finan-topbar">
					<div>
						<p>Olá, {user?.name || user?.email || "usuário"}</p>
						<strong>Finan dedicado</strong>
					</div>
					<button type="button" onClick={logout} className="finan-ghost-button">
						<LogOut size={16} />
						Sair
					</button>
				</header>
				<main className="finan-content">
					<Outlet />
				</main>
			</div>
		</div>
	);
}

function canAccess(user, permission) {
	if (!permission) return true;
	if (user?.isAdmin) return true;
	return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}
