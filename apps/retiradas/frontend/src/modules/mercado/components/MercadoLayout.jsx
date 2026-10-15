import {
	BadgeDollarSign,
	Bell,
	CheckSquare,
	Clock,
	FileBarChart,
	History,
	LayoutDashboard,
	ListChecks,
	Menu,
	PackageCheck,
	Settings2,
	ShoppingBag,
	UserRound,
	X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { hasAnyPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { ROUTES } from "../../../router/routes";
import "../mercado-design.css";

const NAV_ITEMS = [
	{
		label: "Dashboard",
		path: ROUTES.MERCADO_ADMIN_DASHBOARD,
		icon: LayoutDashboard,
		permissions: ["mercado.dashboard.view"],
		end: true,
	},
	{
		label: "Disponíveis",
		path: ROUTES.MERCADO_DISPONIVEIS,
		icon: ShoppingBag,
		permissions: ["mercado.lotes.view", "mercado.lotes.accept"],
	},
	{
		label: "Lotes",
		path: ROUTES.MERCADO_LOTES,
		icon: PackageCheck,
		permissions: ["mercado.lotes.view", "mercado.lotes.manage"],
	},
	{
		label: "Meus lotes",
		path: ROUTES.MERCADO_ADMIN_MEUS_LOTES,
		icon: ListChecks,
		permissions: ["mercado.execucao.view", "mercado.execucao.manage"],
	},
	{
		label: "Aprovações",
		path: ROUTES.MERCADO_APROVACOES,
		icon: CheckSquare,
		permissions: ["mercado.backoffice.view", "mercado.backoffice.manage"],
	},
	{
		label: "Financeiro",
		path: ROUTES.MERCADO_FINANCEIRO,
		icon: BadgeDollarSign,
		permissions: ["mercado.financeiro.view", "mercado.financeiro.manage"],
	},
	{
		label: "Histórico",
		path: ROUTES.MERCADO_HISTORICO,
		icon: History,
		permissions: ["mercado.auditoria.view", "mercado.lotes.view"],
	},
	{
		label: "Relatórios",
		path: ROUTES.MERCADO_RELATORIOS,
		icon: FileBarChart,
		permissions: ["mercado.dashboard.view", "mercado.financeiro.view"],
	},
	{
		label: "Configurações",
		path: ROUTES.MERCADO_CONFIGURACOES,
		icon: Settings2,
		permissions: ["mercado.config.view", "mercado.config.manage"],
	},
];

function NavItems({ onNavigate }) {
	const { currentUser } = useAuthContext();
	const items = NAV_ITEMS.filter((item) =>
		hasAnyPermission(currentUser, item.permissions),
	);
	return (
		<nav className="mt-6 space-y-1">
			{items.map((item) => {
				const Icon = item.icon;
				return (
					<NavLink
						key={item.path}
						to={item.path}
						end={item.end}
						onClick={onNavigate}
						className={({ isActive }) =>
							`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-black transition ${
								isActive
									? "mercado-nav-active"
									: "mercado-nav-link"
							}`
						}
					>
						<Icon size={18} />
						<span>{item.label}</span>
					</NavLink>
				);
			})}
		</nav>
	);
}

function SidebarContent({ onNavigate }) {
	return (
		<div className="mercado-sidebar flex h-full flex-col px-4 py-5 text-white">
			<div className="border-b border-white/10 pb-5">
				<img src="/mercado/logo-mercado.svg" alt="Mercado de Retiradas" className="h-auto w-[190px]" />
			</div>
			<NavItems onNavigate={onNavigate} />
			<div className="mercado-support mt-auto rounded-2xl border p-3">
				<div className="flex items-center gap-2 text-xs font-black uppercase text-cyan-200">
					<Clock size={14} />
					SLA padrão
				</div>
				<p className="mt-2 text-2xl font-black text-white">72h</p>
				<p className="text-xs font-semibold text-slate-400">
					Controle individual por O.S.
				</p>
			</div>
		</div>
	);
}

export default function MercadoLayout() {
	const [mobileOpen, setMobileOpen] = useState(false);
	const { currentUser } = useAuthContext();
	const location = useLocation();
	const title =
		NAV_ITEMS.find((item) =>
			item.end
				? item.path === location.pathname
				: location.pathname.startsWith(item.path),
		)?.label || "Mercado";

	return (
		<div className="mercado-app flex min-h-dvh text-slate-950">
			<aside className="hidden w-72 shrink-0 lg:block">
				<SidebarContent />
			</aside>
			{mobileOpen ? (
				<div className="fixed inset-0 z-50 lg:hidden">
					<button
						type="button"
						className="absolute inset-0 bg-slate-950/70"
						aria-label="Fechar menu"
						onClick={() => setMobileOpen(false)}
					/>
					<aside className="absolute inset-y-0 left-0 w-[min(84vw,320px)]">
						<SidebarContent onNavigate={() => setMobileOpen(false)} />
					</aside>
					<button
						type="button"
						className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-950"
						aria-label="Fechar menu"
						onClick={() => setMobileOpen(false)}
					>
						<X size={20} />
					</button>
				</div>
			) : null}
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="mercado-header sticky top-0 z-30 border-b bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<button
								type="button"
								className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"
								aria-label="Abrir menu"
								onClick={() => setMobileOpen(true)}
							>
								<Menu size={20} />
							</button>
							<div className="min-w-0">
								<p className="text-xs font-bold text-slate-400">
									Mercado de Retiradas <span className="px-1.5">/</span> Operação
								</p>
								<h2 className="truncate text-xl font-black text-slate-950">
									{title}
								</h2>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<button type="button" className="hidden h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 sm:inline-flex" aria-label="Notificações"><Bell size={19} /></button>
							<div className="hidden text-right sm:block">
								<p className="text-sm font-black text-slate-900">{currentUser?.displayName || currentUser?.nome || currentUser?.email || "Usuário"}</p>
								<p className="text-xs font-semibold text-slate-500">{currentUser?.empresaNome || currentUser?.empresa_nome || currentUser?.profile?.empresa_nome || "Conta Mercado"}</p>
							</div>
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-800"><UserRound size={19} /></div>
						</div>
					</div>
				</header>
				<main className="mercado-page min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
