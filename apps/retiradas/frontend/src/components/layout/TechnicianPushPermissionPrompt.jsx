import { BellRing, CheckCircle2, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	bindForegroundPushNotifications,
	enablePushNotifications,
	getPushSupportState,
	syncSavedPushSubscription,
} from "../../services/pushNotificationsService";

export default function TechnicianPushPermissionPrompt() {
	const [visible, setVisible] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		let active = true;

		getPushSupportState()
			.then(async (support) => {
				if (!active) return;
				if (support.subscribed === true) {
					await syncSavedPushSubscription().catch(() => null);
					return;
				}
				setVisible(
					support.supported === true &&
						support.hasNotificationApi === true &&
						support.hasVapidKey === true &&
						support.subscribed !== true,
				);
			})
			.catch(() => {
				if (active) setVisible(false);
			});

		return () => {
			active = false;
		};
	}, []);

	async function handleAuthorize() {
		setBusy(true);
		setMessage("");
		try {
			await bindForegroundPushNotifications();
			await enablePushNotifications();
			setVisible(false);
		} catch (error) {
			const permissionBlocked =
				typeof Notification !== "undefined" &&
				Notification.permission === "denied";
			setMessage(
				permissionBlocked
					? "As notificações estão bloqueadas neste navegador. Libere-as nas configurações do site e tente novamente."
					: error?.message || "Não foi possível ativar as notificações.",
			);
		} finally {
			setBusy(false);
		}
	}

	if (!visible) return null;

	return (
		<div className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-layout-notification mx-auto w-auto max-w-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[420px]">
			<section
				className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
				aria-labelledby="technician-push-title"
				aria-live="polite"
			>
				<div className="flex items-start gap-3 bg-[linear-gradient(135deg,#0b1f6a_0%,#1447b8_100%)] px-4 py-4 text-white sm:px-5">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
						<BellRing size={23} aria-hidden="true" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 id="technician-push-title" className="text-base font-bold text-white sm:text-lg">
							Ative as notificações
						</h2>
						<p className="mt-1 text-sm leading-5 text-blue-100">
							Receba comunicados, avisos operacionais e atualizações importantes do Retiradas.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setVisible(false)}
						className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70"
						aria-label="Fechar aviso de notificações"
					>
						<X size={19} aria-hidden="true" />
					</button>
				</div>

				<div className="px-4 py-4 sm:px-5">
					<div className="flex items-start gap-2 text-sm leading-5 text-slate-600">
						<CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={17} aria-hidden="true" />
						<span>A autorização vale apenas para este aparelho e pode ser alterada nas configurações do navegador.</span>
					</div>

					{message ? (
						<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-800">
							{message}
						</p>
					) : null}

					<button
						type="button"
						onClick={handleAuthorize}
						disabled={busy}
						className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
					>
						{busy ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <BellRing size={18} aria-hidden="true" />}
						{busy ? "Ativando..." : "Autorizar notificações"}
					</button>
				</div>
			</section>
		</div>
	);
}
