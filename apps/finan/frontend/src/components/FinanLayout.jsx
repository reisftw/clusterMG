import {
	BarChart3,
	Bell,
	BellOff,
	Building2,
	CalendarDays,
	ChevronDown,
	ChevronRight,
	CircleDollarSign,
	CreditCard,
	Database,
	FileCheck2,
	FileText,
	KeyRound,
	LineChart,
	Landmark,
	LayoutDashboard,
	Lock as LockIcon,
	LogOut,
	Mail,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Plug,
	ReceiptText,
	Settings,
	Scale,
	Tags,
	Users,
	WalletCards,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";
import { useFinanPinLock } from "../state/FinanPinLockContext";
import {
	FINAN_WELCOME_MODAL_EVENT,
	hasSeenFinanWelcomeModal,
} from "../utils/finanWelcomeModalStorage";
import { disableFinanPush, enableFinanPush, isPushSupported } from "../utils/pushNotifications";
import { fetchFinanPushStatus } from "../api/finanApi";
import FinanWelcomeModal from "./FinanWelcomeModal";
import UserAvatar from "./UserAvatar";

const FINAN_SIDEBAR_COLLAPSED_KEY = "finan-sidebar-collapsed";

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolvePushToggleLabel(pushBusy, pushSubscribed) {
	if (pushBusy) return "Aguarde...";
	return pushSubscribed ? "Desativar notificações" : "Ativar notificações";
}

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
			{
				label: "Calendário Financeiro",
				path: FINAN_ROUTES.CALENDARIO,
				icon: CalendarDays,
				// Aberto a todo mundo de proposito: o calendario e pensado
				// como ponto de entrada do dia a dia (ver visao de produto do
				// Finan). Criar/editar evento e que exige
				// finan.calendario.manage, dentro da propria pagina.
				permission: null,
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
			{
				label: "Relatórios Financeiros",
				path: FINAN_ROUTES.RELATORIOS_FINANCEIROS,
				icon: ReceiptText,
				permission: [
					"relatorios_financeiros:visualizar",
					"relatorios_financeiros:gerenciar",
				],
				children: [
					{
						label: "DRE",
						path: FINAN_ROUTES.DRE,
						icon: LineChart,
						description:
							"Demonstra resultado, receitas, custos, despesas e margens do período.",
					},
					{
						label: "Fluxo de Caixa",
						path: FINAN_ROUTES.RELATORIOS_FLUXO_CAIXA,
						icon: WalletCards,
						description:
							"Acompanha entradas e saídas reais de dinheiro no caixa e nas contas bancárias no regime de caixa.",
					},
					{
						label: "Balanço Patrimonial",
						path: FINAN_ROUTES.RELATORIOS_BALANCO_PATRIMONIAL,
						icon: Scale,
						description:
							"Apresenta ativos, passivos, patrimônio líquido e obrigações da empresa.",
					},
					{
						label: "Conciliação Bancária",
						path: FINAN_ROUTES.RELATORIOS_CONCILIACAO_BANCARIA,
						icon: Landmark,
						description:
							"Cruza lançamentos do sistema com extratos bancários da Sempre Internet.",
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
						// Aberto pra todo mundo de proposito: quem tem
						// finan.configuracoes.view ve as configuracoes admin; quem
						// nao tem ve "Minha conta" (senha/avatar/PIN) no mesmo lugar
						// — ver ConfiguracaoGeralRoute em App.jsx.
						permission: null,
					},
					{
						label: "Notificações",
						path: FINAN_ROUTES.CONFIG_NOTIFICACOES,
						icon: Bell,
						// Tambem aberto pra todo mundo — a API de notificacoes
						// (compat/routes.js: /notifications*) ja nao exige nenhuma
						// permissao especial, so estava escondida no menu.
						permission: null,
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
	const navigate = useNavigate();
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [accountMenuOpen, setAccountMenuOpen] = useState(false);
	const accountMenuRef = useRef(null);
	const [pushSubscribed, setPushSubscribed] = useState(null); // null = ainda nao verificado
	const [pushBusy, setPushBusy] = useState(false);
	const [pushError, setPushError] = useState("");
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

	useEffect(() => {
		if (!accountMenuOpen || !isPushSupported()) return;
		let active = true;
		fetchFinanPushStatus()
			.then((status) => {
				if (active) setPushSubscribed(status.enabled ? status.subscribed : false);
			})
			.catch(() => {
				if (active) setPushSubscribed(false);
			});
		return () => {
			active = false;
		};
	}, [accountMenuOpen]);

	const togglePush = async () => {
		setPushBusy(true);
		setPushError("");
		try {
			if (pushSubscribed) {
				await disableFinanPush();
				setPushSubscribed(false);
			} else {
				await enableFinanPush();
				setPushSubscribed(true);
			}
		} catch (error) {
			setPushError(error?.message || "Não foi possível alterar as notificações.");
		} finally {
			setPushBusy(false);
		}
	};

	useEffect(() => {
		if (!accountMenuOpen) return undefined;
		function onPointerDown(event) {
			if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
				setAccountMenuOpen(false);
			}
		}
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, [accountMenuOpen]);

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
			onLogout={logout}
		/>
	);
	const currentWelcomeUserKey = user?.uid || user?.id || user?.email || "";
	const showWelcomeModal =
		Boolean(user) &&
		(forcedWelcomeOpen ||
			(welcomeClosedForUser !== currentWelcomeUserKey &&
				!hasSeenFinanWelcomeModal(user)));

	return (
		<div className="finan-app-shell flex min-h-dvh overflow-x-hidden bg-slate-100 lg:h-dvh lg:overflow-hidden">
			<div
				className={`finan-app-sidebar-frame ${collapsed ? "is-collapsed w-16" : "is-expanded w-72"} hidden h-full shrink-0 shadow-sidebar transition-[width] duration-200 lg:block`}
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
							onLogout={logout}
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

			<div className="finan-app-content flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
				<header className="finan-app-topbar relative z-layout-topbar flex items-center justify-between gap-2 overflow-visible border-b border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-5 lg:px-8">
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
					<div className="mx-5 hidden min-w-0 flex-1 xl:flex" />
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
								<p className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-500">
									<span>{user?.isAdmin ? "Admin" : user?.role || "Finan"}</span>
									<PinIdleCountdown />
								</p>
							</div>
							<div className="relative" ref={accountMenuRef}>
								<button
									type="button"
									onClick={() => setAccountMenuOpen((current) => !current)}
									className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
									title="Segurança da conta"
									aria-label="Segurança da conta"
									aria-expanded={accountMenuOpen}
								>
									<KeyRound size={17} />
								</button>
								{accountMenuOpen ? (
									<div className="absolute right-0 top-11 z-layout-topbar w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-2xl">
										<button
											type="button"
											onClick={() => {
												setAccountMenuOpen(false);
												navigate(FINAN_ROUTES.PASSWORD_CHANGE);
											}}
											className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
										>
											<LockIcon size={16} />
											Trocar senha
										</button>
										<button
											type="button"
											onClick={() => {
												setAccountMenuOpen(false);
												navigate(FINAN_ROUTES.PIN_SETUP);
											}}
											className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
										>
											<KeyRound size={16} />
											PIN
										</button>
										{isPushSupported() ? (
											<button
												type="button"
												onClick={togglePush}
												disabled={pushBusy || pushSubscribed === null}
												className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
											>
												{pushSubscribed ? <BellOff size={16} /> : <Bell size={16} />}
												{resolvePushToggleLabel(pushBusy, pushSubscribed)}
											</button>
										) : null}
										{pushError ? (
											<p className="px-4 py-1.5 text-xs text-red-600">{pushError}</p>
										) : null}
									</div>
								) : null}
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
				<main className="finan-app-main min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,107,0,0.08),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] p-3 sm:p-4 lg:p-6">
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

function FinanSidebar({ collapsed, onToggleCollapsed, onNavigate, user, mobile, onLogout }) {
	const location = useLocation();
	const navigate = useNavigate();
	const visibleGroups = useMemo(() => {
		return navGroups
			.map((group) => ({
				...group,
				items: group.items
					.map((item) => ({
						...item,
						children: (item.children || []).filter((child) => {
							// "in" (nao so falsy) pra distinguir "filho define
							// permission explicitamente (mesmo null)" de "filho nao
							// define nada, herda do pai" — ver Geral/Notificacoes
							// acima, que usam permission: null de proposito.
							const effectivePermission =
								"permission" in child ? child.permission : item.permission;
							return canAccess(user, effectivePermission);
						}),
					}))
					// O item pai aparece se ele proprio for acessivel OU se sobrou
					// pelo menos um filho visivel (caso de Configuracoes gerais:
					// Geral/Notificacoes ficam visiveis pra todo mundo mesmo que o
					// resto dos filhos exija finan.configuracoes.view).
					.filter((item) => canAccess(user, item.permission) || item.children.length > 0),
			}))
			.filter((group) => group.items.length);
	}, [user]);

	return (
		<div className="finan-app-sidebar-panel flex h-full flex-col border-r border-slate-950 bg-[linear-gradient(180deg,#061b38_0%,#06294d_54%,#04162c_100%)] text-white shadow-sidebar">
			<div className={`${collapsed ? "px-3" : "px-4"} border-b border-white/10 py-4`}>
				<div className={collapsed ? "flex flex-col items-center gap-3" : ""}>
					<img
						src="/sidebar-logo.png"
						alt="Finan"
						className={`${collapsed ? "w-10" : "w-16"} mx-auto h-auto max-w-full rounded-2xl object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.32)]`}
					/>
					<p className={`${collapsed ? "sr-only" : "mt-3"} text-center text-xs font-semibold text-slate-300`}>
						FINAN | Gestão Financeira
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
			{mobile ? (
				// No mobile/PWA, o cabecalho com avatar/Sair fica escondido
				// (breakpoint sm:flex) — sem isto, nao existia NENHUM jeito de
				// sair ou trocar senha/PIN pelo celular.
				<div className="space-y-1 border-t border-white/10 px-2.5 py-3">
					<button
						type="button"
						onClick={() => {
							onNavigate?.();
							navigate(FINAN_ROUTES.PASSWORD_CHANGE);
						}}
						className="finan-nav-compact w-full text-slate-300 hover:bg-white/10 hover:text-white"
					>
						<LockIcon size={16} className="shrink-0" />
						<span className="truncate">Trocar senha</span>
					</button>
					<button
						type="button"
						onClick={() => {
							onNavigate?.();
							navigate(FINAN_ROUTES.PIN_SETUP);
						}}
						className="finan-nav-compact w-full text-slate-300 hover:bg-white/10 hover:text-white"
					>
						<KeyRound size={16} className="shrink-0" />
						<span className="truncate">PIN de bloqueio</span>
					</button>
					<button
						type="button"
						onClick={() => {
							onNavigate?.();
							onLogout?.();
						}}
						className="finan-nav-compact w-full text-slate-300 hover:bg-red-500/20 hover:text-red-200"
					>
						<LogOut size={16} className="shrink-0" />
						<span className="truncate">Sair</span>
					</button>
				</div>
			) : null}
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
					title={item.description || item.label}
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
				title={item.description || item.label}
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
					title={item.description || item.label}
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
			title={item.description || item.label}
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

// Contador de inatividade (so em aba de navegador normal, nao no PWA
// instalado — la o bloqueio e imediato ao voltar de background). Fica ao
// lado do cargo do usuario no cabecalho; pisca vermelho nos ultimos 20% do
// tempo configurado, pra avisar antes de travar.
function PinIdleCountdown() {
	const { isStandalone, secondsRemaining, idleTimeoutMinutes } = useFinanPinLock();
	if (isStandalone || secondsRemaining === null) return null;

	const totalSeconds = Math.max(60, Math.round(idleTimeoutMinutes * 60));
	const isUrgent = secondsRemaining <= totalSeconds * 0.2;
	const minutes = Math.floor(secondsRemaining / 60);
	const seconds = secondsRemaining % 60;
	const label = `${minutes}:${String(seconds).padStart(2, "0")}`;

	return (
		<span
			className={`font-mono ${isUrgent ? "animate-pulse font-black text-red-600" : "text-slate-400"}`}
			title="Tempo até o bloqueio automático por inatividade"
		>
			· {label}
		</span>
	);
}

function canAccess(user, permission) {
	if (!permission) return true;
	if (user?.isAdmin) return true;
	const required = Array.isArray(permission) ? permission : [permission];
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	if (permissions.includes("*")) return true;
	return required.some((item) => permissions.includes(item));
}
