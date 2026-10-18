import {
	ArrowLeft,
	Bell,
	ChevronRight,
	ClipboardList,
	House,
	LayoutDashboard,
	LogOut,
	Map,
	Menu,
	MessageCircle,
	Moon,
	PackageSearch,
	Settings,
	ShieldCheck,
	Sun,
	Target,
	Trophy,
	UserRound,
	X,
} from "lucide-react";
import { useEffect } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { hasAnyPermission } from "../../constants/roles";
import { useAuthContext } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { ROUTES } from "../../router/routes";

const PRIMARY_MOBILE_PATHS = new Set([
	ROUTES.DASHBOARD,
	ROUTES.RETIRADAS,
	ROUTES.TENTATIVAS,
	ROUTES.MAPA,
]);

const BOTTOM_NAV_ITEMS = [
	{
		label: "Início",
		path: ROUTES.DASHBOARD,
		icon: House,
		permission: ["view_dashboard", "destaque.dashboard.view"],
	},
	{
		label: "Minhas OS",
		path: ROUTES.RETIRADAS,
		icon: ClipboardList,
		permission: ["view_retiradas", "retiradas.view", "retiradas.manage"],
	},
	{
		label: "Tentativas",
		path: ROUTES.TENTATIVAS,
		icon: MessageCircle,
		permission: [
			"tentativas.visualizar",
			"tentativas.executar",
			"tentativas.distribuir",
		],
	},
	{
		label: "Mapa",
		path: ROUTES.MAPA,
		icon: Map,
		permission: ["view_mapa", "destaque.mapa_os.view"],
	},
];

const MORE_GROUPS = [
	{
		id: "operacao",
		label: "Operação",
		items: [
			{
				label: "Acompanhamento",
				path: ROUTES.ACOMPANHAMENTO,
				icon: LayoutDashboard,
				permission: [
					"view_agendamentos",
					"cliente.agendamentos.view",
					"cliente.agendamentos.manage",
				],
			},
			{
				label: "Agendamentos",
				path: ROUTES.AGENDAMENTOS,
				icon: ClipboardList,
				permission: [
					"view_agendamentos",
					"cliente.agendamentos.view",
					"cliente.agendamentos.manage",
				],
			},
			{
				label: "Ranking",
				path: ROUTES.RANKING,
				icon: Trophy,
				permission: ["view_metas", "destaque.metas.view", "destaque.metas.manage"],
			},
			{
				label: "Metas",
				path: ROUTES.METAS,
				icon: Target,
				permission: ["view_metas", "destaque.metas.view", "destaque.metas.manage"],
			},
			{
				label: "Movimentações",
				path: ROUTES.MOVIMENTACOES,
				icon: PackageSearch,
				permission: ["movimentacoes.view", "movimentacoes.manage"],
			},
		],
	},
	{
		id: "ordens",
		label: "Ordens de serviço",
		items: [
			{
				label: "Cancelamentos",
				path: ROUTES.ORDENS_SERVICO_CANCELAMENTOS,
				icon: ClipboardList,
				permission: [
					"service_orders.cancellations.view",
					"service_orders.cancellations.manage",
					"manage_metas",
					"view_metas",
				],
			},
			{
				label: "Multas",
				path: ROUTES.ORDENS_SERVICO_MULTAS,
				icon: ShieldCheck,
				permission: [
					"service_orders.fines.view",
					"service_orders.fines.simulate",
					"manage_metas",
					"view_metas",
				],
			},
			{
				label: "Recuperação de ativos",
				path: ROUTES.ORDENS_SERVICO_RECUPERACAO_ATIVOS,
				icon: PackageSearch,
				permission: [
					"service_orders.asset_recovery.view",
					"tecnicos.auditoria_bolsa.view",
					"tecnicos.auditoria_bolsa.manage",
					"movimentacoes.view",
					"movimentacoes.manage",
				],
			},
		],
	},
	{
		id: "gestao",
		label: "Gestão e administração",
		items: [
			{
				label: "Relatórios",
				path: ROUTES.RELATORIOS,
				icon: ClipboardList,
				permission: ["view_relatorios", "relatorios.view"],
			},
			{
				label: "Usuários",
				path: ROUTES.USUARIOS,
				icon: UserRound,
				permission: [
					"manage_users",
					"configuracao.usuarios.view",
					"configuracao.usuarios.manage",
				],
			},
			{
				label: "Cargos e permissões",
				path: ROUTES.CARGOS_PERMISSOES,
				icon: ShieldCheck,
				permission: [
					"manage_roles",
					"configuracao.cargos_permissoes.view",
					"configuracao.cargos_permissoes.manage",
				],
			},
			{
				label: "Configurações",
				path: ROUTES.CONFIGURACOES_GERAIS,
				icon: Settings,
				permission: [
					"manage_general_settings",
					"configuracao.geral.view",
					"configuracao.geral.manage",
				],
			},
		],
	},
];

function canAccess(currentUser, permission) {
	return !permission || hasAnyPermission(currentUser, permission);
}

function isPathActive(pathname, path) {
	if (path === ROUTES.DASHBOARD) return pathname === path || pathname === ROUTES.APP;
	return pathname === path || pathname.startsWith(`${path}/`);
}

export function MobilePageContainer({ children }) {
	return (
		<div className="mx-auto w-full max-w-[104rem] pb-[calc(6.75rem+env(safe-area-inset-bottom))] lg:max-w-none lg:pb-0">
			{children}
		</div>
	);
}

export function MobileHeader({ title, onOpenMore }) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { currentUser } = useAuthContext();
	const canViewNotifications = canAccess(currentUser, [
		"manage_general_settings",
		"configuracao.notificacoes.view",
		"configuracao.notificacoes.manage",
	]);
	const isPrimary = PRIMARY_MOBILE_PATHS.has(pathname) || pathname === ROUTES.APP;

	const goBack = () => {
		if (window.history.length > 1) {
			navigate(-1);
			return;
		}
		navigate(ROUTES.DASHBOARD, { replace: true });
	};

	return (
		<header className="sticky top-0 z-layout-topbar border-b border-slate-200/80 bg-white/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
			<div className="flex min-h-11 items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					{isPrimary ? (
						<Link
							to={ROUTES.DASHBOARD}
							className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm"
							aria-label="Ir para início"
							title="Início"
						>
							<img src="/cluster-mg.png" alt="Sempre Internet" className="h-7 w-7 rounded-lg object-cover" />
						</Link>
					) : (
						<button
							type="button"
							onClick={goBack}
							className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
							aria-label="Voltar"
							title="Voltar"
						>
							<ArrowLeft size={20} />
						</button>
					)}
					<div className="min-w-0">
						<p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-sky-600">Retiradas</p>
						<h1 className="truncate text-base font-black text-slate-950 dark:text-white">{title}</h1>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{canViewNotifications ? (
						<Link to={ROUTES.NOTIFICACOES} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Notificações" title="Notificações">
							<Bell size={19} />
						</Link>
					) : null}
					<button type="button" onClick={onOpenMore} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Abrir mais opções" title="Mais">
						<Menu size={21} />
					</button>
				</div>
			</div>
		</header>
	);
}

export function MobileBottomNav({ onOpenMore }) {
	const { pathname } = useLocation();
	const { currentUser } = useAuthContext();

	return (
		<nav className="fixed inset-x-0 bottom-0 z-layout-sidebar border-t border-slate-200/90 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_34px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 lg:hidden" aria-label="Navegação principal">
			<div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
				{BOTTOM_NAV_ITEMS.map((item) => {
					const Icon = item.icon;
					const allowed = canAccess(currentUser, item.permission);
					const active = isPathActive(pathname, item.path);
					const className = `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition ${
						active
							? "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
							: allowed
								? "text-slate-500 active:bg-slate-100 dark:text-slate-400 dark:active:bg-slate-800"
								: "cursor-not-allowed text-slate-300 dark:text-slate-700"
					}`;

					return allowed ? (
						<NavLink key={item.path} to={item.path} className={className}>
							<Icon size={20} strokeWidth={active ? 2.6 : 2} />
							<span className="max-w-full truncate">{item.label}</span>
						</NavLink>
					) : (
						<span key={item.path} className={className} aria-disabled="true">
							<Icon size={20} />
							<span className="max-w-full truncate">{item.label}</span>
						</span>
					);
				})}
				<button type="button" onClick={onOpenMore} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition ${pathname !== ROUTES.DASHBOARD && !BOTTOM_NAV_ITEMS.some((item) => isPathActive(pathname, item.path)) ? "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : "text-slate-500 active:bg-slate-100 dark:text-slate-400 dark:active:bg-slate-800"}`} aria-label="Mais opções">
					<Menu size={21} />
					<span>Mais</span>
				</button>
			</div>
		</nav>
	);
}

export function MobileMoreSheet({ open, onClose }) {
	const { currentUser, signOut } = useAuthContext();
	const { isDark, toggleTheme } = useTheme();

	useEffect(() => {
		if (!open) return undefined;
		const onKeyDown = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, open]);

	if (!open) return null;

	const canViewNotifications = canAccess(currentUser, [
		"manage_general_settings",
		"configuracao.notificacoes.view",
		"configuracao.notificacoes.manage",
	]);

	return (
		<div className="fixed inset-0 z-layout-modal lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
			<button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} aria-label="Fechar mais opções" />
			<section className="absolute inset-x-0 bottom-0 max-h-[min(80dvh,46rem)] overflow-y-auto rounded-t-[1.75rem] bg-slate-50 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:bg-slate-950">
				<div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
				<div className="mb-5 flex items-start justify-between gap-3">
					<div>
						<p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-600">Navegação</p>
						<h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Mais opções</h2>
					</div>
					<button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300" aria-label="Fechar"><X size={20} /></button>
				</div>

				<div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-950 p-4 text-white shadow-lg">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-400 text-slate-950"><UserRound size={21} /></div>
					<div className="min-w-0">
						<p className="truncate text-sm font-black">{currentUser?.nome || "Usuário"}</p>
						<p className="truncate text-xs font-medium text-slate-300">{currentUser?.email || "Conta autenticada"}</p>
					</div>
				</div>

				<div className="space-y-4">
					{MORE_GROUPS.map((group) => {
						const items = group.items.filter((item) => canAccess(currentUser, item.permission));
						if (!items.length) return null;
						return (
							<section key={group.id}>
								<h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{group.label}</h3>
								<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
									{items.map((item, index) => {
										const Icon = item.icon;
										return (
											<NavLink key={item.path} to={item.path} onClick={onClose} className={`flex min-h-14 items-center gap-3 px-4 text-sm font-bold text-slate-800 transition active:bg-sky-50 dark:text-slate-100 dark:active:bg-sky-500/10 ${index ? "border-t border-slate-100 dark:border-slate-800" : ""}`}>
												<span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Icon size={18} /></span>
												<span className="min-w-0 flex-1 truncate">{item.label}</span>
												<ChevronRight size={18} className="shrink-0 text-slate-400 dark:text-slate-500" />
											</NavLink>
										);
									})}
								</div>
							</section>
						);
					})}

					<section>
						<h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Minha conta</h3>
						<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
							{canViewNotifications ? <NavLink to={ROUTES.NOTIFICACOES} onClick={onClose} className="flex min-h-14 items-center gap-3 px-4 text-sm font-bold text-slate-800 active:bg-sky-50 dark:text-slate-100 dark:active:bg-sky-500/10"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Bell size={18} /></span><span className="flex-1">Notificações</span><ChevronRight size={18} className="text-slate-400" /></NavLink> : null}
							<button type="button" onClick={toggleTheme} className={`flex min-h-14 w-full items-center gap-3 px-4 text-left text-sm font-bold text-slate-800 active:bg-sky-50 dark:text-slate-100 dark:active:bg-sky-500/10 ${canViewNotifications ? "border-t border-slate-100 dark:border-slate-800" : ""}`}><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">{isDark ? <Sun size={18} /> : <Moon size={18} />}</span><span className="flex-1">{isDark ? "Tema claro" : "Tema escuro"}</span><ChevronRight size={18} className="text-slate-400" /></button>
							<button type="button" onClick={signOut} className="flex min-h-14 w-full items-center gap-3 border-t border-slate-100 px-4 text-left text-sm font-bold text-red-600 active:bg-red-50 dark:border-slate-800 dark:active:bg-red-500/10"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600"><LogOut size={18} /></span><span>Sair</span></button>
						</div>
					</section>
				</div>
			</section>
		</div>
	);
}
