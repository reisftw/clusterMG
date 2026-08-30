import { Bell, Camera, CheckCheck, LogOut, Menu, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import UserAvatar from "../ui/UserAvatar";
import { getRoleLabel } from "../../constants/roles";
import { useAuthContext } from "../../context/AuthContext";
import { atualizarAvatarPerfil } from "../../modules/auth/services/authService";
import {
	listarNotificacoesInternas,
	marcarNotificacoesLidas,
	obterContadoresNotificacoes,
	obterPreferenciasNotificacoes,
} from "../../services/internalNotificationsService";
import { playSelectedNotificationSound } from "../../services/notificationSoundSettings";
import { AVATAR_ACCEPT, validateImageFile } from "../../utils/imageUpload";

function formatNotificationDate(value) {
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

function isQuietHour(preferences) {
	const quiet = preferences?.quietHours;
	if (!quiet?.enabled) return false;
	const now = new Date();
	const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
	const start = quiet.start || "22:00";
	const end = quiet.end || "07:00";
	if (start <= end) return current >= start && current <= end;
	return current >= start || current <= end;
}

const Topbar = ({ onOpenMobileMenu }) => {
	const { currentUser, realUser, refreshUser, signOut, isViewingAsRole } =
		useAuthContext();
	const displayUser = realUser || currentUser;
	const avatarInputRef = useRef(null);
	const [notificationsOpen, setNotificationsOpen] = useState(false);
	const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
	const [notifications, setNotifications] = useState([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const [defaultAvatarUrl, setDefaultAvatarUrl] = useState("");
	const [avatarError, setAvatarError] = useState("");
	const [avatarSaving, setAvatarSaving] = useState(false);
	const notificationPreferencesRef = useRef(null);
	const lastSeenCreatedAtRef = useRef("");
	const avatarSrc =
		displayUser?.avatarUrl ||
		displayUser?.avatarDataUrl ||
		defaultAvatarUrl ||
		"";

	const publishCounters = useCallback((counters) => {
		window.dispatchEvent(
			new CustomEvent("retiradas:notification-counters", { detail: counters }),
		);
	}, []);

	const loadNotifications = useCallback(
		async (options) => {
			const { silent = false } = options ?? {};
			if (!currentUser) return;
			try {
				const [notificationsResponse, counters] = await Promise.all([
					listarNotificacoesInternas({ limit: 20 }),
					obterContadoresNotificacoes(),
				]);
				const nextItems = notificationsResponse?.items || [];
				const preferences = notificationPreferencesRef.current;
				const enabledTypes = preferences?.enabledTypes ?? {};
				const visibleByPreference = nextItems.filter(
					(item) => enabledTypes[item.type] !== false,
				);
				const nextUnreadCount = visibleByPreference.filter(
					(item) => !item.read,
				).length;
				const latestCreatedAt = nextItems[0]?.createdAt || "";
				const hasNewItem =
					latestCreatedAt &&
					lastSeenCreatedAtRef.current &&
					latestCreatedAt !== lastSeenCreatedAtRef.current;
				setNotifications(visibleByPreference);
				setUnreadCount(nextUnreadCount);
				publishCounters(counters ?? {});
				if (hasNewItem && !silent) {
					if (!isQuietHour(preferences)) {
						playSelectedNotificationSound(preferences?.sound);
					}
					window.dispatchEvent(
						new CustomEvent("retiradas:documentos-pendentes-updated"),
					);
				}
				if (latestCreatedAt) lastSeenCreatedAtRef.current = latestCreatedAt;
			} catch {
				// Se a sessão expirar ou a API estiver reiniciando, a tela principal já trata o login/erro.
			}
		},
		[currentUser, publishCounters],
	);

	useEffect(() => {
		obterPreferenciasNotificacoes()
			.then((preferences) => {
				notificationPreferencesRef.current = preferences;
				setDefaultAvatarUrl(
					preferences?.defaultAvatarUrl ||
						preferences?.defaultAvatarDataUrl ||
						"",
				);
			})
			.catch(() => {});
	}, []);

	const handleAvatarFile = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setAvatarSaving(true);
		setAvatarError("");
		try {
			validateImageFile(file);
			await atualizarAvatarPerfil(file);
			await refreshUser?.();
		} catch (error) {
			setAvatarError(error?.message || "Não foi possível salvar o avatar.");
			window.setTimeout(() => setAvatarError(""), 3200);
		} finally {
			setAvatarSaving(false);
		}
	};

	useEffect(() => {
		const initialTimer = window.setTimeout(() => {
			loadNotifications({ silent: true });
		}, 0);
		const interval = window.setInterval(() => loadNotifications(), 30000);
		const handlePreferenceUpdate = (event) => {
			const nextPreferences = {
				...(notificationPreferencesRef.current ?? {}),
				...(event.detail ?? {}),
			};
			notificationPreferencesRef.current = nextPreferences;
			setDefaultAvatarUrl(
				nextPreferences.defaultAvatarUrl ||
					nextPreferences.defaultAvatarDataUrl ||
					"",
			);
		};
		window.addEventListener(
			"retiradas:notification-preferences-updated",
			handlePreferenceUpdate,
		);
		return () => {
			window.clearTimeout(initialTimer);
			window.clearInterval(interval);
			window.removeEventListener(
				"retiradas:notification-preferences-updated",
				handlePreferenceUpdate,
			);
		};
	}, [loadNotifications]);

	const markAllRead = async () => {
		await marcarNotificacoesLidas({ all: true });
		await loadNotifications({ silent: true });
	};

	const markOneRead = (id) => {
		marcarNotificacoesLidas({ ids: [id] })
			.then(() => loadNotifications({ silent: true }))
			.catch(() => {});
	};

	return (
		<header className="relative z-layout-topbar flex items-center justify-between gap-2 overflow-visible border-b border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-5 lg:px-8">
			<button
				type="button"
				onClick={() => {
					setNotificationsOpen(false);
					setMobileAccountOpen(false);
					onOpenMobileMenu?.();
				}}
				className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
				title="Abrir menu"
				aria-label="Abrir menu"
			>
				<Menu size={20} />
			</button>

			<div className="min-w-0 flex-1 lg:flex-none">
				<h2 className="truncate text-lg font-black text-slate-950">
					Olá, {displayUser?.nome?.split(" ")?.[0] || "Usuário"}
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

			<div className="mx-5 hidden min-w-0 max-w-xl flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400 shadow-inner xl:flex">
				<Search size={18} className="shrink-0" />
				<span className="ml-2 truncate text-sm">
					Buscar por O.S, colaborador, cidade...
				</span>
			</div>

			<div className="flex items-center gap-2">
				<div className="relative">
					<button
						type="button"
						onClick={() => {
							setMobileAccountOpen(false);
							setNotificationsOpen((current) => !current);
						}}
						className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-orange-50 hover:text-orange-500"
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
					{notificationsOpen ? (
						<div className="absolute right-0 top-12 z-layout-dropdown w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
							<div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
								<div>
									<h3 className="text-sm font-black text-slate-950">
										Notificações
									</h3>
									<p className="text-xs font-semibold text-slate-500">
										Atualiza automaticamente a cada 30s
									</p>
								</div>
								<button
									type="button"
									onClick={markAllRead}
									className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
								>
									<CheckCheck size={14} /> Lidas
								</button>
							</div>
							<div className="max-h-96 overflow-y-auto p-2">
								{notifications.length ? (
									notifications.map((item) => (
										<Link
											key={item.id}
											to={item.targetPath || "#"}
											onClick={() => {
												markOneRead(item.id);
												setNotificationsOpen(false);
											}}
											className={`block rounded-xl border p-3 transition hover:bg-slate-50 ${
												item.read
													? "border-transparent"
													: "border-orange-200 bg-orange-50/60"
											}`}
										>
											<div className="flex items-start justify-between gap-3">
												<p className="text-sm font-black text-slate-950">
													{item.title}
												</p>
												<span className="shrink-0 text-[11px] font-bold text-slate-400">
													{formatNotificationDate(item.createdAt)}
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
						</div>
					) : null}
				</div>

				<div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />

				<div className="relative lg:hidden">
					<button
						type="button"
						onClick={() => {
							setNotificationsOpen(false);
							setMobileAccountOpen((current) => !current);
						}}
						className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-xs font-black text-white shadow-sm disabled:opacity-70"
						title="Conta"
						aria-label="Conta"
					>
						<UserAvatar
							src={avatarSrc}
							name={displayUser?.nome}
							email={displayUser?.email}
							alt="Avatar"
							className="flex h-full w-full items-center justify-center"
						/>
					</button>
					{mobileAccountOpen ? (
						<div className="absolute right-0 top-12 z-layout-dropdown w-[min(88vw,320px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
							<div className="border-b border-slate-100 p-4">
								<p className="break-anywhere text-sm font-black text-slate-950">
									{displayUser?.nome || "Usuário"}
								</p>
								<p className="mt-1 break-anywhere text-xs font-semibold text-slate-500">
									{avatarError ||
										(isViewingAsRole
											? `Simulando ${getRoleLabel(currentUser?.role)}`
											: getRoleLabel(currentUser?.role || "user"))}
								</p>
							</div>
							<div className="grid gap-2 p-2">
								<button
									type="button"
									onClick={() => {
										setMobileAccountOpen(false);
										avatarInputRef.current?.click();
									}}
									disabled={avatarSaving}
									className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
								>
									<Camera size={16} /> Alterar avatar
								</button>
								<button
									type="button"
									onClick={signOut}
									className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
								>
									<LogOut size={16} /> Sair
								</button>
							</div>
						</div>
					) : null}
				</div>

				<div className="ml-1 hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm lg:flex">
					<input
						ref={avatarInputRef}
						type="file"
						accept={AVATAR_ACCEPT}
						className="hidden"
						onChange={handleAvatarFile}
					/>
					<button
						type="button"
						onClick={() => avatarInputRef.current?.click()}
						disabled={avatarSaving}
						className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-xs font-black text-white disabled:opacity-70"
						title="Alterar avatar"
						aria-label="Alterar avatar"
					>
						<UserAvatar
							src={avatarSrc}
							name={displayUser?.nome}
							email={displayUser?.email}
							alt="Avatar"
							className="flex h-full w-full items-center justify-center"
						/>
						<span className="absolute inset-0 hidden items-center justify-center bg-slate-950/55 text-white group-hover:flex">
							<Camera size={13} />
						</span>
					</button>
					<div className="min-w-0">
						<p className="max-w-36 truncate text-xs font-black uppercase text-slate-900">
							{displayUser?.nome || "Usuário"}
						</p>
						<p className="truncate text-[11px] font-semibold text-slate-500">
							{avatarError ||
								(isViewingAsRole
									? `Simulando ${getRoleLabel(currentUser?.role)}`
									: getRoleLabel(currentUser?.role || "user"))}
						</p>
					</div>
					<button
						type="button"
						onClick={signOut}
						className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
						title="Sair"
						aria-label="Sair"
					>
						<LogOut size={16} />
					</button>
				</div>
			</div>
		</header>
	);
};

export default Topbar;
