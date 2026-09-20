import {
	Bell,
	BellOff,
	ChevronDown,
	ChevronRight,
	KeyRound,
	Lock as LockIcon,
	LogOut,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Star,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { FINAN_ROUTES } from "../routes";
import { flattenNavItems, NAV_SECTIONS } from "../navigationConfig";
import { useFinanAuth } from "../state/useFinanAuth";
import { useFinanPinLock } from "../state/useFinanPinLock";
import {
	FINAN_WELCOME_MODAL_EVENT,
	hasSeenFinanWelcomeModal,
} from "../utils/finanWelcomeModalStorage";
import { disableFinanPush, enableFinanPush, isPushSupported } from "../utils/pushNotifications";
import {
	fetchFinanBusca,
	fetchFinanContadoresNavegacao,
	fetchFinanFavoritos,
	fetchFinanNotifications,
	fetchFinanPushStatus,
	markFinanNotificationsRead,
	saveFinanFavoritos,
} from "../api/finanApi";
import FinanceirinhoLauncher from "./FinanceirinhoLauncher";
import FinanCommandPalette from "./FinanCommandPalette";
import FinanWelcomeModal from "./FinanWelcomeModal";
import UserAvatar from "./UserAvatar";

const FINAN_SIDEBAR_COLLAPSED_KEY = "finan-sidebar-collapsed";
const FINAN_ADMIN_SECTION_OPEN_KEY = "finan-sidebar-admin-open";

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolvePushToggleLabel(pushBusy, pushSubscribed) {
	if (pushBusy) return "Aguarde...";
	return pushSubscribed ? "Desativar notificações" : "Ativar notificações";
}

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
	// Contadores dos badges (Pendências/Caixa de Entrada/Notificações) —
	// carregados 1x aqui e compartilhados entre o sino do topbar e os itens
	// do menu lateral, pra não duplicar polling. Mesmo intervalo de 30s que
	// o sino já usava sozinho antes desta refatoração.
	const [navCounters, setNavCounters] = useState({});
	const refreshNavCounters = useCallback(() => {
		fetchFinanContadoresNavegacao()
			.then(setNavCounters)
			.catch(() => {});
	}, []);

	useEffect(() => {
		refreshNavCounters();
		const interval = window.setInterval(refreshNavCounters, 30000);
		return () => window.clearInterval(interval);
	}, [refreshNavCounters]);

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
			counters={navCounters}
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
							counters={navCounters}
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
					<GlobalSearchBar />
					<div className="flex items-center gap-2">
						<FinanNotificationBell unreadCount={navCounters.notificacoes || 0} onRead={refreshNavCounters} />
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
			<FinanceirinhoLauncher />
			<FinanCommandPalette />
		</div>
	);
}

// Badge genérico e reutilizável (seção 4 do pedido de refatoração do
// menu): pequeno, discreto, alinhado à direita, nunca muda a largura do
// item, nunca aparece pra 0/null/undefined, e mostra "99+" acima de 99.
// `tone` só muda a cor pra diferenciar prioridade visual (seção 23):
// "critical" (Pendências, exige ação), "default" (Caixa de Entrada),
// "subtle" (Notificações, mais discreto).
const MENU_BADGE_TONES = {
	critical: "bg-red-500 text-white",
	default: "bg-blue-600 text-white",
	subtle: "bg-slate-500 text-white",
};

function MenuBadge({ count, tone = "default", className = "" }) {
	const value = Number(count || 0);
	if (!value) return null;
	return (
		<span
			className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-black leading-none ${MENU_BADGE_TONES[tone] || MENU_BADGE_TONES.default} ${className}`}
		>
			{value > 99 ? "99+" : value}
		</span>
	);
}

function badgeToneForKey(badgeKey) {
	if (badgeKey === "pendencias") return "critical";
	if (badgeKey === "notificacoes") return "subtle";
	return "default";
}

function canAccess(user, permission) {
	if (!permission) return true;
	if (user?.isAdmin) return true;
	const required = Array.isArray(permission) ? permission : [permission];
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	if (permissions.includes("*")) return true;
	return required.some((item) => permissions.includes(item));
}

// Filtra a árvore de navegação pra só o que o usuário pode ver — mesma
// lógica de antes (filho com `permission` própria, mesmo null, sobrepõe a
// do pai; pai aparece se ele mesmo for acessível OU sobrou filho visível).
function filterSectionsByPermission(sections, user) {
	return sections
		.map((section) => ({
			...section,
			items: filterItemsByPermission(section.items, user),
		}))
		.filter((section) => section.items.length > 0);
}

function filterItemsByPermission(items, user) {
	return items
		.map((item) => {
			const children = item.children ? filterItemsByPermission(item.children, user) : undefined;
			return { ...item, children };
		})
		.filter((item) => canAccess(user, item.permission) || (item.children && item.children.length > 0));
}

function isItemActive(item, pathname) {
	if (!item) return false;
	if (item.path && (pathname === item.path || pathname.startsWith(`${item.path}/`))) {
		return true;
	}
	return (item.children || []).some((child) => isItemActive(child, pathname));
}

// Acha o id do item de topo (dentro de uma seção) cuja subárvore contém a
// rota ativa — usado pra manter o acordeão certo aberto sozinho ao navegar
// direto pra uma sub-rota ou dar F5 na página (seção 9 do pedido).
function findActiveTopItemId(sections, pathname) {
	for (const section of sections) {
		for (const item of section.items) {
			if (item.children?.length && isItemActive(item, pathname)) return item.id;
		}
	}
	return null;
}

function FinanSidebar({ collapsed, onToggleCollapsed, onNavigate, user, mobile, onLogout, counters }) {
	const location = useLocation();
	const navigate = useNavigate();
	const pathname = location.pathname;

	const visibleSections = useMemo(() => filterSectionsByPermission(NAV_SECTIONS, user), [user]);
	const visibleFlatItems = useMemo(() => flattenNavItems(visibleSections), [visibleSections]);

	// Acordeão único: só 1 item de topo (com filhos) aberto por vez em toda
	// a sidebar, qualquer seção — abrir um fecha o anterior. Sincroniza
	// sozinho com a rota ativa no load/navegação.
	const [openItemId, setOpenItemId] = useState(() => findActiveTopItemId(visibleSections, pathname));
	useEffect(() => {
		const activeId = findActiveTopItemId(visibleSections, pathname);
		// Sincronização intencional com a rota ativa a cada navegação — o
		// acordeão precisa refletir de imediato qual item corresponde à URL
		// atual.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (activeId) setOpenItemId(activeId);
	}, [pathname, visibleSections]);

	// Seção Administração fica colapsada por padrão (baixa prioridade
	// visual no dia a dia) — mas abre sozinha se a rota ativa estiver nela,
	// e lembra a última escolha do usuário na sessão via localStorage.
	const [adminSectionOpen, setAdminSectionOpen] = useState(() => {
		try {
			return window.localStorage.getItem(FINAN_ADMIN_SECTION_OPEN_KEY) === "true";
		} catch {
			return false;
		}
	});
	useEffect(() => {
		const adminSection = visibleSections.find((section) => section.id === "administracao");
		// Abre a seção Administração sozinha quando a rota ativa está nela —
		// sincronização intencional com a navegação, não um valor derivado
		// puro (o usuário pode fechar de novo manualmente depois).
		if (adminSection?.items.some((item) => isItemActive(item, pathname))) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setAdminSectionOpen(true);
		}
	}, [pathname, visibleSections]);
	const toggleAdminSection = () => {
		setAdminSectionOpen((current) => {
			const next = !current;
			try {
				window.localStorage.setItem(FINAN_ADMIN_SECTION_OPEN_KEY, String(next));
			} catch {
				// LocalStorage pode estar indisponivel em modo privado.
			}
			return next;
		});
	};

	// Favoritos (roteiro Finan #21) — mesma infraestrutura de backend já
	// usada no widget do Dashboard (finan_user_preferences), só que aqui
	// qualquer item de rota da própria navegação pode ser fixado (em vez de
	// um catálogo fixo separado), então não duplicamos rota/ícone/permissão.
	const [favoritos, setFavoritos] = useState([]);
	useEffect(() => {
		fetchFinanFavoritos()
			.then(setFavoritos)
			.catch(() => setFavoritos([]));
	}, []);
	const favoritosVisiveis = useMemo(() => {
		const byPath = new Map(visibleFlatItems.filter((item) => item.path).map((item) => [item.path, item]));
		return favoritos
			.map((fav) => byPath.get(fav.path))
			.filter(Boolean);
	}, [favoritos, visibleFlatItems]);
	const isFavorito = useCallback((path) => favoritos.some((fav) => fav.path === path), [favoritos]);
	const toggleFavorito = useCallback(
		(item) => {
			if (!item?.path) return;
			const exists = favoritos.some((fav) => fav.path === item.path);
			const next = exists ? favoritos.filter((fav) => fav.path !== item.path) : [...favoritos, { path: item.path, label: item.label }];
			setFavoritos(next);
			saveFinanFavoritos(next).catch(() => {
				// melhor esforco: mantem o estado local ate a proxima carga
			});
		},
		[favoritos],
	);

	return (
		<div className="finan-app-sidebar-panel flex h-full flex-col border-r border-slate-950 bg-[linear-gradient(180deg,#061b38_0%,#06294d_54%,#04162c_100%)] text-white shadow-sidebar">
			<div className={`${collapsed ? "px-3" : "px-4"} border-b border-white/10 py-4`}>
				<div className={collapsed ? "flex flex-col items-center gap-3" : ""}>
					<img
						src="/sidebar-logo.webp"
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

			{!collapsed ? (
				<SidebarSearch
					items={visibleFlatItems}
					onNavigate={(path) => {
						navigate(path);
						onNavigate?.();
					}}
				/>
			) : null}

			<nav className="flex-1 space-y-3 overflow-y-auto px-2.5 py-3">
				{!collapsed && favoritosVisiveis.length ? (
					<div className="space-y-1">
						<p className="flex items-center gap-1.5 px-2 text-[10px] font-black uppercase tracking-wider text-amber-300/90">
							<Star size={11} className="fill-amber-300 text-amber-300" />
							Favoritos
						</p>
						{favoritosVisiveis.map((item) => (
							<FinanLeafLink
								key={`fav-${item.id}`}
								item={item}
								collapsed={collapsed}
								onNavigate={onNavigate}
								pathname={pathname}
								counters={counters}
								isFavorito={isFavorito}
								onToggleFavorito={toggleFavorito}
							/>
						))}
					</div>
				) : null}

				{visibleSections.map((section) => {
					if (section.id === "administracao") {
						return (
							<div key={section.id} className="space-y-1">
								<button
									type="button"
									onClick={toggleAdminSection}
									aria-expanded={adminSectionOpen}
									className="flex w-full items-center justify-between px-2 py-1 text-left"
								>
									<span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
										{collapsed ? "" : section.label}
									</span>
									{!collapsed ? (
										<ChevronDown
											size={12}
											className={`text-slate-500 transition ${adminSectionOpen ? "rotate-180" : ""}`}
										/>
									) : null}
								</button>
								{collapsed || adminSectionOpen ? (
									<div className="space-y-1">
										{section.items.map((item) => (
											<FinanNavItem
												key={item.id}
												item={item}
												collapsed={collapsed}
												onNavigate={onNavigate}
												pathname={pathname}
												openItemId={openItemId}
												setOpenItemId={setOpenItemId}
												counters={counters}
												isFavorito={isFavorito}
												onToggleFavorito={toggleFavorito}
											/>
										))}
									</div>
								) : null}
							</div>
						);
					}
					return (
						<div key={section.id} className="space-y-1">
							<p className={collapsed ? "sr-only" : "px-2 text-[10px] font-black uppercase tracking-wider text-slate-400"}>
								{section.label}
							</p>
							{section.items.map((item) => (
								<FinanNavItem
									key={item.id}
									item={item}
									collapsed={collapsed}
									onNavigate={onNavigate}
									pathname={pathname}
									openItemId={openItemId}
									setOpenItemId={setOpenItemId}
									counters={counters}
									isFavorito={isFavorito}
									onToggleFavorito={toggleFavorito}
								/>
							))}
						</div>
					);
				})}
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

// Busca local do menu (seção 8 do pedido) — distinta da GlobalSearchBar do
// topbar (que busca no backend por fornecedores/contratos/integrações).
// Essa aqui só varre a árvore de navegação já carregada, sem request
// nenhum: título + palavras-chave (`keywords`), sem acento-sensibilidade.
function normalizeSearchText(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
}

function SidebarSearch({ items, onNavigate }) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const boxRef = useRef(null);

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
		};
		window.addEventListener("mousedown", handleClickOutside);
		return () => window.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const normalizedQuery = normalizeSearchText(query.trim());
	const results = useMemo(() => {
		if (normalizedQuery.length < 2) return [];
		return items
			.filter((item) => item.path)
			.filter((item) => {
				const haystack = [item.label, ...(item.keywords || [])].map(normalizeSearchText).join(" ");
				return haystack.includes(normalizedQuery);
			})
			.slice(0, 8);
	}, [items, normalizedQuery]);

	return (
		<div ref={boxRef} className="relative px-3 pb-1 pt-3">
			<div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-300 focus-within:border-orange-400/60 focus-within:bg-white/10">
				<Search size={15} className="shrink-0" />
				<input
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					placeholder="Buscar no Finan..."
					aria-label="Buscar no menu do Finan"
					className="ml-2 min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none placeholder:text-slate-400"
				/>
				{query ? (
					<button
						type="button"
						onClick={() => {
							setQuery("");
							setOpen(false);
						}}
						className="text-slate-400 hover:text-white"
						aria-label="Limpar busca"
					>
						<X size={13} />
					</button>
				) : null}
			</div>
			{open && normalizedQuery.length >= 2 ? (
				<div className="absolute left-3 right-3 top-full z-layout-sidebar mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
					{results.length ? (
						results.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => {
									onNavigate(item.path);
									setQuery("");
									setOpen(false);
								}}
								className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-700"
							>
								<item.icon size={14} className="shrink-0 text-slate-400" />
								<span className="truncate">{item.label}</span>
							</button>
						))
					) : (
						<p className="px-3 py-2 text-xs font-semibold text-slate-500">Nenhum resultado no menu.</p>
					)}
				</div>
			) : null}
		</div>
	);
}

function FavoriteToggle({ active, onToggle, collapsed }) {
	if (collapsed) return null;
	return (
		<button
			type="button"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onToggle();
			}}
			className={`ml-1 shrink-0 rounded-md p-1 transition ${active ? "text-amber-300" : "text-slate-500 opacity-0 hover:text-amber-200 group-hover:opacity-100"}`}
			title={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
			aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
			aria-pressed={active}
		>
			<Star size={13} className={active ? "fill-amber-300" : ""} />
		</button>
	);
}

// Item simples (sem filhos), usado tanto na lista normal quanto na seção
// de Favoritos.
function FinanLeafLink({ item, collapsed, onNavigate, pathname, counters, isFavorito, onToggleFavorito }) {
	const Icon = item.icon;
	const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
	const badgeCount = item.badgeKey ? counters?.[item.badgeKey] : null;
	return (
		<NavLink
			to={item.path}
			end={item.path === FINAN_ROUTES.DASHBOARD}
			onClick={onNavigate}
			aria-current={active ? "page" : undefined}
			className={({ isActive }) =>
				`finan-nav-compact group w-full ${isActive ? "nav-item-modern-active" : "text-slate-300 hover:bg-white/10 hover:text-white"}`
			}
			title={item.description || item.label}
		>
			<Icon size={16} className="shrink-0" />
			<span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
			{!collapsed ? <MenuBadge count={badgeCount} tone={badgeToneForKey(item.badgeKey)} className="ml-auto" /> : null}
			{!collapsed && badgeCount ? null : (
				<ChevronRight size={14} className={collapsed ? "sr-only" : `shrink-0 opacity-50 ${badgeCount ? "hidden" : "ml-auto"}`} />
			)}
			{onToggleFavorito ? (
				<FavoriteToggle active={isFavorito(item.path)} onToggle={() => onToggleFavorito(item)} collapsed={collapsed} />
			) : null}
		</NavLink>
	);
}

function FinanNavItem({ item, collapsed, onNavigate, pathname, openItemId, setOpenItemId, counters, isFavorito, onToggleFavorito }) {
	const Icon = item.icon;
	const hasChildren = item.children?.length > 0;
	const active = isItemActive(item, pathname);
	const badgeCount = item.badgeKey ? counters?.[item.badgeKey] : null;

	if (hasChildren) {
		const open = !collapsed && openItemId === item.id;
		return (
			<div>
				<button
					type="button"
					onClick={() => setOpenItemId((current) => (current === item.id ? null : item.id))}
					aria-expanded={open}
					className={`finan-nav-compact w-full ${
						active
							? "nav-item-modern-active"
							: "text-slate-300 hover:bg-white/10 hover:text-white"
					}`}
					title={item.description || item.label}
				>
					<Icon size={16} className="shrink-0" />
					<span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
					{!collapsed ? <MenuBadge count={badgeCount} tone={badgeToneForKey(item.badgeKey)} className="ml-auto" /> : null}
					{!collapsed ? (
						<ChevronDown
							size={14}
							className={`shrink-0 text-slate-400 transition ${badgeCount ? "ml-1.5" : "ml-auto"} ${open ? "rotate-180" : ""}`}
						/>
					) : null}
				</button>
				{open ? (
					<div className="mt-1 space-y-0.5 border-l border-white/10 pl-4">
						{item.children.map((child) => (
							<FinanSubNavItem
								key={child.id}
								item={child}
								onNavigate={onNavigate}
								pathname={pathname}
								level={0}
								counters={counters}
								isFavorito={isFavorito}
								onToggleFavorito={onToggleFavorito}
							/>
						))}
					</div>
				) : null}
			</div>
		);
	}
	return (
		<FinanLeafLink
			item={item}
			collapsed={collapsed}
			onNavigate={onNavigate}
			pathname={pathname}
			counters={counters}
			isFavorito={isFavorito}
			onToggleFavorito={onToggleFavorito}
		/>
	);
}

function FinanSubNavItem({ item, onNavigate, pathname, level, counters, isFavorito, onToggleFavorito }) {
	const Icon = item.icon || ChevronRight;
	const hasChildren = item.children?.length > 0;
	const active = isItemActive(item, pathname);
	const [manualOpen, setManualOpen] = useState(false);
	const open = hasChildren && (manualOpen || active);
	const badgeCount = item.badgeKey ? counters?.[item.badgeKey] : null;
	if (hasChildren) {
		return (
			<div>
				<button
					type="button"
					onClick={() => setManualOpen((current) => !current)}
					aria-expanded={open}
					className={`flex min-h-9 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
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
								key={child.id}
								item={child}
								onNavigate={onNavigate}
								pathname={pathname}
								level={level + 1}
								counters={counters}
								isFavorito={isFavorito}
								onToggleFavorito={onToggleFavorito}
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
			aria-current={active ? "page" : undefined}
			className={({ isActive }) =>
				`group flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
					isActive ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
				}`
			}
			title={item.description || item.label}
			style={{ paddingLeft: `${12 + level * 10}px` }}
		>
			<Icon size={14} className="shrink-0" />
			<span className="min-w-0 flex-1 truncate">{item.label}</span>
			<MenuBadge count={badgeCount} tone={badgeToneForKey(item.badgeKey)} />
			{onToggleFavorito ? (
				<FavoriteToggle active={isFavorito(item.path)} onToggle={() => onToggleFavorito(item)} />
			) : null}
		</NavLink>
	);
}

// Contador de inatividade (so em aba de navegador normal, nao no PWA
// instalado — la o bloqueio e imediato ao voltar de background). Fica ao
// lado do cargo do usuario no cabecalho; pisca vermelho nos ultimos 20% do
// tempo configurado, pra avisar antes de travar.
function formatFinanNotificationDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

// Busca global (roteiro Finan #22): fornecedores, contratos e
// integrações por enquanto — cresce conforme outros módulos nascem
// (notas, contas a pagar/receber). Debounce simples, sem lib nova. Fica
// no topbar e é distinta da busca local do menu lateral (SidebarSearch).
function GlobalSearchBar() {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState([]);
	const [open, setOpen] = useState(false);
	const boxRef = useRef(null);

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
		};
		window.addEventListener("mousedown", handleClickOutside);
		return () => window.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (query.trim().length < 2) {
			// Reset síncrono intencional: sem isso, resultados de uma busca
			// anterior ficariam visíveis (results.length > 0) mesmo depois do
			// usuário apagar o texto abaixo de 2 caracteres.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setResults([]);
			return undefined;
		}
		let active = true;
		const timer = window.setTimeout(() => {
			fetchFinanBusca(query.trim())
				.then((items) => {
					if (active) setResults(items);
				})
				.catch(() => {
					if (active) setResults([]);
				});
		}, 300);
		return () => {
			active = false;
			window.clearTimeout(timer);
		};
	}, [query]);

	return (
		<div ref={boxRef} className="relative mx-5 hidden min-w-0 max-w-xl flex-1 xl:flex">
			<div className="flex w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400 shadow-inner focus-within:border-blue-300 focus-within:bg-white">
				<Search size={18} className="shrink-0" />
				<input
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					placeholder="Buscar fornecedores, contratos, integrações..."
					className="ml-2 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
				/>
			</div>
			{open && (results.length > 0 || query.trim().length >= 2) ? (
				<div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
					{results.length ? (
						results.map((item, index) => (
							<button
								key={`${item.tipo}-${item.titulo}-${index}`}
								type="button"
								onClick={() => {
									navigate(item.link);
									setOpen(false);
									setQuery("");
								}}
								className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-blue-50"
							>
								<span className="text-sm font-bold text-slate-900">{item.titulo}</span>
								<span className="text-xs text-slate-500">{item.subtitulo}</span>
							</button>
						))
					) : (
						<p className="px-3 py-2 text-sm text-slate-500">Nenhum resultado encontrado.</p>
					)}
				</div>
			) : null}
		</div>
	);
}

// Sino de notificacoes no topbar, mesmo padrao de Topbar.jsx do Retiradas
// (dropdown com as ultimas notificacoes + badge de nao lidas), mas com
// polling simples a cada 30s em vez de tempo real — o Finan ainda nao tem
// um mecanismo de push interno pro navegador tipo broadcastRealtime. O
// contador em si vem de fora (FinanLayout), compartilhado com o menu
// lateral pra nao duplicar polling.
function FinanNotificationBell({ unreadCount, onRead }) {
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState([]);
	const menuRef = useRef(null);

	const loadItems = useCallback(() => {
		fetchFinanNotifications({ limit: 8 })
			.then((data) => setItems(data?.items || []))
			.catch(() => {});
	}, []);

	useEffect(() => {
		if (open) loadItems();
	}, [open, loadItems]);

	useEffect(() => {
		if (!open) return undefined;
		function onPointerDown(event) {
			if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
		}
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, [open]);

	const markOneRead = (id) => {
		markFinanNotificationsRead({ ids: [id] })
			.then(() => {
				onRead?.();
				loadItems();
			})
			.catch(() => {});
	};

	return (
		<div className="relative" ref={menuRef}>
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-500"
				title="Notificações"
				aria-label="Notificações"
			>
				<Bell size={18} />
				{unreadCount > 0 ? (
					<span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-orange-500 px-1.5 py-0.5 text-center text-[10px] font-black text-white">
						{unreadCount > 99 ? "99+" : unreadCount}
					</span>
				) : null}
			</button>
			{open ? (
				<div className="absolute right-0 top-12 z-layout-dropdown w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
					<div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
						<div>
							<h3 className="text-sm font-black text-slate-950">Notificações</h3>
							<p className="text-xs font-semibold text-slate-500">
								Atualiza automaticamente a cada 30s
							</p>
						</div>
					</div>
					<div className="max-h-96 overflow-y-auto p-2">
						{items.length ? (
							items.map((item) => (
								<Link
									key={item.id}
									to={item.targetPath || FINAN_ROUTES.NOTIFICACOES_CENTRAL}
									onClick={() => {
										markOneRead(item.id);
										setOpen(false);
									}}
									className={`block rounded-xl border p-3 transition hover:bg-slate-50 ${item.read ? "border-transparent" : "border-orange-200 bg-orange-50/60"}`}
								>
									<div className="flex items-start justify-between gap-3">
										<p className="text-sm font-black text-slate-950">
											{item.title}
										</p>
										<span className="shrink-0 text-[11px] font-bold text-slate-400">
											{formatFinanNotificationDate(item.createdAt)}
										</span>
									</div>
									<p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
										{item.message}
									</p>
								</Link>
							))
						) : (
							<div className="p-8 text-center text-sm font-bold text-slate-400">
								Nenhuma notificação por enquanto.
							</div>
						)}
					</div>
					<Link
						to={FINAN_ROUTES.NOTIFICACOES_CENTRAL}
						onClick={() => setOpen(false)}
						className="block border-t border-slate-100 p-3 text-center text-sm font-black text-blue-700 hover:bg-blue-50"
					>
						Ver todas
					</Link>
				</div>
			) : null}
		</div>
	);
}

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
