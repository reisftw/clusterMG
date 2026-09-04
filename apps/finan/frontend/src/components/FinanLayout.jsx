import {
	BarChart3,
	Bell,
	Building2,
	ChevronDown,
	ChevronRight,
	CircleDollarSign,
	CreditCard,
	Database,
	FileCheck2,
	FileText,
	LineChart,
	Landmark,
	LayoutDashboard,
	LogOut,
	Mail,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Plug,
	Settings,
	Tags,
	Users,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getAppBuildInfo } from "../../../../../src/utils/appBuildInfo";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";
import {
	FINAN_WELCOME_MODAL_EVENT,
	hasSeenFinanWelcomeModal,
} from "../utils/finanWelcomeModalStorage";
import FinanWelcomeModal from "./FinanWelcomeModal";
import UserAvatar from "./UserAvatar";

const FINAN_SIDEBAR_COLLAPSED_KEY = "finan-sidebar-collapsed";

const navGroups = [
	{
		label: "Visão geral",
		items: [
			{
				label: "Dashboard",
				path: FINAN_ROUTES.DASHBOARD,
				icon: LayoutDashboard,
				permission: "finan.dashboard.view",
			},
		],
	},
	{
		label: "Operação",
		items: [
			{
				label: "Contas a pagar",
				path: FINAN_ROUTES.CONTAS_PAGAR,
				icon: Landmark,
				permission: "finan.contas_pagar.view",
			},
			{
				label: "Contas a receber",
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
				label: "Notas fiscais",
				path: FINAN_ROUTES.NOTAS,
				icon: FileText,
				permission: "finan.notas.view",
			},
		],
	},
	{
		label: "Análises",
		items: [
			{
				label: "Reports",
				path: FINAN_ROUTES.REPORTS,
				icon: BarChart3,
				permission: "finan.reports.view",
				children: [
					{
						label: "Serasa",
						path: FINAN_ROUTES.REPORTS_SERASA,
						icon: ShieldIcon,
					},
					{
						label: "Tarifas",
						path: FINAN_ROUTES.REPORTS_TARIFAS,
						icon: Tags,
						children: [
							{
								label: "Visão Geral",
								path: FINAN_ROUTES.REPORTS_VISAO_GERAL,
								icon: LayoutDashboard,
							},
							{
								label: "Faturas",
								path: FINAN_ROUTES.REPORTS_FATURAS,
								icon: FileText,
							},
							{
								label: "Receitas",
								path: FINAN_ROUTES.REPORTS_RECEITAS,
								icon: LineChart,
							},
							{
								label: "Formas de pagamento",
								path: FINAN_ROUTES.REPORTS_FORMAS_PAGAMENTO,
								icon: CreditCard,
							},
						],
					},
				],
			},
		],
	},
	{
		label: "Planejamento",
		items: [
			{
				label: "Gestão Orçamentária",
				path: FINAN_ROUTES.GESTAO_ORCAMENTARIA,
				icon: CircleDollarSign,
				permission: "finan.gestao_orcamentaria.view",
				children: [
					{
						label: "Visão Geral",
						path: FINAN_ROUTES.ORCAMENTO_VISAO_GERAL,
						icon: LayoutDashboard,
					},
					{
						label: "Dados",
						path: FINAN_ROUTES.DADOS_ORCAMENTARIOS,
						permission: "finan.gestao_orcamentaria.manage",
						icon: FileText,
					},
					{
						label: "Orçamento",
						path: FINAN_ROUTES.ORCAMENTO,
						icon: CircleDollarSign,
					},
					{ label: "DRE", path: FINAN_ROUTES.DRE, icon: LineChart },
					{
						label: "Aprovações",
						path: FINAN_ROUTES.APROVACOES,
						permission: "finan.gestao_orcamentaria.manage",
						icon: FileCheck2,
					},
					{
						label: "Configurações orçamentárias",
						path: FINAN_ROUTES.ORCAMENTO_CONFIGURACOES,
						permission: "finan.gestao_orcamentaria.manage",
						icon: Settings,
					},
				],
			},
		],
	},
	{
		label: "Sistema",
		items: [
			{
				label: "Equipe",
				path: FINAN_ROUTES.EQUIPE,
				icon: Users,
				permission: "finan.equipe.view",
			},
			{
				label: "Configurações gerais",
				path: FINAN_ROUTES.CONFIGURACAO_GERAL,
				icon: Settings,
				permission: "finan.configuracoes.view",
				children: [
					{
						label: "Geral",
						path: FINAN_ROUTES.CONFIGURACAO_GERAL,
						icon: Settings,
					},
					{
						label: "Notificações",
						path: FINAN_ROUTES.CONFIG_NOTIFICACOES,
						icon: Bell,
					},
					{
						label: "Usuários",
						path: FINAN_ROUTES.CONFIG_USUARIOS,
						icon: Users,
					},
					{
						label: "Cargos e Permissões",
						path: FINAN_ROUTES.CONFIG_CARGOS_PERMISSOES,
						icon: FileCheck2,
					},
					{
						label: "Integrações APIs",
						path: FINAN_ROUTES.CONFIG_INTEGRACOES_APIS,
						icon: Plug,
					},
					{
						label: "Hubsoft",
						path: FINAN_ROUTES.CONFIG_HUBSOFT,
						icon: Plug,
					},
					{
						label: "Cvortex",
						path: FINAN_ROUTES.CONFIG_CVORTEX,
						icon: Plug,
					},
					{
						label: "Sênior",
						path: FINAN_ROUTES.CONFIG_SENIOR,
						icon: Plug,
					},
					{
						label: "Banco de dados",
						path: FINAN_ROUTES.CONFIG_BANCO_DADOS,
						icon: Database,
					},
					{
						label: "E-mail",
						path: FINAN_ROUTES.CONFIG_EMAIL,
						icon: Mail,
					},
					{
						label: "Logs de auditoria",
						path: FINAN_ROUTES.CONFIG_LOGS_AUDITORIA,
						icon: LineChart,
					},
				],
			},
		],
	},
];

export default function FinanLayout() {
	const { user, logout } = useFinanAuth();
	const buildInfo = getAppBuildInfo();
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [forcedWelcomeOpen, setForcedWelcomeOpen] = useState(false);
	const [welcomeClosedForUser, setWelcomeClosedForUser] = useState("");
	const [collapsed, setCollapsed] = useState(() => {
		try {
			return window.localStorage.getItem(FINAN_SIDEBAR_COLLAPSED_KEY) === "true";
		} catch {
			return false;
		}
	});

	useEffect(() => {
		const openWelcomeModal = () => setForcedWelcomeOpen(true);
		window.addEventListener(FINAN_WELCOME_MODAL_EVENT, openWelcomeModal);
		return () => {
			window.removeEventListener(FINAN_WELCOME_MODAL_EVENT, openWelcomeModal);
		};
	}, []);

	const setSidebarCollapsed = (value) => {
		setCollapsed(value);
		try {
			window.localStorage.setItem(FINAN_SIDEBAR_COLLAPSED_KEY, String(value));
		} catch {
			// LocalStorage pode estar indisponivel em modo privado.
		}
	};

	const sidebar = (
		<FinanSidebar
			collapsed={collapsed}
			onToggleCollapsed={() => setSidebarCollapsed(!collapsed)}
			onNavigate={() => setMobileSidebarOpen(false)}
			user={user}
		/>
	);
	const currentWelcomeUserKey = user?.uid || user?.id || user?.email || "";
	const showWelcomeModal =
		Boolean(user) &&
		(forcedWelcomeOpen ||
			(welcomeClosedForUser !== currentWelcomeUserKey &&
				!hasSeenFinanWelcomeModal(user)));

	return (
		<div className="flex min-h-dvh overflow-x-hidden bg-slate-100 lg:h-dvh lg:overflow-hidden">
			<div
				className={`${collapsed ? "w-16" : "w-72"} hidden h-full shrink-0 shadow-sidebar transition-[width] duration-200 lg:block`}
			>
				{sidebar}
			</div>

			{mobileSidebarOpen ? (
				<div
					className="fixed inset-0 z-layout-sidebar lg:hidden"
					role="dialog"
					aria-modal="true"
				>
					<button
						type="button"
						className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
						aria-label="Fechar menu"
						onClick={() => setMobileSidebarOpen(false)}
					/>
					<aside className="absolute inset-y-0 left-0 w-[min(86vw,320px)] max-w-full shadow-2xl">
						<FinanSidebar
							collapsed={false}
							onToggleCollapsed={() => setMobileSidebarOpen(false)}
							onNavigate={() => setMobileSidebarOpen(false)}
							user={user}
							mobile
						/>
					</aside>
					<button
						type="button"
						onClick={() => setMobileSidebarOpen(false)}
						className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/15 text-white shadow-lg backdrop-blur"
						aria-label="Fechar menu"
						title="Fechar menu"
					>
						<X size={20} />
					</button>
				</div>
			) : null}

			<div className="flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
				<header className="relative z-layout-topbar flex items-center justify-between gap-2 overflow-visible border-b border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-5 lg:px-8">
					<button
						type="button"
						onClick={() => setMobileSidebarOpen(true)}
						className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
						title="Abrir menu"
						aria-label="Abrir menu"
					>
						<Menu size={20} />
					</button>
					<div className="min-w-0 flex-1 lg:flex-none">
						<h2 className="truncate text-lg font-black text-slate-950">
							Olá, {(user?.name || user?.email || "Usuário").split(" ")[0]}
						</h2>
						<p className="truncate text-xs font-medium text-slate-500">
							{new Date().toLocaleDateString("pt-BR", {
								weekday: "long",
								day: "2-digit",
								month: "long",
								year: "numeric",
							})}
						</p>
					</div>
					<div className="mx-5 hidden min-w-0 flex-1 justify-center xl:flex">
						<div className="inline-flex max-w-full items-center justify-center rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-blue-700 shadow-inner">
							<span className="truncate">
								{buildInfo.version} - {buildInfo.environment || "Produção"}
							</span>
						</div>
					</div>
					<div className="relative">
						<div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-card sm:flex">
							<UserAvatar
								src={user?.avatarUrl}
								name={user?.name}
								email={user?.email}
								className="h-11 w-11 overflow-hidden rounded-full bg-blue-600 text-xs font-black text-white"
							/>
							<div className="min-w-0">
								<p className="max-w-44 truncate text-sm font-black uppercase text-slate-950">
									{user?.name || "Usuário"}
								</p>
								<p className="truncate text-xs font-semibold text-slate-500">
									{user?.isAdmin ? "Admin" : user?.role || "Finan"}
								</p>
							</div>
							<button
								type="button"
								onClick={logout}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-500"
								title="Sair"
								aria-label="Sair"
							>
								<LogOut size={17} />
							</button>
						</div>
					</div>
				</header>
				<main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,107,0,0.08),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] p-3 sm:p-4 lg:p-6">
					<Outlet />
				</main>
			</div>
			<FinanWelcomeModal
				open={showWelcomeModal}
				user={user}
				onClose={() => {
					setForcedWelcomeOpen(false);
					setWelcomeClosedForUser(currentWelcomeUserKey);
				}}
			/>
		</div>
	);
}

function FinanSidebar({ collapsed, onToggleCollapsed, onNavigate, user, mobile }) {
	const location = useLocation();
	const visibleGroups = useMemo(() => {
		return navGroups
			.map((group) => ({
				...group,
				items: group.items
					.map((item) => ({
						...item,
						children: (item.children || []).filter((child) =>
							canAccess(user, child.permission || item.permission),
						),
					}))
					.filter((item) => canAccess(user, item.permission)),
			}))
			.filter((group) => group.items.length);
	}, [user]);

	return (
		<div className="flex h-full flex-col border-r border-slate-950 bg-[linear-gradient(180deg,#061b38_0%,#06294d_54%,#04162c_100%)] text-white shadow-sidebar">
			<div className={`${collapsed ? "px-3" : "px-4"} border-b border-white/10 py-4`}>
				<div className={collapsed ? "flex flex-col items-center gap-3" : ""}>
					<img
						src="/sempre-logo-branca-crop.png"
						alt="Sempre Internet"
						className={`${collapsed ? "w-10" : "w-32"} mx-auto h-auto max-w-full object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.32)]`}
					/>
					<p className={`${collapsed ? "sr-only" : "mt-3"} text-xs font-semibold text-slate-300`}>
						Gestão Financeira
					</p>
					<button
						type="button"
						onClick={onToggleCollapsed}
						className="mt-2 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
						title={mobile ? "Fechar menu" : collapsed ? "Expandir menu" : "Ocultar menu"}
						aria-label={mobile ? "Fechar menu" : collapsed ? "Expandir menu" : "Ocultar menu"}
					>
						{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
					</button>
				</div>
			</div>
			<nav className="flex-1 space-y-3 overflow-y-auto px-2.5 py-3">
				{visibleGroups.map((group) => (
					<div key={group.label} className="space-y-1">
						<p className={collapsed ? "sr-only" : "px-2 text-[10px] font-black uppercase tracking-wider text-slate-400"}>
							{group.label}
						</p>
						{group.items.map((item) => (
							<FinanNavItem
								key={item.path}
								item={item}
								collapsed={collapsed}
								onNavigate={onNavigate}
								pathname={location.pathname}
							/>
						))}
					</div>
				))}
			</nav>
		</div>
	);
}

function FinanNavItem({ item, collapsed, onNavigate, pathname }) {
	const Icon = item.icon;
	const hasChildren = item.children?.length > 0;
	const active = isItemActive(item, pathname);
	const [manualOpen, setManualOpen] = useState(false);
	const open = !collapsed && hasChildren && (manualOpen || active);
	if (hasChildren) {
		return (
			<div>
				<button
					type="button"
					onClick={() => setManualOpen((current) => !current)}
					className={`finan-nav-compact w-full ${
						active
							? "nav-item-modern-active"
							: "text-slate-300 hover:bg-white/10 hover:text-white"
					}`}
					title={item.label}
				>
					<Icon size={16} className="shrink-0" />
					<span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
					{!collapsed ? (
						<ChevronDown
							size={14}
							className={`ml-auto shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
						/>
					) : null}
				</button>
				{open ? (
					<div className="mt-1 space-y-0.5 border-l border-white/10 pl-4">
						{item.children.map((child) => (
							<FinanSubNavItem
								key={child.path}
								item={child}
								onNavigate={onNavigate}
								pathname={pathname}
								level={0}
							/>
						))}
					</div>
				) : null}
			</div>
		);
	}
	return (
		<div>
			<NavLink
				to={item.path}
				end={item.path === FINAN_ROUTES.DASHBOARD}
				onClick={onNavigate}
					className={({ isActive }) =>
					`finan-nav-compact ${isActive ? "nav-item-modern-active" : "text-slate-300 hover:bg-white/10 hover:text-white"}`
				}
				title={item.label}
			>
				<Icon size={16} className="shrink-0" />
				<span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
				<ChevronRight size={14} className={collapsed ? "sr-only" : "ml-auto shrink-0 opacity-50"} />
			</NavLink>
		</div>
	);
}

function FinanSubNavItem({ item, onNavigate, pathname, level }) {
	const Icon = item.icon || ChevronRight;
	const hasChildren = item.children?.length > 0;
	const active = isItemActive(item, pathname);
	const [manualOpen, setManualOpen] = useState(false);
	const open = hasChildren && (manualOpen || active);
	if (hasChildren) {
		return (
			<div>
				<button
					type="button"
					onClick={() => setManualOpen((current) => !current)}
					className={`flex min-h-9 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
						active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
					}`}
					style={{ paddingLeft: `${12 + level * 10}px` }}
				>
					<Icon size={14} className="shrink-0" />
					<span className="min-w-0 flex-1 truncate">{item.label}</span>
					<ChevronDown
						size={13}
						className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
					/>
				</button>
				{open ? (
					<div className="mt-0.5 space-y-0.5">
						{item.children.map((child) => (
							<FinanSubNavItem
								key={child.path}
								item={child}
								onNavigate={onNavigate}
								pathname={pathname}
								level={level + 1}
							/>
						))}
					</div>
				) : null}
			</div>
		);
	}
	return (
		<NavLink
			to={item.path}
			onClick={onNavigate}
			className={({ isActive }) =>
				`flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
					isActive ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
				}`
			}
			style={{ paddingLeft: `${12 + level * 10}px` }}
		>
			<Icon size={14} className="shrink-0" />
			<span className="min-w-0 flex-1 truncate">{item.label}</span>
		</NavLink>
	);
}

function isItemActive(item, pathname) {
	if (!item) return false;
	if (item.path && (pathname === item.path || pathname.startsWith(`${item.path}/`))) {
		return true;
	}
	return (item.children || []).some((child) => isItemActive(child, pathname));
}

function ShieldIcon(props) {
	return <FileCheck2 {...props} />;
}

function canAccess(user, permission) {
	if (!permission) return true;
	if (user?.isAdmin) return true;
	return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}
