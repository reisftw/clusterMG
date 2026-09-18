import {
	AlertTriangle,
	BarChart3,
	Bell,
	BookOpen,
	Boxes,
	Building2,
	CalendarClock,
	CalendarDays,
	Car,
	ChevronDown,
	ChevronRight,
	ClipboardCheck,
	ClipboardList,
	Clock,
	CloudLightning,
	FileClock,
	HandCoins,
	HardHat,
	Key,
	KeyRound,
	LayoutDashboard,
	ListChecks,
	Lock as LockIcon,
	LogOut,
	MapPin,
	Mail,
	Menu,
	MessageSquare,
	Package,
	PackageCheck,
	PanelLeftClose,
	PanelLeftOpen,
	Plug,
	QrCode,
	RefreshCw,
	Settings,
	Shield,
	ShieldCheck,
	SlidersHorizontal,
	Star,
	Tags,
	Ticket,
	Trophy,
	Umbrella,
	Users,
	UsersRound,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { fetchRotMenuSettings } from "../api/rotApi";
import { useRotAuth } from "../state/RotAuthContext";
import UserAvatar from "./UserAvatar";
import AprOfflineSync from "./AprOfflineSync";
import WarlinhoLauncher from "./WarlinhoLauncher";

// Reorganizacao do menu pedida pelo usuario: reduzir a quantidade de
// itens visiveis ao mesmo tempo agrupando por tema, com grupos em
// accordion (so um aberto por vez) em vez da lista longa e plana que
// existia antes. Dashboard fica fora de qualquer grupo, sempre visivel
// no topo. Rotas, permissoes e paginas internas NAO mudam — so a
// organizacao visual do menu.
//
// "Avisos" nao apareceu na nova ordem que o usuario descreveu, mas o
// pedido foi explicito em "não remover itens" — mantido dentro de
// Operação (mesmo tema de campo dos demais itens desse grupo).
const ROT_SIDEBAR_COLLAPSED_KEY = "rot-sidebar-collapsed";

import AprAlerts from "./AprAlerts";
import NotificationBell from "./NotificationBell";
const DASHBOARD_ITEM = { label: "Dashboard", path: "/", icon: LayoutDashboard, permission: null, end: true };
const QRCODE_ITEM = { key: "qrcode", label: "QR Code", path: "/admin/qrcodes", icon: QrCode, permission: "rot.qrcodes.view" };

export const OPERATION_MENU_ITEMS = {
	comando: { label: "Centro de Comando", path: "/comando-operacional", icon: BarChart3, permission: "command_center.view" },
	agenda: { label: "Agenda", path: "/atividades", icon: CalendarClock, permission: ["rot.activities.view","rot.activities.manage"] },
	escala: { label: "Escala", path: "/turnos", icon: Clock, permission: ["rot.shifts.view","rot.shifts.manage"] },
	tickets: { label: "Tickets", path: "/chamados", icon: Ticket, permission: ["rot.tickets.view","rot.tickets.manage"] },
	ausencias: { label: "Ausências", path: "/ausencias", icon: Umbrella, permission: ["rot.absences.view","rot.absences.manage","rot.timeoff.view","rot.timeoff.approve","rot.vacations.view","rot.vacations.approve"] },
	rompimentos: { label: "Rompimentos", path: "/rompimentos", icon: Zap, permission: null },
	apr: { label: "APR", path: "/apr", icon: FileClock, permission: null },
	chuva: { label: "Chuva", path: "/chuva", icon: CloudLightning, permission: null },
	feriados: { label: "Feriados", path: "/feriados", icon: CalendarDays, permission: null },
	avisos: { label: "Avisos", path: "/avisos", icon: MessageSquare, permission: null },
	equipamentos: { label: "Meus Ativos", path: "/equipamentos", icon: PackageCheck, permission: null },
	chaves: { label: "Chaves", path: "/chaves", icon: Key, permission: null },
	frotas: { label: "Frotas", path: "/frota", icon: Car, permission: null },
	ranking: { label: "Ranking", path: "/ranking", icon: Trophy, permission: ["rot.ranking.view"] },
	historico: { label: "Histórico", path: "/admin/logs", icon: FileClock, permission: "rot.logs.view" },
	"acerto-estoque": { label: "Acerto de Estoque", path: "/acerto-estoque", icon: ClipboardCheck, permission: ["rot.stock_adjustments.view", "rot.stock_adjustments.manage"] },
	"entrega-tecnicos": { label: "Entrega Técnicos", path: "/entrega-tecnicos", icon: PackageCheck, permission: ["rot.tech_deliveries.view", "rot.tech_deliveries.manage"] },
	"auditoria-bolsa": { label: "Auditoria Bolsa", path: "/auditoria-bolsa", icon: ShieldCheck, permission: ["rot.bag_audit.view", "rot.bag_audit.manage"] },
	"relatorios-auditoria": { label: "Relatórios Auditoria", path: "/relatorios-auditoria", icon: BarChart3, permission: "rot.audit_reports.view" },
};

export const DEFAULT_OPERATION_MENU_CONFIG = {
	ROT: { enabledItems: ["comando", "agenda", "escala", "tickets", "ausencias", "rompimentos", "apr", "chuva", "feriados", "avisos", "equipamentos", "chaves", "frotas", "ranking", "historico"] },
	DELIVERY: { enabledItems: ["comando", "agenda", "escala", "ausencias", "apr", "feriados", "avisos", "acerto-estoque", "entrega-tecnicos", "auditoria-bolsa", "frotas", "relatorios-auditoria"] },
	FIELD: { enabledItems: ["comando", "agenda", "escala", "ausencias", "apr", "feriados", "avisos", "acerto-estoque", "entrega-tecnicos", "auditoria-bolsa", "frotas", "relatorios-auditoria"] },
};

const MANAGEMENT_MENU_ITEMS = {
	usuarios: { label: "Usuários", path: "/admin/usuarios", icon: Users, permission: "rot.users.manage" },
	tecnicos: { label: "Técnicos", path: "/admin/tecnicos", icon: HandCoins, permission: ["rot.technicians.view", "rot.technicians.manage"] },
	agentes: { label: "Agentes", path: "/admin/agentes", icon: Star, permission: ["rot.agents.view", "rot.agents.manage"] },
	regionais: { label: "Regionais", path: "/admin/regionais", icon: MapPin, permission: "rot.regionals.manage" },
	empresas: { label: "Empresas", path: "/admin/empresas", icon: Building2, permission: ["rot.companies.view", "rot.companies.manage"] },
	servicos: { label: "Serviços", path: "/admin/tipos-servico", icon: Tags, permission: "rot.service_types.manage" },
};

const SETTINGS_MENU_ITEMS = {
	geral: { label: "Configurações Gerais", path: "/admin/geral", icon: Settings, permission: null },
	notificacoes: { label: "Notificações", path: "/admin/notificacoes", icon: Bell, permission: null },
	email: { label: "E-mail", path: "/admin/email", icon: Mail, permission: "rot.settings.manage" },
	cargos: { label: "Cargos e Permissões", path: "/admin/cargos", icon: Shield, permission: "rot.users.manage" },
	integracoes: { label: "Integrações e APIs", path: "/admin/integracoes", icon: Plug, permission: "rot.settings.manage" },
};

const ASSETS_SECURITY_MENU_ITEMS = {
	"ativos-overview": { label: "Visão Geral", path: "/ativos-seguranca", icon: LayoutDashboard, permission: "ativos.dashboard.visualizar", end: true },
	ativos: { label: "Ativos", path: "/ativos-seguranca?tab=ativos", icon: Boxes, permission: "ativos.visualizar" },
	checklists: { label: "Checklists", path: "/ativos-seguranca?tab=checklists", icon: ClipboardCheck, permission: "checklists.visualizar" },
	ocorrencias: { label: "Ocorrências", path: "/ativos-seguranca?tab=ocorrencias", icon: AlertTriangle, permission: "ocorrencias.visualizar" },
	transferencias: { label: "Transferências", path: "/ativos-seguranca?tab=transferencias", icon: RefreshCw, permission: "ativos.transferir" },
	devolucoes: { label: "Devoluções", path: "/ativos-seguranca?tab=devolucoes", icon: PackageCheck, permission: "ativos.devolver" },
	manutencoes: { label: "Manutenções", path: "/ativos-seguranca?tab=manutencoes", icon: Settings, permission: "manutencoes.visualizar" },
	bloqueados: { label: "Ativos Bloqueados", path: "/ativos-seguranca?tab=bloqueados", icon: LockIcon, permission: "ativos.bloquear" },
	configuracoes: { label: "Configurações", path: "/ativos-seguranca?tab=configuracoes", icon: SlidersHorizontal, permission: "checklists.configurar" },
};

// Fase B do dominio Seguranca do Trabalho: so o item "Visao Geral" por
// enquanto (pagina real, ainda que com estados vazios). Os demais itens
// (Protocolos, APRs, Quase Acidentes...) entram conforme suas paginas
// forem implementadas nas proximas fases — nao adicionar item vazio so
// pra preencher menu.
const SST_MENU_ITEMS = {
	"sst-overview": { label: "Visão Geral", path: "/seguranca-trabalho", icon: LayoutDashboard, permission: "sst.dashboard.visualizar", end: true },
	"sst-protocolos": { label: "Protocolos", path: "/seguranca-trabalho/protocolos", icon: ClipboardList, permission: null },
	"sst-dss-dashboard": { label: "DSS · Dashboard", path: "/seguranca-trabalho/dss", icon: LayoutDashboard, permission: "dss.dashboard.visualizar", end: true },
	"sst-dss-calendario": { label: "DSS · Calendário", path: "/seguranca-trabalho/dss/calendario", icon: CalendarDays, permission: null },
	"sst-dss-temas": { label: "DSS · Temas", path: "/seguranca-trabalho/dss/temas", icon: BookOpen, permission: "dss.tema.visualizar" },
	"sst-dss-programacao": { label: "DSS · Programação", path: "/seguranca-trabalho/dss/programacao", icon: CalendarClock, permission: "dss.programacao.visualizar" },
	"sst-dss-execucoes": { label: "DSS · Execuções", path: "/seguranca-trabalho/dss/execucoes", icon: ClipboardCheck, permission: null },
	"sst-dss-relatorios": { label: "DSS · Relatórios", path: "/seguranca-trabalho/dss/relatorios", icon: BarChart3, permission: "dss.relatorio.visualizar" },
	"sst-relatorios": { label: "Relatórios", path: "/seguranca-trabalho/relatorios", icon: BarChart3, permission: "sst.relatorio.visualizar" },
};

const OPERATION_MENU_TREE = [
	{
		key: "comando",
		label: "Comando Operacional",
		icon: BarChart3,
		itemKeys: ["comando"],
	},
	{
		key: "planejamento",
		label: "Planejamento",
		icon: CalendarClock,
		itemKeys: ["agenda", "escala", "feriados", "chuva"],
	},
	{
		key: "atendimento",
		label: "Atendimento & Ocorrências",
		icon: Ticket,
		itemKeys: ["tickets", "ausencias", "rompimentos", "avisos"],
	},
	{
		key: "campo-seguranca",
		label: "Campo & Segurança",
		icon: ShieldCheck,
		itemKeys: ["apr", "equipamentos", "chaves", "frotas"],
	},
	{
		key: "estoque-entregas",
		label: "Estoque & Entregas",
		icon: PackageCheck,
		itemKeys: ["acerto-estoque", "entrega-tecnicos"],
	},
	{
		key: "auditoria-desempenho",
		label: "Auditoria & Desempenho",
		icon: BarChart3,
		itemKeys: ["auditoria-bolsa", "relatorios-auditoria", "ranking", "historico"],
	},
];

const MANAGEMENT_MENU_TREE = [
	{
		key: "pessoas",
		label: "Pessoas",
		icon: UsersRound,
		itemKeys: ["usuarios", "tecnicos", "agentes"],
	},
	{
		key: "estrutura",
		label: "Estrutura",
		icon: Building2,
		itemKeys: ["regionais", "empresas"],
	},
	{
		key: "servicos",
		label: "Serviços",
		icon: Tags,
		itemKeys: ["servicos"],
	},
];

const SETTINGS_MENU_TREE = Object.entries(SETTINGS_MENU_ITEMS).map(([key, item]) => ({ key, ...item }));
const ASSETS_SECURITY_MENU_TREE = Object.entries(ASSETS_SECURITY_MENU_ITEMS).map(([key, item]) => ({ key, ...item }));
const SST_MENU_TREE = Object.entries(SST_MENU_ITEMS).map(([key, item]) => ({ key, ...item }));

const MACRO_MENU_TREE = [
	{ key: "operacao", label: "Operação", icon: ListChecks, children: OPERATION_MENU_TREE },
	{ key: "ativos_seguranca", label: "Ativos & Segurança", icon: ShieldCheck, children: ASSETS_SECURITY_MENU_TREE },
	{ key: "seguranca_trabalho", label: "Segurança do Trabalho", icon: HardHat, children: SST_MENU_TREE },
	{ key: "gestao", label: "Gestão", icon: UsersRound, children: MANAGEMENT_MENU_TREE },
	{ key: "configuracoes", label: "Configurações", icon: SlidersHorizontal, children: SETTINGS_MENU_TREE },
];

export default function Shell() {
	const { user, logout } = useRotAuth();
	const navigate = useNavigate();
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [accountMenuOpen, setAccountMenuOpen] = useState(false);
	const accountMenuRef = useRef(null);
	const [collapsed, setCollapsed] = useState(() => {
		try {
			return window.localStorage.getItem(ROT_SIDEBAR_COLLAPSED_KEY) === "true";
		} catch {
			return false;
		}
	});
	const [menuConfig, setMenuConfig] = useState(DEFAULT_OPERATION_MENU_CONFIG);

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

	useEffect(() => {
		let active = true;
		fetchRotMenuSettings()
			.then((data) => {
				if (active && data?.menu) setMenuConfig(data.menu);
			})
			.catch(() => {
				if (active) setMenuConfig(DEFAULT_OPERATION_MENU_CONFIG);
			});
		return () => {
			active = false;
		};
	}, []);

	const setSidebarCollapsed = (value) => {
		setCollapsed(value);
		try {
			window.localStorage.setItem(ROT_SIDEBAR_COLLAPSED_KEY, String(value));
		} catch {
			// LocalStorage pode estar indisponivel em modo privado.
		}
	};

	const sidebar = (
		<RotSidebar
			collapsed={collapsed}
			onToggleCollapsed={() => setSidebarCollapsed(!collapsed)}
			onNavigate={() => setMobileSidebarOpen(false)}
			user={user}
			onLogout={logout}
			menuConfig={menuConfig}
		/>
	);

	return (
		<div className="rot-app-shell flex min-h-dvh overflow-x-hidden bg-slate-100 lg:h-dvh lg:overflow-hidden">
			<AprOfflineSync />
			<div
				className={`${collapsed ? "is-collapsed w-16" : "is-expanded w-72"} hidden h-full shrink-0 shadow-sidebar transition-[width] duration-200 lg:block`}
			>
				{sidebar}
			</div>

			{mobileSidebarOpen ? (
				<div className="fixed inset-0 z-layout-sidebar lg:hidden" role="dialog" aria-modal="true">
					<button
						type="button"
						className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
						aria-label="Fechar menu"
						onClick={() => setMobileSidebarOpen(false)}
					/>
					<aside className="absolute inset-y-0 left-0 w-[min(86vw,320px)] max-w-full shadow-2xl">
						<RotSidebar
							collapsed={false}
							onToggleCollapsed={() => setMobileSidebarOpen(false)}
							onNavigate={() => setMobileSidebarOpen(false)}
							user={user}
							onLogout={logout}
							menuConfig={menuConfig}
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

			<div className="rot-app-content flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
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
							Olá, {(user?.name || user?.username || "Usuário").split(" ")[0]}
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
					<AprAlerts />
					<NotificationBell />
					<div className="relative">
						<div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-card sm:flex">
							<UserAvatar
								src={user?.avatarUrl}
								name={user?.name}
								email={user?.email}
								className="flex h-11 w-11 shrink-0 overflow-hidden rounded-full bg-blue-600 text-xs font-black text-white"
							/>
							<div className="min-w-0">
								<p className="max-w-44 truncate text-sm font-black uppercase text-slate-950">
									{user?.name || "Usuário"}
								</p>
								<p className="truncate text-xs font-semibold text-slate-500">
									{user?.isAdmin ? "Admin" : user?.roleName || "Operação"}
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
												navigate("/perfil");
											}}
											className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
										>
											<LockIcon size={16} />
											Meu perfil / senha
										</button>
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
				<main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,107,0,0.08),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] p-3 sm:p-4 lg:p-6">
					<Outlet />
				</main>
			</div>
			<WarlinhoLauncher />
		</div>
	);
}

function RotSidebar({ collapsed, onToggleCollapsed, onNavigate, user, mobile, onLogout, menuConfig }) {
	const location = useLocation();
	const navigate = useNavigate();
	const activeLocation = `${location.pathname}${location.search}`;

	const visibleTree = useMemo(() => {
		const operationItemKeys = resolveVisibleOperationItemKeys(user, menuConfig);
		return buildVisibleMenuTree(user, operationItemKeys);
	}, [user, menuConfig]);

	const dashboardVisible = canAccess(user, DASHBOARD_ITEM.permission);

	const [openMacroKey, setOpenMacroKey] = useState(null);
	const [openCategoryByMacro, setOpenCategoryByMacro] = useState({});
	useEffect(() => {
		const match = findActiveMenuPath(visibleTree, activeLocation);
		if (!match) return;
		setOpenMacroKey(match.macroKey);
		if (match.categoryKey) {
			setOpenCategoryByMacro((current) => ({ ...current, [match.macroKey]: match.categoryKey }));
		}
	}, [activeLocation, visibleTree]);

	return (
		<div className="flex h-full flex-col border-r border-slate-950 bg-[linear-gradient(180deg,#061b38_0%,#06294d_54%,#04162c_100%)] text-white shadow-sidebar">
			<div className={`${collapsed ? "px-3" : "px-4"} border-b border-white/10 py-4`}>
				<div className={collapsed ? "flex flex-col items-center gap-3" : ""}>
					<img
						src="/rot-menu.png"
						alt="Operação"
						className={`${collapsed ? "w-10" : "w-16"} mx-auto h-auto max-w-full rounded-2xl object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.32)]`}
					/>
					<p className={`${collapsed ? "sr-only" : "mt-3"} text-center text-xs font-semibold text-slate-300`}>
						OPERAÇÃO | Cluster MG
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
			<nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3">
				{dashboardVisible ? (
					<RotLeafItem item={DASHBOARD_ITEM} collapsed={collapsed} onNavigate={onNavigate} activeLocation={activeLocation} activeOverride={isItemActive(DASHBOARD_ITEM, activeLocation)} />
				) : null}
				<RotLeafItem item={QRCODE_ITEM} collapsed={collapsed} onNavigate={onNavigate} activeLocation={activeLocation} activeOverride={isItemActive(QRCODE_ITEM, activeLocation)} />
				<div className={collapsed ? "mt-1 space-y-1" : "mt-2 space-y-1 border-t border-white/10 pt-2"}>
					{visibleTree.map((macro) => (
						<RotMacroArea
							key={macro.key}
							macro={macro}
							collapsed={collapsed}
							onNavigate={onNavigate}
							activeLocation={activeLocation}
							open={!collapsed && openMacroKey === macro.key}
							openCategoryKey={openCategoryByMacro[macro.key] || null}
							onToggle={() => setOpenMacroKey((current) => (current === macro.key ? null : macro.key))}
							onToggleCategory={(categoryKey) => {
								setOpenCategoryByMacro((current) => ({
									...current,
									[macro.key]: current[macro.key] === categoryKey ? null : categoryKey,
								}));
							}}
						/>
					))}
				</div>
			</nav>
			{mobile ? (
				// No mobile, o cabecalho com avatar/Sair fica escondido
				// (breakpoint sm:flex) — sem isso nao haveria como sair ou
				// trocar senha pelo celular.
				<div className="space-y-1 border-t border-white/10 px-2.5 py-3">
					<button
						type="button"
						onClick={() => {
							onNavigate?.();
							navigate("/perfil");
						}}
						className="rot-nav-compact w-full text-slate-300 hover:bg-white/10 hover:text-white"
					>
						<LockIcon size={16} className="shrink-0" />
						<span className="truncate">Meu perfil / senha</span>
					</button>
					<button
						type="button"
						onClick={() => {
							onNavigate?.();
							onLogout?.();
						}}
						className="rot-nav-compact w-full text-slate-300 hover:bg-red-500/20 hover:text-red-200"
					>
						<LogOut size={16} className="shrink-0" />
						<span className="truncate">Sair</span>
					</button>
				</div>
			) : null}
		</div>
	);
}

function RotMacroArea({ macro, collapsed, onNavigate, activeLocation, open, openCategoryKey, onToggle, onToggleCategory }) {
	const Icon = macro.icon;
	const active = hasActiveDescendant(macro, activeLocation);
	return (
		<div className="pt-1">
			<button
				type="button"
				onClick={onToggle}
				className={`group flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
					active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
				}`}
				title={macro.label}
				aria-expanded={open}
			>
				<span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? "bg-blue-500/20 text-blue-100" : "bg-white/5 text-slate-300 group-hover:text-white"}`}>
					<Icon size={18} />
				</span>
				<span className={collapsed ? "sr-only" : "flex-1 truncate text-sm font-black tracking-tight"}>
					{macro.label}
				</span>
				{!collapsed ? (
					<ChevronDown size={16} className={`ml-auto shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
				) : null}
			</button>
			<div
				className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${
					open ? "pointer-events-auto grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
				}`}
			>
				<div className="min-h-0">
					<div className="ml-4 mt-1 space-y-1 border-l border-white/10 py-1 pl-3">
						{macro.children.map((child) => (
							child.children?.length ? (
								<RotCategoryGroup
									key={child.key}
									category={child}
									open={openCategoryKey === child.key}
									active={hasActiveDescendant(child, activeLocation)}
									activeLocation={activeLocation}
									onToggle={() => onToggleCategory(child.key)}
									onNavigate={onNavigate}
								/>
							) : (
								<RotLeafItem key={child.path} item={child} collapsed={false} onNavigate={onNavigate} activeLocation={activeLocation} activeOverride={isItemActive(child, activeLocation)} level={2} />
							)
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function RotCategoryGroup({ category, open, active, activeLocation, onToggle, onNavigate }) {
	const Icon = category.icon;
	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
					active ? "text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"
				}`}
				aria-expanded={open}
			>
				<Icon size={15} className="shrink-0 opacity-90" />
				<span className="min-w-0 flex-1 truncate">{category.label}</span>
				<ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
			</button>
			<div className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? "pointer-events-auto grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"}`}>
				<div className="min-h-0">
					<div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 py-1 pl-3">
						{category.children.map((item) => (
							<RotLeafItem key={item.path} item={item} collapsed={false} onNavigate={onNavigate} activeLocation={activeLocation} activeOverride={isItemActive(item, activeLocation)} level={3} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function RotLeafItem({ item, collapsed, onNavigate, activeOverride, level = 1 }) {
	const Icon = item.icon;
	const showIcon = level < 3;
	return (
		<NavLink
			to={item.path}
			end={Boolean(item.end)}
			onClick={onNavigate}
			className={({ isActive }) => {
				const active = activeOverride ?? isActive;
				return `flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
					active
						? "bg-blue-600 text-white shadow-lg shadow-blue-950/10"
						: level === 3
							? "text-slate-300 hover:bg-white/10 hover:text-white"
							: "text-slate-300 hover:bg-white/10 hover:text-white"
				}`;
			}}
			title={item.label}
		>
			{showIcon ? <Icon size={16} className="shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />}
			<span className={collapsed ? "sr-only" : `truncate ${level === 3 ? "font-semibold" : "font-medium"}`}>{item.label}</span>
			{level < 3 ? <ChevronRight size={14} className={collapsed ? "sr-only" : "ml-auto shrink-0 opacity-50"} /> : null}
		</NavLink>
	);
}

function isItemActive(item, activeLocation) {
	if (!item?.path) return false;
	const [path, query = ""] = String(item.path).split("?");
	const [currentPath, currentQuery = ""] = String(activeLocation || "").split("?");
	if (query) return currentPath === path && currentQuery === query;
	if (item.end) return currentPath === path && !currentQuery;
	return (currentPath === path && !currentQuery) || currentPath.startsWith(`${path}/`);
}

function hasActiveDescendant(node, activeLocation) {
	if (isItemActive(node, activeLocation)) return true;
	return (node.children || []).some((child) => hasActiveDescendant(child, activeLocation));
}

function findActiveMenuPath(tree, activeLocation) {
	for (const macro of tree) {
		if (!hasActiveDescendant(macro, activeLocation)) continue;
		const category = (macro.children || []).find((child) => hasActiveDescendant(child, activeLocation) && child.children?.length);
		return { macroKey: macro.key, categoryKey: category?.key || null };
	}
	return null;
}

function buildVisibleMenuTree(user, operationItemKeys) {
	const itemSources = {
		operacao: OPERATION_MENU_ITEMS,
		ativos_seguranca: ASSETS_SECURITY_MENU_ITEMS,
		seguranca_trabalho: SST_MENU_ITEMS,
		gestao: MANAGEMENT_MENU_ITEMS,
		configuracoes: SETTINGS_MENU_ITEMS,
	};
	const allowedOperationKeys = new Set(operationItemKeys);
	return MACRO_MENU_TREE.map((macro) => {
		if ((macro.key === "gestao" || macro.key === "configuracoes") && !isLeadershipUser(user)) return null;
		const source = itemSources[macro.key] || {};
		const children = (macro.children || []).map((child) => {
			if (child.path) return canAccess(user, child.permission) ? child : null;
			const itemKeys = child.itemKeys || [];
			const items = itemKeys
				.filter((itemKey) => macro.key !== "operacao" || allowedOperationKeys.has(itemKey))
				.map((itemKey) => {
					const item = source[itemKey];
					return item ? { key: itemKey, ...item } : null;
				})
				.filter((item) => item && canAccess(user, item.permission));
			if (!items.length) return null;
			return { key: child.key, label: child.label, icon: child.icon, children: items };
		}).filter(Boolean);
		return children.length ? { key: macro.key, label: macro.label, icon: macro.icon, children } : null;
	}).filter(Boolean);
}

function isLeadershipUser(user) {
	if (!user) return false;
	if (user.isAdmin || user.permissions?.includes("*")) return true;
	const haystack = `${user.role || ""} ${user.roleName || ""}`.toLowerCase();
	return ["supervisor", "lider", "líder", "coordenador", "gerente", "gestor"].some((term) => haystack.includes(term));
}

function canAccess(user, permission) {
	if (!permission) return true;
	if (user?.isAdmin) return true;
	const required = Array.isArray(permission) ? permission : [permission];
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	if (permissions.includes("*")) return true;
	return required.some((item) => permissions.includes(item));
}

function resolveUserScopes(user) {
	if (user?.isAdmin || user?.permissions?.includes("*")) return Object.keys(DEFAULT_OPERATION_MENU_CONFIG);
	const scopes = Array.isArray(user?.operationScopes) ? user.operationScopes : [];
	const normalized = scopes.map((scope) => String(scope || "").trim().toUpperCase()).filter((scope) => DEFAULT_OPERATION_MENU_CONFIG[scope]);
	return [...new Set(normalized)].length ? [...new Set(normalized)] : ["ROT"];
}

function resolveVisibleOperationItemKeys(user, menuConfig) {
	if (user?.isAdmin || user?.permissions?.includes("*")) return Object.keys(OPERATION_MENU_ITEMS);
	const keys = [];
	for (const scope of resolveUserScopes(user)) {
		const enabled = menuConfig?.[scope]?.enabledItems || DEFAULT_OPERATION_MENU_CONFIG[scope]?.enabledItems || [];
		for (const key of enabled) {
			if (OPERATION_MENU_ITEMS[key] && !keys.includes(key)) keys.push(key);
		}
	}
	return keys;
}
