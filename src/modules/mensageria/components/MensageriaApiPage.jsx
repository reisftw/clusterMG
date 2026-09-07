import {
	AlertTriangle,
	FileClock,
	LogOut,
	MessageCircle,
	QrCode,
	RefreshCw,
	Save,
	Server,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	buscarConfigMensageria,
	buscarLogsDisconnectEvolutionMensageria,
	buscarStatusEvolutionMensageria,
	conectarEvolutionMensageria,
	configurarWebhookEvolutionMensageria,
	desconectarEvolutionMensageria,
	salvarConfigMensageria,
} from "../services/mensageriaService";

const findEvolutionQrValue = (payload) => {
	const candidates = [
		payload?.connect?.base64,
		payload?.connect?.qrcode?.base64,
		payload?.connect?.qrcode,
		payload?.connect?.qr,
		payload?.connect?.code,
		payload?.connect?.pairingCode,
		payload?.create?.base64,
		payload?.create?.qrcode?.base64,
		payload?.create?.qrcode,
		payload?.base64,
		payload?.qrcode?.base64,
		payload?.qrcode,
		payload?.code,
		payload?.pairingCode,
	];
	return (
		candidates.find((value) => typeof value === "string" && value.trim()) || ""
	);
};

const toQrImageSrc = (value) => {
	const text = String(value || "").trim();
	if (!text) return "";
	if (text.startsWith("data:image")) return text;
	if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length > 100) {
		return `data:image/png;base64,${text}`;
	}
	return "";
};

const getProviderLabel = (provider) => {
	if (provider === "official_whatsapp") return "WhatsApp oficial";
	return "Evolution API";
};

const getConnectionLabel = (connection = {}) => {
	if (connection.connected) return "Conectado";
	if (connection.state === "connecting") return "Aguardando QR";
	if (connection.state === "close") return "Desconectado";
	return connection.state || "Não configurado";
};

const providerButtonClass = (active) =>
	`rounded-md px-4 py-2 text-sm font-bold transition ${
		active
			? "bg-blue-600 text-white shadow-sm"
			: "text-slate-600 hover:bg-white"
	}`;

const formatDateTime = (value) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
};

function LoadingApiState() {
	return (
		<div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white">
			<div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
				<RefreshCw size={18} className="animate-spin" />
				Carregando API da Mensageria...
			</div>
		</div>
	);
}

function ApiHeader({ onRefresh, onSave, saving, canManage }) {
	return (
		<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
						<Server size={22} />
					</span>
					<div>
						<h1 className="text-2xl font-bold text-slate-900">
							API da Mensageria
						</h1>
						<p className="mt-1 text-sm text-slate-500">
							Configure a Evolution API, gere o QR Code e acompanhe o estado da
							conexão.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={onRefresh}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						<RefreshCw size={17} />
						Atualizar
					</button>
					<button
						type="button"
						onClick={onSave}
						disabled={saving || !canManage}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Save size={17} />
						{saving ? "Salvando..." : "Salvar API"}
					</button>
				</div>
			</div>
		</section>
	);
}

function FeedbackBanner({ feedback }) {
	if (!feedback) return null;
	return (
		<div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
			{feedback}
		</div>
	);
}

function StatusCards({ status, config, connection, connectionLabel }) {
	return (
		<section className="grid gap-4 md:grid-cols-5">
			<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-xs font-bold uppercase tracking-wide text-slate-500">
					Worker
				</p>
				<p className="mt-2 text-lg font-bold text-slate-900">
					{status?.worker?.workerActive ? "Ativo" : "Inativo"}
				</p>
			</div>
			<div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
				<p className="text-xs font-bold uppercase tracking-wide text-blue-700">
					Sistema
				</p>
				<p className="mt-2 text-lg font-bold text-blue-950">
					{getProviderLabel(config.whatsappProvider || "evolution")}
				</p>
			</div>
			<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-xs font-bold uppercase tracking-wide text-slate-500">
					Fila
				</p>
				<p className="mt-2 text-lg font-bold text-slate-900">
					{config.evolutionPaused ? "Pausada" : "Automática"}
				</p>
			</div>
			<div
				className={`rounded-lg border p-4 shadow-sm ${connection.connected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
			>
				<p className="text-xs font-bold uppercase tracking-wide text-slate-500">
					WhatsApp
				</p>
				<p
					className={`mt-2 text-lg font-bold ${connection.connected ? "text-emerald-800" : "text-slate-900"}`}
				>
					{connectionLabel}
				</p>
				<p className="mt-1 text-xs font-semibold text-slate-600">
					{connection.number || "Número não identificado"}
				</p>
			</div>
			<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-xs font-bold uppercase tracking-wide text-slate-500">
					Último erro
				</p>
				<p className="mt-2 text-sm font-semibold text-slate-700">
					{status?.worker?.lastError || "-"}
				</p>
			</div>
		</section>
	);
}

function ProviderSelector({ provider, onChange, canManage }) {
	return (
		<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-lg font-bold text-slate-900">Sistema de envio</h2>
					<p className="mt-1 text-sm text-slate-500">
						Escolha entre Evolution API ou WhatsApp oficial da Meta.
					</p>
				</div>
				<div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
					<button
						type="button"
						onClick={() => onChange("evolution")}
						disabled={!canManage}
						className={providerButtonClass(provider === "evolution")}
					>
						Evolution API
					</button>
					<button
						type="button"
						onClick={() => onChange("official_whatsapp")}
						disabled={!canManage}
						className={providerButtonClass(provider === "official_whatsapp")}
					>
						WhatsApp oficial
					</button>
				</div>
			</div>
		</section>
	);
}

function OfficialWhatsappSection({ config, updateConfig, canManage }) {
	if (config.whatsappProvider !== "official_whatsapp") return null;
	return (
		<section className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
			<div className="flex items-center gap-2 text-slate-900">
				<ShieldCheck size={18} className="text-emerald-600" />
				<h2 className="text-lg font-bold">WhatsApp oficial</h2>
			</div>
			<p className="mt-1 text-sm text-slate-500">
				Configuração compatível com WhatsApp Cloud API. O envio fora da janela
				de atendimento deve usar template aprovado.
			</p>
			<div className="mt-5 grid gap-4 md:grid-cols-2">
				<label className="block">
					<span className="text-sm font-semibold text-slate-700">
						Base URL Graph API
					</span>
					<input
						value={config.officialWhatsappBaseUrl || ""}
						onChange={(event) =>
							updateConfig("officialWhatsappBaseUrl", event.target.value)
						}
						disabled={!canManage}
						placeholder="https://graph.facebook.com/v20.0"
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<label className="block">
					<span className="text-sm font-semibold text-slate-700">
						Phone Number ID
					</span>
					<input
						value={config.officialWhatsappPhoneNumberId || ""}
						onChange={(event) =>
							updateConfig("officialWhatsappPhoneNumberId", event.target.value)
						}
						disabled={!canManage}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<label className="block">
					<span className="text-sm font-semibold text-slate-700">
						Business Account ID
					</span>
					<input
						value={config.officialWhatsappBusinessAccountId || ""}
						onChange={(event) =>
							updateConfig(
								"officialWhatsappBusinessAccountId",
								event.target.value,
							)
						}
						disabled={!canManage}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<label className="block">
					<span className="text-sm font-semibold text-slate-700">
						Webhook Verify Token
					</span>
					<input
						value={config.officialWebhookVerifyToken || ""}
						onChange={(event) =>
							updateConfig("officialWebhookVerifyToken", event.target.value)
						}
						disabled={!canManage}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<label className="block md:col-span-2">
					<span className="text-sm font-semibold text-slate-700">
						Access Token
					</span>
					<input
						type="password"
						value={config.officialWhatsappAccessToken || ""}
						onChange={(event) =>
							updateConfig("officialWhatsappAccessToken", event.target.value)
						}
						disabled={!canManage}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<label className="block">
					<span className="text-sm font-semibold text-slate-700">
						Template aprovado
					</span>
					<input
						value={config.officialWhatsappTemplateName || ""}
						onChange={(event) =>
							updateConfig("officialWhatsappTemplateName", event.target.value)
						}
						disabled={!canManage}
						placeholder="nome_do_template"
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<label className="block">
					<span className="text-sm font-semibold text-slate-700">
						Idioma do template
					</span>
					<input
						value={config.officialWhatsappTemplateLanguage || "pt_BR"}
						onChange={(event) =>
							updateConfig(
								"officialWhatsappTemplateLanguage",
								event.target.value,
							)
						}
						disabled={!canManage}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600 md:col-span-2">
					Webhook oficial: https://retiradas.tech/api/webhooks/whatsapp-official
				</div>
			</div>
		</section>
	);
}

function EvolutionDisconnectLogsModal({ logs, loading, onClose, onRefresh }) {
	return (
		<ModalShell
			title="Logs de queda da Evolution"
			description="Eventos em que a conexão caiu e a fila foi pausada automaticamente."
			icon={
				<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700">
					<AlertTriangle size={22} />
				</span>
			}
			onClose={onClose}
			size="5xl"
			footer={
				<div className="flex justify-end">
					<button
						type="button"
						onClick={onRefresh}
						disabled={loading}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<RefreshCw size={16} className={loading ? "animate-spin" : ""} />
						Atualizar logs
					</button>
				</div>
			}
		>
			{loading ? (
				<div className="flex min-h-40 items-center justify-center text-sm font-semibold text-slate-500">
					<RefreshCw size={18} className="mr-2 animate-spin" />
					Carregando logs...
				</div>
			) : logs.length ? (
				<div className="space-y-3">
					{logs.map((log) => (
						<article
							key={log.id}
							className="rounded-xl border border-slate-200 bg-slate-50 p-4"
						>
							<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
								<div>
									<p className="text-sm font-black text-slate-950">
										{log.reason || "Conexão Evolution fechada."}
									</p>
									<p className="mt-1 text-xs font-semibold text-slate-500">
										{formatDateTime(log.createdAt)} · Origem:{" "}
										{log.source || "system"}
									</p>
								</div>
								<span className="inline-flex w-fit rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-800">
									{log.state || "desconectado"}
								</span>
							</div>
							<div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 md:grid-cols-3">
								<span>Instância: {log.instance || "-"}</span>
								<span>Número: {log.number || "-"}</span>
								<span>
									Fila: {log.pausedQueue ? "pausada automaticamente" : "-"}
								</span>
							</div>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
					<p className="text-sm font-bold text-slate-700">
						Nenhuma queda registrada ainda.
					</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">
						Quando a Evolution sinalizar desconexão, banimento ou fechamento da
						instância, o evento aparece aqui.
					</p>
				</div>
			)}
		</ModalShell>
	);
}

const MensageriaApiPage = () => {
	const { currentUser } = useAuthContext();
	const canManage =
		hasPermission(currentUser, "mensageria.api.manage") ||
		hasPermission(currentUser, "manage_mensageria");
	const [config, setConfig] = useState({});
	const [status, setStatus] = useState(null);
	const guidedScheduleToggleId = useId();
	const [qr, setQr] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [disconnectLogsOpen, setDisconnectLogsOpen] = useState(false);
	const [disconnectLogs, setDisconnectLogs] = useState([]);
	const [disconnectLogsLoading, setDisconnectLogsLoading] = useState(false);
	const connection = status?.connection || {};
	const connectionLabel = getConnectionLabel(connection);
	const provider = config.whatsappProvider || "evolution";

	const loadData = async () => {
		setLoading(true);
		try {
			const nextConfig = await buscarConfigMensageria();
			setConfig(nextConfig);
			setStatus(await buscarStatusEvolutionMensageria().catch(() => null));
		} catch (error) {
			setFeedback(
				error?.message || "Não foi possível carregar a API da Mensageria.",
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const updateConfig = (field, value) => {
		setConfig((current) => ({ ...current, [field]: value }));
	};

	const syncSelectedEvolutionAccount = (nextConfig) => {
		const accounts = Array.isArray(nextConfig.evolutionAccounts)
			? nextConfig.evolutionAccounts
			: [];
		const selected = accounts.find(
			(account) => account.id === nextConfig.evolutionSelectedAccountId,
		);
		if (!selected) return nextConfig;
		return {
			...nextConfig,
			evolutionBaseUrl: selected.baseUrl || "",
			evolutionInstance: selected.instance || "",
			evolutionApiKey: selected.apiKey || "",
		};
	};

	const singleEvolutionConfig = (nextConfig) => ({
		...nextConfig,
		evolutionAccounts: [],
		evolutionSelectedAccountId: "default",
	});

	const updateProvider = (provider) => {
		const currentProvider = config.whatsappProvider || "evolution";
		if (provider === currentProvider) return;
		const confirmed = window.confirm(
			`Confirmar troca do sistema de envio de ${getProviderLabel(currentProvider)} para ${getProviderLabel(provider)}?`,
		);
		if (!confirmed) return;
		setConfig((current) => ({
			...current,
			whatsappProvider: provider,
			evolutionEnabled:
				provider === "evolution" ? current.evolutionEnabled : false,
			officialWhatsappEnabled: provider === "official_whatsapp",
		}));
	};

	const handleSave = async () => {
		setSaving(true);
		setFeedback("");
		try {
			await salvarConfigMensageria(
				singleEvolutionConfig(syncSelectedEvolutionAccount(config)),
			);
			setFeedback("Configurações da API da Mensageria salvas.");
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível salvar a configuração.");
		} finally {
			setSaving(false);
		}
	};

	const handleConnect = async () => {
		setSaving(true);
		setFeedback("");
		setQr(null);
		try {
			await salvarConfigMensageria(
				singleEvolutionConfig(
					syncSelectedEvolutionAccount({
						...config,
						whatsappProvider: "evolution",
					}),
				),
			);
			const result = await conectarEvolutionMensageria();
			const raw = findEvolutionQrValue(result);
			setQr({ raw, imageSrc: toQrImageSrc(raw) });
			setFeedback(
				raw
					? "QR Code gerado. Escaneie pelo WhatsApp."
					: "Instância acionada, mas a Evolution não retornou QR Code.",
			);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível gerar o QR Code.");
		} finally {
			setSaving(false);
		}
	};

	const handleDisconnect = async () => {
		setSaving(true);
		setFeedback("");
		setQr(null);
		try {
			await desconectarEvolutionMensageria();
			setFeedback("WhatsApp desconectado.");
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível desconectar o WhatsApp.");
		} finally {
			setSaving(false);
		}
	};

	const handleConfigureWebhook = async () => {
		setSaving(true);
		setFeedback("");
		try {
			await salvarConfigMensageria(syncSelectedEvolutionAccount(config));
			await configurarWebhookEvolutionMensageria(config.evolutionWebhookUrl);
			setFeedback(
				"Webhook de respostas configurado. As próximas respostas dos clientes serão registradas.",
			);
			await loadData();
		} catch (error) {
			setFeedback(
				error?.message || "Não foi possível configurar o webhook de respostas.",
			);
		} finally {
			setSaving(false);
		}
	};

	const loadDisconnectLogs = async () => {
		setDisconnectLogsLoading(true);
		try {
			const result = await buscarLogsDisconnectEvolutionMensageria(80);
			setDisconnectLogs(Array.isArray(result?.items) ? result.items : []);
		} catch (error) {
			setFeedback(
				error?.message ||
					"Não foi possível carregar os logs de queda da Evolution.",
			);
		} finally {
			setDisconnectLogsLoading(false);
		}
	};

	const openDisconnectLogs = () => {
		setDisconnectLogsOpen(true);
		loadDisconnectLogs();
	};

	if (loading) {
		return <LoadingApiState />;
	}

	return (
		<div className="space-y-6">
			<ApiHeader
				onRefresh={loadData}
				onSave={handleSave}
				saving={saving}
				canManage={canManage}
			/>
			<FeedbackBanner feedback={feedback} />
			<StatusCards
				status={status}
				config={config}
				connection={connection}
				connectionLabel={connectionLabel}
			/>
			<ProviderSelector
				provider={provider}
				onChange={updateProvider}
				canManage={canManage}
			/>

			<OfficialWhatsappSection
				config={config}
				updateConfig={updateConfig}
				canManage={canManage}
			/>

			{(config.whatsappProvider || "evolution") === "evolution" ? (
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
					<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="flex items-center gap-2 text-slate-900">
								<MessageCircle size={18} className="text-emerald-600" />
								<h2 className="text-lg font-bold">Evolution API</h2>
							</div>
							<button
								type="button"
								onClick={openDisconnectLogs}
								className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
							>
								<FileClock size={16} />
								Logs
							</button>
						</div>
						<div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
							<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
								<div>
									<p className="text-sm font-bold text-blue-900">
										Conta principal Evolution
									</p>
									<p className="mt-1 text-xs font-semibold text-blue-700">
										O envio utiliza somente a instância configurada abaixo. Ao
										pausar e iniciar novamente, a fila continua do próximo
										cliente pendente.
									</p>
								</div>
								<span
									className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
										connection.connected
											? "bg-emerald-100 text-emerald-800"
											: "bg-slate-100 text-slate-600"
									}`}
								>
									{connection.connected ? "Conectada" : connectionLabel}
								</span>
							</div>
							<div className="mt-3 grid gap-3 md:grid-cols-3">
								<div className="rounded-lg border border-blue-200 bg-white px-3 py-2">
									<p className="text-xs font-bold uppercase text-blue-500">
										Instância
									</p>
									<p className="mt-1 text-sm font-bold text-blue-950">
										{config.evolutionInstance || "-"}
									</p>
								</div>
								<div className="rounded-lg border border-blue-200 bg-white px-3 py-2">
									<p className="text-xs font-bold uppercase text-blue-500">
										Número conectado
									</p>
									<p className="mt-1 text-sm font-bold text-blue-950">
										{connection.number || "-"}
									</p>
								</div>
								<div className="rounded-lg border border-blue-200 bg-white px-3 py-2">
									<p className="text-xs font-bold uppercase text-blue-500">
										Fila
									</p>
									<p className="mt-1 text-sm font-bold text-blue-950">
										{config.evolutionPaused ? "Pausada" : "Automática"}
									</p>
								</div>
							</div>
						</div>
						<div className="mt-5 grid gap-4 md:grid-cols-2">
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									URL da Evolution
								</span>
								<input
									value={config.evolutionBaseUrl || ""}
									onChange={(event) =>
										updateConfig("evolutionBaseUrl", event.target.value)
									}
									disabled={!canManage}
									placeholder="http://127.0.0.1:8080"
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Instância
								</span>
								<input
									value={config.evolutionInstance || ""}
									onChange={(event) =>
										updateConfig("evolutionInstance", event.target.value)
									}
									disabled={!canManage}
									placeholder="retiradas"
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block md:col-span-2">
								<span className="text-sm font-semibold text-slate-700">
									API Key
								</span>
								<input
									value={config.evolutionApiKey || ""}
									onChange={(event) =>
										updateConfig("evolutionApiKey", event.target.value)
									}
									disabled={!canManage}
									placeholder="apikey da Evolution"
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Delay mínimo entre envios
								</span>
								<input
									type="number"
									min="5"
									value={config.evolutionMinDelaySeconds || 45}
									onChange={(event) =>
										updateConfig("evolutionMinDelaySeconds", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Delay máximo entre envios
								</span>
								<input
									type="number"
									min="10"
									value={config.evolutionMaxDelaySeconds || 120}
									onChange={(event) =>
										updateConfig("evolutionMaxDelaySeconds", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block md:col-span-2">
								<span className="text-sm font-semibold text-slate-700">
									Webhook de respostas
								</span>
								<input
									value={config.evolutionWebhookUrl || ""}
									onChange={(event) =>
										updateConfig("evolutionWebhookUrl", event.target.value)
									}
									disabled={!canManage}
									placeholder="https://retiradas.tech/api/webhooks/evolution"
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
								<p className="mt-1 text-xs font-medium text-slate-500">
									Esse endpoint recebe as mensagens dos clientes para registrar
									respostas e criar agendamentos.
								</p>
							</label>
						</div>
					</div>

					<div className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
						<div className="flex items-center gap-2 text-slate-900">
							<ShieldCheck size={18} className="text-blue-600" />
							<h2 className="text-lg font-bold">Conexão WhatsApp</h2>
						</div>
						<button
							type="button"
							onClick={handleConnect}
							disabled={saving || !canManage}
							className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<QrCode size={17} />
							{saving ? "Gerando..." : "Gerar QR Code"}
						</button>
						{connection.connected ? (
							<button
								type="button"
								onClick={handleDisconnect}
								disabled={saving || !canManage}
								className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<LogOut size={17} />
								Desconectar aparelho
							</button>
						) : null}
						<button
							type="button"
							onClick={handleConfigureWebhook}
							disabled={saving || !canManage}
							className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
						>
							Configurar respostas
						</button>
						{config.evolutionWebhookConfiguredAt ? (
							<p className="mt-2 text-xs font-semibold text-emerald-700">
								Webhook configurado em{" "}
								{new Date(config.evolutionWebhookConfiguredAt).toLocaleString(
									"pt-BR",
								)}
							</p>
						) : null}

						{qr ? (
							<div className="mt-4">
								{qr.imageSrc ? (
									<img
										src={qr.imageSrc}
										alt="QR Code WhatsApp Evolution"
										className="mx-auto h-64 w-64 rounded-lg border border-blue-200 bg-white object-contain p-2"
									/>
								) : (
									<code className="block break-all rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-slate-800">
										{qr.raw || "QR Code não retornado pela Evolution."}
									</code>
								)}
								<p className="mt-3 text-sm text-slate-600">
									Abra o WhatsApp, acesse aparelhos conectados e escaneie o QR
									Code.
								</p>
							</div>
						) : (
							<p className="mt-4 text-sm text-slate-500">
								Salve a API e gere o QR Code para conectar o aparelho.
							</p>
						)}
					</div>
				</section>
			) : null}

			{disconnectLogsOpen ? (
				<EvolutionDisconnectLogsModal
					logs={disconnectLogs}
					loading={disconnectLogsLoading}
					onClose={() => setDisconnectLogsOpen(false)}
					onRefresh={loadDisconnectLogs}
				/>
			) : null}

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-2 text-slate-900">
					<MessageCircle size={18} className="text-blue-600" />
					<h2 className="text-lg font-bold">Mensagens padrão de resposta</h2>
				</div>
				<p className="mt-1 text-sm text-slate-500">
					Textos enviados automaticamente quando o cliente responde pelo
					WhatsApp.
				</p>
				<div className="mt-5 grid gap-4 lg:grid-cols-2">
					<label
						htmlFor={guidedScheduleToggleId}
						className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 lg:col-span-2"
					>
						<input
							id={guidedScheduleToggleId}
							type="checkbox"
							checked={config.guidedScheduleEnabled !== false}
							onChange={(event) =>
								updateConfig("guidedScheduleEnabled", event.target.checked)
							}
							disabled={!canManage}
							className="h-5 w-5 rounded border-slate-300 text-blue-600"
						/>
						<span>
							<span className="block text-sm font-bold text-slate-900">
								Fluxo guiado de agendamento
							</span>
							<span className="text-xs font-semibold text-slate-600">
								Quando o cliente responder SIM, o bot envia opções de data e
								depois opções de horário.
							</span>
						</span>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Sem data ou horário
						</span>
						<textarea
							rows={5}
							value={config.replyNoScheduleMessage || ""}
							onChange={(event) =>
								updateConfig("replyNoScheduleMessage", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Cliente não localizado
						</span>
						<textarea
							rows={5}
							value={config.replyUnmatchedMessage || ""}
							onChange={(event) =>
								updateConfig("replyUnmatchedMessage", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Após agendamento criado
						</span>
						<textarea
							rows={5}
							value={config.replyScheduledConfirmationMessage || ""}
							onChange={(event) =>
								updateConfig(
									"replyScheduledConfirmationMessage",
									event.target.value,
								)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
						<p className="mt-1 text-xs font-medium text-slate-500">
							Variáveis: {"{data_agendamento}"} e {"{hora_agendamento}"}.
						</p>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Opções de data
						</span>
						<textarea
							rows={5}
							value={config.guidedScheduleDateMessage || ""}
							onChange={(event) =>
								updateConfig("guidedScheduleDateMessage", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
						<p className="mt-1 text-xs font-medium text-slate-500">
							Variável: {"{opcoes_datas}"}.
						</p>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Opções de horário
						</span>
						<textarea
							rows={5}
							value={config.guidedScheduleTimeMessage || ""}
							onChange={(event) =>
								updateConfig("guidedScheduleTimeMessage", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
						<p className="mt-1 text-xs font-medium text-slate-500">
							Variável: {"{data_agendamento}"}.
						</p>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Data não entendida
						</span>
						<textarea
							rows={4}
							value={config.guidedScheduleInvalidDateMessage || ""}
							onChange={(event) =>
								updateConfig(
									"guidedScheduleInvalidDateMessage",
									event.target.value,
								)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Horário não entendido
						</span>
						<textarea
							rows={4}
							value={config.guidedScheduleInvalidTimeMessage || ""}
							onChange={(event) =>
								updateConfig(
									"guidedScheduleInvalidTimeMessage",
									event.target.value,
								)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Resposta após já estar agendado
						</span>
						<textarea
							rows={5}
							value={config.replyAfterScheduledMessage || ""}
							onChange={(event) =>
								updateConfig("replyAfterScheduledMessage", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
				</div>
			</section>
		</div>
	);
};

export default MensageriaApiPage;
