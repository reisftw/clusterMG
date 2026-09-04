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
	{ label: "Dashboard", path: FINAN_ROUTES.DASHBOARD, icon: LayoutDashboard },
	{
		label: "Gestão Orçamentária",
		path: FINAN_ROUTES.GESTAO_ORCAMENTARIA,
		icon: BarChart3,
	},
	{
		label: "Dados Orçamentários",
		path: FINAN_ROUTES.DADOS_ORCAMENTARIOS,
		icon: FileText,
	},
	{ label: "Orçamento", path: FINAN_ROUTES.ORCAMENTO, icon: WalletCards },
	{ label: "DRE", path: FINAN_ROUTES.DRE, icon: ReceiptText },
	{ label: "Aprovações", path: FINAN_ROUTES.APROVACOES, icon: ShieldCheck },
	{ label: "Contas a Pagar", path: FINAN_ROUTES.CONTAS_PAGAR, icon: Landmark },
	{ label: "Contas a Receber", path: FINAN_ROUTES.CONTAS_RECEBER, icon: FileCheck2 },
	{ label: "Faturamento", path: FINAN_ROUTES.FATURAMENTO, icon: Building2 },
	{ label: "Notas", path: FINAN_ROUTES.NOTAS, icon: FileText },
	{ label: "Reports", path: FINAN_ROUTES.REPORTS, icon: BarChart3 },
	{ label: "Equipe", path: FINAN_ROUTES.EQUIPE, icon: Users },
	{
		label: "Configuração Geral",
		path: FINAN_ROUTES.CONFIGURACAO_GERAL,
		icon: Settings,
	},
];

export default function FinanLayout() {
	const { user, logout } = useFinanAuth();

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
					{navItems.map((item) => {
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
