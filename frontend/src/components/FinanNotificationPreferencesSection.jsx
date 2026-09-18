import { Clock, Loader2, Volume2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
	fetchFinanNotificationPreferences,
	saveFinanNotificationPreferences,
} from "../api/finanApi";
import {
	FINAN_NOTIFICATION_SOUNDS,
	getFinanNotificationSound,
	playFinanNotificationSound,
	setFinanNotificationSound,
} from "../utils/finanNotificationSound";

const NOTIFICATION_TYPES = [
	{
		key: "import_orcamento",
		label: "Importação de orçamento",
		description: "Avisar quando um import de planilha de orçamento terminar.",
	},
	{
		key: "backup",
		label: "Backup",
		description: "Avisos de falha no backup automatizado do banco do Finan.",
	},
	{
		key: "integracao_erro",
		label: "Integrações",
		description: "Avisar quando uma integração (Hubsoft, Cvortex, Sênior) ficar em erro.",
	},
	{
		key: "calendario_alerta",
		label: "Calendário financeiro",
		description: "Avisar sobre eventos do calendário que vencem hoje.",
	},
	{
		key: "geral",
		label: "Geral",
		description: "Comunicados internos do Finan.",
	},
];

const DEFAULT_PREFERENCES = {
	sound: getFinanNotificationSound(),
	enabledTypes: Object.fromEntries(NOTIFICATION_TYPES.map((item) => [item.key, true])),
	quietHours: { enabled: false, start: "22:00", end: "07:00" },
};

export default function FinanNotificationPreferencesSection() {
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
	const [message, setMessage] = useState("");
	const quietHoursToggleId = useId();

	useEffect(() => {
		let active = true;
		fetchFinanNotificationPreferences()
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

	const savePreferences = async (nextPreferences, successMessage = "Preferência salva.") => {
		setPreferences(nextPreferences);
		setSaving(true);
		setMessage("");
		try {
			const saved = await saveFinanNotificationPreferences(nextPreferences);
			setPreferences({
				...nextPreferences,
				...(saved ?? null),
				enabledTypes: {
					...nextPreferences.enabledTypes,
					...(saved?.enabledTypes ?? null),
				},
			});
			setFinanNotificationSound(nextPreferences.sound);
			setMessage(successMessage);
			window.setTimeout(() => setMessage(""), 2600);
		} catch (error) {
			setMessage(error?.message || "Não foi possível salvar as preferências.");
		} finally {
			setSaving(false);
		}
	};

	const changeSound = (sound) => {
		savePreferences({ ...preferences, sound }, "Som de notificação salvo.");
	};

	const toggleType = (key) => {
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
		savePreferences(
			{ ...preferences, quietHours: { ...preferences.quietHours, ...patch } },
			"Horário silencioso salvo.",
		);
	};

	if (loading) {
		return (
			<p className="text-sm font-semibold text-slate-500">
				Carregando preferências...
			</p>
		);
	}

	return (
		<div className="space-y-6">
			{message ? (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-black text-blue-800">
					{message}
				</div>
			) : null}

			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
									sino.
								</p>
							</div>
						</div>

						<div className="mt-5 grid gap-3 sm:grid-cols-2">
							{FINAN_NOTIFICATION_SOUNDS.map((option) => (
								<button
									key={option.value}
									type="button"
									disabled={saving}
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
						disabled={saving}
						onClick={() => playFinanNotificationSound(preferences.sound)}
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
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Tipos de notificação</h2>
				<p className="mt-1 text-sm font-semibold text-slate-500">
					Ative apenas os avisos que você quer receber no sino.
				</p>
				<div className="mt-5 grid gap-3 lg:grid-cols-2">
					{NOTIFICATION_TYPES.map((item) => {
						const enabled = preferences.enabledTypes?.[item.key] !== false;
						return (
							<button
								key={item.key}
								type="button"
								disabled={saving}
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
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
					<label
						htmlFor={quietHoursToggleId}
						className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
					>
						<span>
							<span className="block text-sm font-black text-slate-950">
								Ativar horário silencioso
							</span>
							<span className="text-xs font-semibold text-slate-500">
								Quando ativo, o sistema não toca som no período abaixo.
							</span>
						</span>
						<input
							id={quietHoursToggleId}
							type="checkbox"
							checked={Boolean(preferences.quietHours?.enabled)}
							onChange={(event) => updateQuietHours({ enabled: event.target.checked })}
							aria-label="Ativar horário silencioso"
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
							onChange={(event) => updateQuietHours({ start: event.target.value })}
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
							onChange={(event) => updateQuietHours({ end: event.target.value })}
							className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-blue-400"
						/>
					</label>
				</div>
			</div>
		</div>
	);
}
