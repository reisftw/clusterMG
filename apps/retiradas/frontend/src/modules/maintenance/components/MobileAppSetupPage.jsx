import {
	BellRing,
	CheckCircle2,
	ChevronRight,
	ExternalLink,
	Loader2,
	LocateFixed,
	MapPinned,
	ShieldCheck,
	Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROLES } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	bindForegroundPushNotifications,
	enablePushNotifications,
	ensurePushNotifications,
	getPushSupportState,
	openAndroidNotificationSettings,
	syncSavedPushSubscription,
} from "../../../services/pushNotificationsService";
import {
	getAppClientContext,
	requestVpsApi,
} from "../../../services/vpsApiClient";

const ENROLLED_KEY = "retiradas-native-location-enrolled-v1";

function StatusBadge({ active, children }) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${
				active
					? "bg-emerald-100 text-emerald-700"
					: "bg-amber-100 text-amber-800"
			}`}
		>
			{active ? <CheckCircle2 size={14} /> : null}
			{children}
		</span>
	);
}

export default function MobileAppSetupPage() {
	const { currentUser, realUser } = useAuthContext();
	const authenticatedUser = realUser || currentUser;
	const context = useMemo(() => getAppClientContext(), []);
	const isAndroid = context.mode === "android";
	const isTechnician =
		String(authenticatedUser?.role || "").trim().toLowerCase() === ROLES.TECNICO;
	const [pushState, setPushState] = useState(null);
	const [pushBusy, setPushBusy] = useState(false);
	const [locationBusy, setLocationBusy] = useState(false);
	const [pushError, setPushError] = useState("");
	const [locationError, setLocationError] = useState("");
	const [locationEnrolled] = useState(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("nativeEnrolled") === "1") {
			window.localStorage.setItem(ENROLLED_KEY, "1");
			return true;
		}
		return window.localStorage.getItem(ENROLLED_KEY) === "1";
	});

	const refreshPushState = useCallback(async () => {
		const nextState = await getPushSupportState();
		if (nextState.subscribed === true) {
			await syncSavedPushSubscription().catch(() => null);
		} else if (nextState.permission === "granted") {
			await ensurePushNotifications();
			const enrolledState = await getPushSupportState();
			setPushState(enrolledState);
			return;
		}
		setPushState(nextState);
	}, []);

	useEffect(() => {
		refreshPushState().catch(() => setPushState({ supported: false }));
		async function handleReturnToApp() {
			if (document.visibilityState !== "visible") return;
			const nextState = await getPushSupportState();
			if (nextState.permission === "granted" && nextState.subscribed !== true) {
				await bindForegroundPushNotifications();
				await ensurePushNotifications();
			}
			await refreshPushState();
		}
		document.addEventListener("visibilitychange", handleReturnToApp);
		window.addEventListener("focus", handleReturnToApp);
		return () => {
			document.removeEventListener("visibilitychange", handleReturnToApp);
			window.removeEventListener("focus", handleReturnToApp);
		};
	}, [refreshPushState]);

	async function activatePush() {
		setPushBusy(true);
		setPushError("");
		try {
			if (isAndroid && pushState?.permission === "denied") {
				openAndroidNotificationSettings();
				setPushError("Ative Notificações para o site Retiradas e volte ao aplicativo. A inscrição será concluída automaticamente.");
				return;
			}
			await bindForegroundPushNotifications();
			if (pushState?.permission === "granted") await ensurePushNotifications();
			else await enablePushNotifications();
			await refreshPushState();
		} catch (error) {
			const blocked =
				typeof Notification !== "undefined" &&
				Notification.permission === "denied";
			setPushError(
				blocked
					? "As notificacoes foram bloqueadas. Abra as configuracoes do aplicativo no Android, permita Notificacoes e tente novamente."
					: error?.message || "Nao foi possivel ativar as notificacoes.",
			);
		} finally {
			setPushBusy(false);
		}
	}

	async function activateLocation() {
		setLocationBusy(true);
		setLocationError("");
		try {
			const enrollment = await requestVpsApi("/maintenance/app/enrollment", {
				method: "POST",
				body: "{}",
			});
			const target = new URL("retiradas://enroll");
			target.searchParams.set("code", enrollment.code);
			target.searchParams.set("version", context.version || "1.0.3");
			window.location.href = target.toString();
		} catch (error) {
			setLocationError(
				error?.message || "Nao foi possivel ativar a localizacao em tempo real.",
			);
			setLocationBusy(false);
		}
	}

	const pushActive = pushState?.subscribed === true;
	const pushBlocked = pushState?.permission === "denied";

	return (
		<div className="mx-auto w-full max-w-4xl space-y-5 pb-8">
			<header className="overflow-hidden rounded-lg bg-[linear-gradient(135deg,#0b1f6a_0%,#1447b8_100%)] p-5 text-white shadow-lg sm:p-7">
				<div className="flex items-start gap-4">
					<span className="grid size-14 shrink-0 place-items-center rounded-lg bg-white/15">
						<Smartphone size={28} />
					</span>
					<div>
						<p className="text-xs font-black uppercase text-blue-100">Aplicativo Retiradas</p>
						<h1 className="mt-1 text-2xl font-black">Permissoes do aparelho</h1>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
							Ative os recursos abaixo neste celular. Voce pode voltar a esta tela pelo menu da sua conta.
						</p>
					</div>
				</div>
			</header>

			{!isAndroid ? (
				<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
					Esta tela foi aberta no navegador. Para configurar a localizacao nativa, abra o aplicativo Retiradas instalado no Android.
				</div>
			) : null}

			<div className="grid gap-4 md:grid-cols-2">
				<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-start justify-between gap-3">
						<span className="grid size-11 place-items-center rounded-lg bg-blue-50 text-blue-700"><BellRing size={22} /></span>
						<StatusBadge active={pushActive}>
							{pushActive ? "Ativas" : pushBlocked ? "Bloqueadas" : "Pendente"}
						</StatusBadge>
					</div>
					<h2 className="mt-4 text-lg font-black text-slate-950">Notificacoes push</h2>
					<p className="mt-2 text-sm leading-6 text-slate-600">
						Receba novas O.S, cidades atribuidas e alertas operacionais mesmo fora da tela atual.
					</p>
					{pushError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{pushError}</p> : null}
					<button
						type="button"
						onClick={activatePush}
						disabled={pushBusy || pushActive || pushState?.supported === false}
						className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
					>
						{pushBusy ? <Loader2 className="animate-spin" size={18} /> : <BellRing size={18} />}
						{pushActive ? "Notificacoes ativadas" : pushBusy ? "Ativando..." : pushBlocked && isAndroid ? "Abrir configuracoes" : "Autorizar notificacoes"}
					</button>
				</section>

				<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-start justify-between gap-3">
						<span className="grid size-11 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><MapPinned size={22} /></span>
						<StatusBadge active={isTechnician && locationEnrolled}>
							{!isTechnician ? "Somente tecnico" : locationEnrolled ? "Configurada" : "Pendente"}
						</StatusBadge>
					</div>
					<h2 className="mt-4 text-lg font-black text-slate-950">Localizacao em tempo real</h2>
					<p className="mt-2 text-sm leading-6 text-slate-600">
						{isTechnician
							? "Permite que a operacao acompanhe sua posicao durante o expediente, inclusive com o aplicativo minimizado."
							: "A localizacao operacional e enviada somente por contas com cargo Tecnico. Contas administrativas podem acompanhar os tecnicos, mas nao enviam posicao."}
					</p>
					{locationError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{locationError}</p> : null}
					{isTechnician ? (
						<button
							type="button"
							onClick={activateLocation}
							disabled={locationBusy || !isAndroid}
							className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
						>
							{locationBusy ? <Loader2 className="animate-spin" size={18} /> : <LocateFixed size={18} />}
							{locationBusy ? "Ativando..." : locationEnrolled ? "Configurar novamente" : "Autorizar localizacao"}
						</button>
					) : (
						<div className="mt-5 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">
							<ShieldCheck className="mt-0.5 shrink-0" size={18} /> Nenhuma localizacao sera coletada desta conta.
						</div>
					)}
				</section>
			</div>

			<div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3 text-sm text-slate-600">
					<ExternalLink className="shrink-0 text-slate-400" size={19} />
					<span>Versao instalada: <strong className="text-slate-900">{context.version || "navegador"}</strong></span>
				</div>
				<Link to="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-black text-slate-800 no-underline hover:bg-slate-50">
					Continuar para o sistema <ChevronRight size={17} />
				</Link>
			</div>
		</div>
	);
}
