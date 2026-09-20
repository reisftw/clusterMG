import { Bell, BellRing, Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	bindForegroundPushNotifications,
	disablePushNotifications,
	enablePushNotifications,
	getPushSupportState,
	loadSavedPushPreferences,
	PUSH_TOPIC_OPTIONS,
	updatePushTopics,
} from "../../services/pushNotificationsService";

const TOPIC_META = {
	mapa: {
		description: "Atualizacoes de importacao e mudancas no mapa publico.",
	},
	match: {
		description: "Novos dados e movimentacoes do painel de Match.",
	},
	metas: {
		description: "Avisos de fechamento, meta mensal e progresso do painel.",
	},
	comunicados: {
		description: "Mensagens gerais e avisos manuais enviados pela equipe.",
	},
};

function getPermissionLabel(permission) {
	if (permission === "granted") return "Permitido";
	if (permission === "denied") return "Bloqueado";
	return "Pendente";
}

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolvePrimaryActionLabel(busy, enabled) {
	if (busy) return "Salvando...";
	return enabled ? "Salvar preferencias" : "Ativar notificacoes";
}

function getStatusTone(enabled) {
	return enabled
		? "border-emerald-200 bg-emerald-50 text-emerald-700"
		: "border-slate-200 bg-slate-50 text-slate-600";
}

function TopicSwitch({ checked, label, description, onChange }) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
			<div className="min-w-0 pr-2">
				<p className="text-base font-semibold !text-slate-900">{label}</p>
				<p className="mt-1 text-sm leading-5 !text-slate-600">{description}</p>
			</div>
			<button
				type="button"
				onClick={onChange}
				className={`relative h-7 w-12 shrink-0 rounded-full transition ${
					checked ? "bg-blue-600" : "bg-slate-300"
				}`}
				aria-pressed={checked}
				aria-label={`${checked ? "Desativar" : "Ativar"} ${label}`}
			>
				<span
					className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
						checked ? "left-6" : "left-1"
					}`}
				/>
			</button>
		</div>
	);
}

function SupportWarnings({ support }) {
	return (
		<div className="mt-4 flex flex-col gap-3">
			{(!support.supported || !support.hasNotificationApi) && (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
					Este dispositivo nao oferece suporte completo a notificacoes push.
				</div>
			)}
			{support.hasVapidKey && !support.vapidKeyValid && (
				<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
					A chave Web Push configurada esta invalida.
				</div>
			)}
			{!support.hasVapidKey && (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
					O app ainda nao recebeu a chave Web Push.
				</div>
			)}
		</div>
	);
}

function NotificationsModalHeader({
	enabled,
	support,
	activeTopicsCount,
	onClose,
}) {
	return (
		<div className="shrink-0 bg-[linear-gradient(135deg,#0b1f6a_0%,#1447b8_100%)] px-6 py-5 text-white">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">
						<ShieldCheck size={12} />
						Avisos do painel
					</div>
					<h2 className="mt-3 text-3xl font-black leading-none">
						Notificacoes do Painel
					</h2>
					<p className="mt-2 max-w-[440px] text-sm leading-5 text-white/80">
						Configure neste dispositivo quais avisos devem chegar por push.
					</p>
				</div>

				<button
					type="button"
					onClick={onClose}
					className="shrink-0 rounded-xl bg-white/12 p-2.5 text-white transition hover:bg-white/20"
					aria-label="Fechar"
				>
					<X size={18} />
				</button>
			</div>

			<div className="mt-5 grid gap-3 sm:grid-cols-3">
				<div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
					<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
						Status
					</p>
					<p className="mt-1 text-sm font-semibold text-white">
						{enabled ? "Ativado" : "Desativado"}
					</p>
				</div>
				<div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
					<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
						Permissao
					</p>
					<p className="mt-1 text-sm font-semibold text-white">
						{getPermissionLabel(support.permission)}
					</p>
				</div>
				<div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
					<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
						Canais ativos
					</p>
					<p className="mt-1 text-sm font-semibold text-white">
						{activeTopicsCount} de {PUSH_TOPIC_OPTIONS.length}
					</p>
				</div>
			</div>
		</div>
	);
}

function NotificationsModalBody({
	enabled,
	support,
	topics,
	message,
	onToggleTopic,
}) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-6 py-5">
			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[11px] font-bold uppercase tracking-[0.16em] !text-slate-500">
							Preferencias
						</p>
						<h3 className="mt-1.5 text-lg font-bold !text-slate-900">
							Escolha os avisos que fazem sentido para esse aparelho
						</h3>
					</div>
					<span
						className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${getStatusTone(enabled)}`}
					>
						{enabled ? "ativo" : "inativo"}
					</span>
				</div>
				<p className="mt-2 text-sm leading-6 !text-slate-600">
					As alteracoes abaixo valem para este navegador ou dispositivo.
				</p>
			</div>

			<SupportWarnings support={support} />

			<div className="mt-5 grid gap-3">
				{PUSH_TOPIC_OPTIONS.map((item) => (
					<TopicSwitch
						key={item.key}
						label={item.label}
						description={TOPIC_META[item.key]?.description || ""}
						checked={topics[item.key] === true}
						onChange={() => onToggleTopic(item.key)}
					/>
				))}
			</div>

			{message && (
				<div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">
					{message}
				</div>
			)}
		</div>
	);
}

function NotificationsModalFooter({
	enabled,
	busy,
	canActivate,
	onDisable,
	onPrimaryAction,
}) {
	return (
		<div className="shrink-0 flex flex-col gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
			{enabled ? (
				<button
					type="button"
					onClick={onDisable}
					disabled={busy}
					className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
				>
					Desativar
				</button>
			) : (
				<span className="hidden sm:block" />
			)}

			<button
				type="button"
				onClick={onPrimaryAction}
				disabled={busy || !canActivate}
				className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
			>
				<Check size={16} />
				{resolvePrimaryActionLabel(busy, enabled)}
			</button>
		</div>
	);
}

function NotificationsModal(props) {
	const {
		activeTopicsCount,
		busy,
		canActivate,
		enabled,
		message,
		support,
		topics,
		onClose,
		onDisable,
		onPrimaryAction,
		onToggleTopic,
	} = props;

	return (
		<div
			className="fixed inset-0 z-layout-notification flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
			onClick={(event) => event.target === event.currentTarget && onClose()}
			onKeyDown={(event) => event.key === "Escape" && onClose()}
			role="button"
			tabIndex={-1}
		>
			<div className="flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] bg-slate-50 shadow-[0_32px_90px_rgba(15,23,42,0.34)]">
				<NotificationsModalHeader
					enabled={enabled}
					support={support}
					activeTopicsCount={activeTopicsCount}
					onClose={onClose}
				/>
				<NotificationsModalBody
					enabled={enabled}
					support={support}
					topics={topics}
					message={message}
					onToggleTopic={onToggleTopic}
				/>
				<NotificationsModalFooter
					enabled={enabled}
					busy={busy}
					canActivate={canActivate}
					onDisable={onDisable}
					onPrimaryAction={onPrimaryAction}
				/>
			</div>
		</div>
	);
}

export default function PublicNotificationsButton({
	labelMode = "compact",
	className = "",
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [support, setSupport] = useState({
		supported: false,
		hasNotificationApi: false,
		permission: "default",
		hasVapidKey: false,
		vapidKeyValid: false,
	});
	const [enabled, setEnabled] = useState(false);
	const [topics, setTopics] = useState(loadSavedPushPreferences().topics);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		getPushSupportState().then(setSupport);
		const saved = loadSavedPushPreferences();
		setEnabled(saved.enabled);
		setTopics(saved.topics);
	}, []);

	const buttonLabel = useMemo(() => {
		if (labelMode === "full") {
			return enabled ? "Notificacoes ativas" : "Ativar notificacoes";
		}
		return enabled ? "Notificacoes" : "Avisos";
	}, [enabled, labelMode]);

	const canActivate =
		support.supported &&
		support.hasNotificationApi &&
		support.hasVapidKey &&
		support.vapidKeyValid;

	const activeTopicsCount = PUSH_TOPIC_OPTIONS.reduce(
		(total, item) => total + (topics[item.key] === true ? 1 : 0),
		0,
	);

	function toggleTopic(key) {
		setTopics((current) => ({
			...current,
			[key]: !current[key],
		}));
	}

	async function handlePrimaryAction() {
		setBusy(true);
		setMessage("");
		try {
			if (enabled) {
				await updatePushTopics(topics);
				setMessage("Preferencias salvas com sucesso.");
			} else {
				bindForegroundPushNotifications();
				await enablePushNotifications(topics);
				setEnabled(true);
				setSupport((current) => ({ ...current, permission: "granted" }));
				setMessage("Notificacoes ativadas com sucesso.");
			}
		} catch (error) {
			setMessage(error?.message || "Nao foi possivel ativar as notificacoes.");
		} finally {
			setBusy(false);
		}
	}

	async function handleDisable() {
		setBusy(true);
		setMessage("");
		try {
			await disablePushNotifications();
			setEnabled(false);
			setTopics(loadSavedPushPreferences().topics);
			setMessage("Notificacoes desativadas.");
		} catch (error) {
			setMessage(
				error?.message || "Nao foi possivel desativar as notificacoes.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
					enabled
						? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
						: "border-white/20 bg-white/10 text-white hover:bg-white/20"
				} ${className}`.trim()}
			>
				{enabled ? <BellRing size={16} /> : <Bell size={16} />}
				<span>{buttonLabel}</span>
			</button>

			{isOpen ? (
				<NotificationsModal
					activeTopicsCount={activeTopicsCount}
					busy={busy}
					canActivate={canActivate}
					enabled={enabled}
					message={message}
					support={support}
					topics={topics}
					onClose={() => setIsOpen(false)}
					onDisable={handleDisable}
					onPrimaryAction={handlePrimaryAction}
					onToggleTopic={toggleTopic}
				/>
			) : null}
		</>
	);
}
