import {
	BellRing,
	Camera,
	Clock,
	Image,
	Loader2,
	Trash2,
	Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission, ROLES } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	obterPreferenciasNotificacoes,
	salvarPreferenciasNotificacoes,
} from "../../../services/internalNotificationsService";
import {
	getNotificationSound,
	NOTIFICATION_SOUNDS,
	playSelectedNotificationSound,
	setNotificationSound,
} from "../../../services/notificationSoundSettings";
import { AVATAR_ACCEPT, validateImageFile } from "../../../utils/imageUpload";
import {
	WELCOME_MODAL_EVENT,
	WELCOME_MODAL_IMAGE,
} from "../../auth/utils/welcomeModalStorage";
import { enviarAvatarAdmin } from "../../auth/services/authService";

const NOTIFICATION_TYPES = [
	{
		key: "documentos_pendentes",
		label: "Documentos pendentes",
		description: "Avisar quando uma empresa enviar documentos para aprovação.",
	},
	{
		key: "whatsapp_agendamento_auto",
		label: "Agendamento automático",
		description: "Avisar quando o WhatsApp gerar um agendamento automático.",
	},
	{
		key: "sistema_critico",
		label: "Alertas críticos",
		description:
			"Avisar sobre API offline, falha de backup ou serviço importante indisponível.",
	},
	{
		key: "backup",
		label: "Backups",
		description: "Avisos de backup gerado, falha ou restauração.",
	},
	{
		key: "api",
		label: "APIs",
		description: "Avisos de integrações e APIs monitoradas.",
	},
	{
		key: "geral",
		label: "Geral",
		description: "Comunicados internos do sistema.",
	},
];

const DEFAULT_PREFERENCES = {
	sound: getNotificationSound(),
	defaultAvatarUrl: "",
	enabledTypes: Object.fromEntries(
		NOTIFICATION_TYPES.map((item) => [item.key, true]),
	),
	quietHours: { enabled: false, start: "22:00", end: "07:00" },
};

export default function ConfiguracoesGeraisPage() {
	const { currentUser, realUser } = useAuthContext();
	const isAdmin = String(realUser?.role || "").toLowerCase() === ROLES.ADMIN;
	const canManage =
		hasPermission(currentUser, "configuracao.geral.manage") ||
		hasPermission(currentUser, "manage_general_settings");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
	const [message, setMessage] = useState("");
	const isFinanHost =
		typeof window !== "undefined" && /^finan\./i.test(window.location.hostname);
	const welcomeModalEvent = isFinanHost
		? "finan:welcome-modal-open"
		: WELCOME_MODAL_EVENT;
	const welcomeModalImage = isFinanHost
		? "/finan-boas-vindas.jpg"
		: WELCOME_MODAL_IMAGE;

	useEffect(() => {
		let active = true;
		obterPreferenciasNotificacoes()
			.then((data) => {
				if (!active) return;
				setPreferences({
					...DEFAULT_PREFERENCES,
					...(data ?? null),
					enabledTypes: {
						...DEFAULT_PREFERENCES.enabledTypes,
						...(data?.enabledTypes ?? null),
					},
					quietHours: {
						...DEFAULT_PREFERENCES.quietHours,
						...(data?.quietHours ?? null),
					},
				});
			})
			.catch(() => {})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const savePreferences = async (
		nextPreferences,
		successMessage = "Configuração salva.",
	) => {
		if (!canManage) return;
		setPreferences(nextPreferences);
		setSaving(true);
		setMessage("");
		try {
			const saved = await salvarPreferenciasNotificacoes(nextPreferences);
			setPreferences({
				...nextPreferences,
				...(saved ?? null),
				enabledTypes: {
					...nextPreferences.enabledTypes,
					...(saved?.enabledTypes ?? null),
				},
			});
			setNotificationSound(nextPreferences.sound);
			window.dispatchEvent(
				new CustomEvent("retiradas:notification-preferences-updated", {
					detail: nextPreferences,
				}),
			);
			setMessage(successMessage);
			window.setTimeout(() => setMessage(""), 2600);
		} catch (error) {
			setMessage(error?.message || "Não foi possível salvar as preferências.");
		} finally {
			setSaving(false);
		}
	};

	const changeSound = (sound) => {
		if (!canManage) return;
		savePreferences({ ...preferences, sound }, "Som de notificação salvo.");
	};

	const toggleType = (key) => {
		if (!canManage) return;
		savePreferences(
			{
				...preferences,
				enabledTypes: {
					...preferences.enabledTypes,
					[key]: preferences.enabledTypes?.[key] === false,
				},
			},
			"Preferência de notificação salva.",
		);
	};

	const updateQuietHours = (patch) => {
		if (!canManage) return;
		savePreferences(
			{
				...preferences,
				quietHours: {
					...preferences.quietHours,
					...patch,
				},
			},
			"Horário silencioso salvo.",
		);
	};

	const handleDefaultAvatar = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setSaving(true);
		setMessage("");
		try {
			validateImageFile(file);
			const avatarUrl = await enviarAvatarAdmin(file);
			await savePreferences(
				{ ...preferences, defaultAvatarUrl: avatarUrl },
				"Avatar padrão salvo.",
			);
		} catch (error) {
			setMessage(error?.message || "Não foi possível salvar o avatar padrão.");
		} finally {
			setSaving(false);
		}
	};

	const testWelcomeModal = () => {
		window.dispatchEvent(new CustomEvent(welcomeModalEvent));
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			{!canManage ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Você está em modo somente leitura. Alterações de configuração exigem
					permissão de gerenciamento.
				</div>
			) : null}

			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
						<BellRing size={24} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-950">
							Configurações Gerais
						</h1>
						<p className="text-sm font-semibold text-slate-500">
							Preferências de notificações e avisos do sistema.
						</p>
					</div>
				</div>
			</section>

			{message ? (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-black text-blue-800">
					{message}
				</div>
			) : null}

			{isAdmin ? (
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex items-start gap-4">
							<div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-orange-50 text-orange-600">
								<img
									src={welcomeModalImage}
									alt=""
									className="h-full w-full object-cover"
								/>
							</div>
							<div>
								<h2 className="text-lg font-black text-slate-950">
									Modal de boas-vindas
								</h2>
								<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
									Todo usuário verá este aviso uma vez após entrar no sistema.
									Use o teste para conferir a experiência antes de liberar.
								</p>
							</div>
						</div>
						<button
							type="button"
							onClick={testWelcomeModal}
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-600"
						>
							<Image size={17} /> Testar modal
						</button>
					</div>
				</section>
			) : null}

			{isAdmin ? (
				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex items-start gap-4">
							<div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-blue-700">
								{preferences.defaultAvatarUrl ? (
									<img
										src={preferences.defaultAvatarUrl}
										alt="Avatar padrão"
										className="h-full w-full object-cover"
									/>
								) : (
									<Camera size={24} />
								)}
							</div>
							<div>
								<h2 className="text-lg font-black text-slate-950">
									Avatar padrão do sistema
								</h2>
								<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
									Usuários sem avatar próprio exibirão esta imagem. Aceita
									apenas JPG ou PNG até 600 KB. No Finan, ao enviar um novo
									avatar padrão, todos os usuários cadastrados são atualizados.
								</p>
							</div>
						</div>
						<div className="flex flex-col gap-2 sm:flex-row">
							<label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
								<Camera size={17} /> Enviar avatar
								<input
									type="file"
									accept={AVATAR_ACCEPT}
									disabled={saving || !canManage}
									onChange={handleDefaultAvatar}
									className="hidden"
								/>
							</label>
							{preferences.defaultAvatarUrl ? (
								<button
									type="button"
									disabled={saving || !canManage}
									onClick={() =>
										savePreferences(
											{ ...preferences, defaultAvatarUrl: "" },
											"Avatar padrão removido.",
										)
									}
									className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100"
								>
									<Trash2 size={17} /> Remover
								</button>
							) : null}
						</div>
					</div>
				</section>
			) : null}

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
					<div className="max-w-2xl">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
								<Volume2 size={21} />
							</div>
							<div>
								<h2 className="text-lg font-black text-slate-950">
									Som das notificações
								</h2>
								<p className="text-sm font-semibold text-slate-500">
									Escolha o som tocado quando chegar uma nova notificação no
									sininho.
								</p>
							</div>
						</div>

						<div className="mt-5 grid gap-3 sm:grid-cols-2">
							{NOTIFICATION_SOUNDS.map((option) => (
								<button
									key={option.value}
									type="button"
									disabled={saving || !canManage}
									onClick={() => changeSound(option.value)}
									className={`rounded-2xl border p-4 text-left transition ${
										preferences.sound === option.value
											? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm"
											: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
									} disabled:opacity-60`}
								>
									<p className="text-sm font-black">{option.label}</p>
									<p className="mt-1 text-xs font-semibold text-slate-500">
										{option.value === "none"
											? "Não tocar som."
											: "Tocar quando houver alerta novo."}
									</p>
								</button>
							))}
						</div>
					</div>

					<button
						type="button"
						disabled={saving || !canManage}
						onClick={() => playSelectedNotificationSound(preferences.sound)}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
					>
						{saving ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Volume2 size={17} />
						)}{" "}
						Testar som
					</button>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">
					Tipos de notificação
				</h2>
				<p className="mt-1 text-sm font-semibold text-slate-500">
					Ative apenas os avisos que você quer receber no sininho.
				</p>
				<div className="mt-5 grid gap-3 lg:grid-cols-2">
					{NOTIFICATION_TYPES.map((item) => {
						const enabled = preferences.enabledTypes?.[item.key] !== false;
						return (
							<button
								key={item.key}
								type="button"
								disabled={saving || !canManage}
								onClick={() => toggleType(item.key)}
								className={`rounded-2xl border p-4 text-left transition ${
									enabled
										? "border-emerald-200 bg-emerald-50 text-emerald-900"
										: "border-slate-200 bg-slate-50 text-slate-500"
								} disabled:opacity-60`}
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-black">{item.label}</p>
										<p className="mt-1 text-xs font-semibold leading-relaxed">
											{item.description}
										</p>
									</div>
									<span
										className={`rounded-full px-2.5 py-1 text-[11px] font-black ${enabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}
									>
										{enabled ? "Ativo" : "Pausado"}
									</span>
								</div>
							</button>
						);
					})}
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
						<Clock size={20} />
					</div>
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Horário silencioso
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Use para manter o sino visual, mas sem som em um período
							específico.
						</p>
					</div>
				</div>

				<div className="mt-5 grid gap-3 md:grid-cols-[1fr_160px_160px]">
					<label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
						<span>
							<span className="block text-sm font-black text-slate-950">
								Ativar horário silencioso
							</span>
							<span className="text-xs font-semibold text-slate-500">
								Quando ativo, o sistema não toca som no período abaixo.
							</span>
						</span>
						<input
							type="checkbox"
							checked={Boolean(preferences.quietHours?.enabled)}
							onChange={(event) =>
								updateQuietHours({ enabled: event.target.checked })
							}
							disabled={!canManage}
							className="h-5 w-5 accent-blue-600"
						/>
					</label>
					<label className="rounded-2xl border border-slate-200 p-4">
						<span className="text-xs font-black uppercase text-slate-500">
							Início
						</span>
						<input
							type="time"
							value={preferences.quietHours?.start || "22:00"}
							onChange={(event) =>
								updateQuietHours({ start: event.target.value })
							}
							disabled={!canManage}
							className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-blue-400"
						/>
					</label>
					<label className="rounded-2xl border border-slate-200 p-4">
						<span className="text-xs font-black uppercase text-slate-500">
							Fim
						</span>
						<input
							type="time"
							value={preferences.quietHours?.end || "07:00"}
							onChange={(event) =>
								updateQuietHours({ end: event.target.value })
							}
							disabled={!canManage}
							className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-blue-400"
						/>
					</label>
				</div>
			</section>
		</div>
	);
}
