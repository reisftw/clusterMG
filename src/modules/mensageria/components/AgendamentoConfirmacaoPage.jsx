import {
	BarChart3,
	CheckCircle2,
	Clock,
	LogOut,
	MessageSquareText,
	QrCode,
	RefreshCw,
	Save,
	Send,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import {
	buscarConfigConfirmacaoAgendamentos,
	buscarEnviosConfirmacaoAgendamentos,
	buscarLogsConfirmacaoAgendamentos,
	buscarPreviaConfirmacaoAgendamentos,
	buscarRelatorioConfirmacaoAgendamentos,
	buscarStatusEvolutionConfirmacaoAgendamentos,
	conectarEvolutionConfirmacaoAgendamentos,
	configurarWebhookEvolutionConfirmacaoAgendamentos,
	desconectarEvolutionConfirmacaoAgendamentos,
	enviarTesteConfirmacaoAgendamentos,
	preencherResponsavelConfirmacaoAgendamentos,
	salvarConfigConfirmacaoAgendamentos,
} from "../services/agendamentoConfirmacaoService";

const PAGE_SIZES = [20, 30, 50, 100];

const statusLabels = {
	novo: "Novo",
	aguardando_resposta: "Aguardando resposta",
	confirmado: "Confirmado",
	sem_responsavel: "Sem responsável",
	sem_resposta_final: "Sem resposta final",
	sem_data_valida: "Sem data válida",
};

const statusClass = {
	novo: "border-blue-200 bg-blue-50 text-blue-700",
	aguardando_resposta: "border-amber-200 bg-amber-50 text-amber-700",
	confirmado: "border-emerald-200 bg-emerald-50 text-emerald-700",
	sem_responsavel: "border-slate-200 bg-slate-50 text-slate-700",
	sem_resposta_final: "border-red-200 bg-red-50 text-red-700",
	sem_data_valida: "border-red-200 bg-red-50 text-red-700",
};

const formatDateTime = (value) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	});
};

const formatDateKey = (value) => {
	if (!value) return "-";
	const [year, month, day] = String(value).split("-");
	if (!year || !month || !day) return value;
	return `${day}/${month}/${year}`;
};

const safeArray = (value) => (Array.isArray(value) ? value : []);

const Field = ({ label, children, helper }) => (
	<label className="block">
		<span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
			{label}
		</span>
		{children}
		{helper ? (
			<span className="mt-1 block text-xs text-slate-500">{helper}</span>
		) : null}
	</label>
);

const inputClass =
	"w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const textareaClass =
	"min-h-36 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

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

export default function AgendamentoConfirmacaoPage() {
	const [config, setConfig] = useState(null);
	const [worker, setWorker] = useState({});
	const [tracks, setTracks] = useState([]);
	const [logs, setLogs] = useState([]);
	const [report, setReport] = useState(null);
	const [evolutionStatus, setEvolutionStatus] = useState(null);
	const [qr, setQr] = useState(null);
	const [acceptedRepliesOpen, setAcceptedRepliesOpen] = useState(false);
	const [acceptedReplyDraft, setAcceptedReplyDraft] = useState("");
	const [logsOpen, setLogsOpen] = useState(false);
	const [logsPage, setLogsPage] = useState(1);
	const [logsPageSize, setLogsPageSize] = useState(20);
	const [logsLoading, setLogsLoading] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [preview, setPreview] = useState(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [manualResponsibleTrack, setManualResponsibleTrack] = useState(null);
	const [manualResponsibleForm, setManualResponsibleForm] = useState({
		nome: "",
		telefone: "",
		email: "",
	});
	const [testForm, setTestForm] = useState({
		telefone: "",
		nome: "Responsável Teste",
		type: "morning",
	});
	const [pageSize, setPageSize] = useState(20);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [working, setWorking] = useState(false);
	const [feedback, setFeedback] = useState("");

	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			const offset = (page - 1) * pageSize;
			const [configResponse, nextTracks, nextReport] = await Promise.all([
				buscarConfigConfirmacaoAgendamentos(),
				buscarEnviosConfirmacaoAgendamentos({ limit: pageSize, offset }),
				buscarRelatorioConfirmacaoAgendamentos().catch(() => null),
			]);
			setConfig(configResponse.config);
			setWorker(configResponse.worker || {});
			setTracks(nextTracks);
			setReport(nextReport);
			const nextEvolutionStatus =
				await buscarStatusEvolutionConfirmacaoAgendamentos().catch(() => null);
			setEvolutionStatus(nextEvolutionStatus);
		} catch (error) {
			setFeedback(
				error?.message ||
					"Não foi possível carregar a confirmação de agendamentos.",
			);
		} finally {
			setLoading(false);
		}
	}, [page, pageSize]);

	useEffect(() => {
		loadData();
		const timer = window.setInterval(loadData, 30000);
		return () => window.clearInterval(timer);
	}, [loadData]);

	const loadLogs = useCallback(
		async ({ nextPage = logsPage, nextPageSize = logsPageSize } = {}) => {
			setLogsLoading(true);
			setFeedback("");
			try {
				const offset = (nextPage - 1) * nextPageSize;
				const nextLogs = await buscarLogsConfirmacaoAgendamentos({
					limit: nextPageSize,
					offset,
				});
				setLogs(nextLogs);
			} catch (error) {
				setFeedback(error?.message || "Não foi possível carregar os logs.");
			} finally {
				setLogsLoading(false);
			}
		},
		[logsPage, logsPageSize],
	);

	useEffect(() => {
		if (!logsOpen) return;
		loadLogs();
	}, [loadLogs, logsOpen]);

	const stats = useMemo(() => {
		const totals = report?.totals || {};
		return [
			{ label: "Mensagens", value: totals.mensagens || 0, tone: "blue" },
			{ label: "Confirmações", value: totals.confirmacoes || 0, tone: "green" },
			{
				label: "Escalonamentos",
				value: totals.escalonamentos || 0,
				tone: "amber",
			},
			{
				label: "Sem resposta final",
				value: totals.semRespostaFinal || 0,
				tone: "red",
			},
		];
	}, [report]);

	const updateConfig = (field, value) => {
		setConfig((current) => ({ ...(current || {}), [field]: value }));
	};

	const addAcceptedReply = () => {
		const value = acceptedReplyDraft.trim().toUpperCase();
		if (!value) return;
		setConfig((current) => {
			const currentReplies = safeArray(current?.acceptedReplies);
			if (currentReplies.some((item) => item.toUpperCase() === value))
				return current;
			return {
				...(current || {}),
				acceptedReplies: [...currentReplies, value],
			};
		});
		setAcceptedReplyDraft("");
	};

	const removeAcceptedReply = (value) => {
		setConfig((current) => ({
			...(current || {}),
			acceptedReplies: safeArray(current?.acceptedReplies).filter(
				(item) => item !== value,
			),
		}));
	};

	const handleSave = async () => {
		setWorking(true);
		setFeedback("");
		try {
			const saved = await salvarConfigConfirmacaoAgendamentos(config || {});
			setConfig(saved);
			setFeedback("Configurações salvas.");
		} catch (error) {
			setFeedback(error?.message || "Não foi possível salvar.");
		} finally {
			setWorking(false);
		}
	};

	const handleSaveAcceptedReplies = async () => {
		setWorking(true);
		setFeedback("");
		try {
			const saved = await salvarConfigConfirmacaoAgendamentos(config || {});
			setConfig(saved);
			setAcceptedRepliesOpen(false);
			setFeedback("Respostas aceitas atualizadas.");
		} catch (error) {
			setFeedback(
				error?.message || "Não foi possível salvar as respostas aceitas.",
			);
		} finally {
			setWorking(false);
		}
	};

	const handleConnectEvolution = async () => {
		setWorking(true);
		setFeedback("");
		setQr(null);
		try {
			const saved = await salvarConfigConfirmacaoAgendamentos(config || {});
			setConfig(saved);
			const result = await conectarEvolutionConfirmacaoAgendamentos();
			const raw = findEvolutionQrValue(result);
			setQr({ raw, imageSrc: toQrImageSrc(raw) });
			setFeedback(
				raw
					? "QR Code gerado. Escaneie pelo WhatsApp."
					: "A Evolution não retornou QR Code.",
			);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível gerar o QR Code.");
		} finally {
			setWorking(false);
		}
	};

	const handleDisconnectEvolution = async () => {
		setWorking(true);
		setFeedback("");
		setQr(null);
		try {
			await desconectarEvolutionConfirmacaoAgendamentos();
			setFeedback("Aparelho desconectado.");
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível desconectar.");
		} finally {
			setWorking(false);
		}
	};

	const handleConfigureEvolutionWebhook = async () => {
		setWorking(true);
		setFeedback("");
		try {
			const saved = await salvarConfigConfirmacaoAgendamentos(config || {});
			setConfig(saved);
			await configurarWebhookEvolutionConfirmacaoAgendamentos(
				saved.evolutionWebhookUrl || "",
			);
			setFeedback("Webhook da Evolution da confirmação configurado.");
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível configurar o webhook.");
		} finally {
			setWorking(false);
		}
	};

	const handleSendTest = async () => {
		setWorking(true);
		setFeedback("");
		try {
			const result = await enviarTesteConfirmacaoAgendamentos(testForm);
			setFeedback(
				`TESTE enviado para ${result?.telefone || testForm.telefone}.`,
			);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível enviar o teste.");
		} finally {
			setWorking(false);
		}
	};

	const openManualResponsible = (track) => {
		setManualResponsibleTrack(track);
		setManualResponsibleForm({ nome: "", telefone: "", email: "" });
	};

	const handleSaveManualResponsible = async () => {
		if (!manualResponsibleTrack?.id) return;
		setWorking(true);
		setFeedback("");
		try {
			await preencherResponsavelConfirmacaoAgendamentos(
				manualResponsibleTrack.id,
				manualResponsibleForm,
			);
			setManualResponsibleTrack(null);
			setFeedback("Responsável salvo na regional e envio reenviado.");
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível salvar o responsável.");
		} finally {
			setWorking(false);
		}
	};

	const handleToggleAutomation = async () => {
		setWorking(true);
		setFeedback("");
		try {
			const nextEnabled = !config?.enabled;
			const saved = await salvarConfigConfirmacaoAgendamentos({
				...(config || {}),
				enabled: nextEnabled,
			});
			setConfig(saved);
			setFeedback(
				nextEnabled
					? "Rotina automática ativada."
					: "Rotina automática pausada.",
			);
			await loadData();
		} catch (error) {
			setFeedback(
				error?.message || "Não foi possível alterar a rotina automática.",
			);
		} finally {
			setWorking(false);
		}
	};

	const openLogs = () => {
		setLogsPage(1);
		setLogsOpen(true);
	};

	const openTomorrowPreview = async () => {
		setPreviewOpen(true);
		setPreviewLoading(true);
		setPreview(null);
		setFeedback("");
		try {
			const result = await buscarPreviaConfirmacaoAgendamentos({
				daysAhead: 1,
			});
			setPreview(result);
		} catch (error) {
			setFeedback(
				error?.message || "Não foi possível carregar a prévia de amanhã.",
			);
		} finally {
			setPreviewLoading(false);
		}
	};

	if (loading && !config) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
				Carregando confirmação de agendamentos...
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
						<ShieldCheck size={22} />
					</div>
					<div>
						<h2 className="text-xl font-black text-slate-950">
							Confirmação de Agendamentos
						</h2>
						<p className="text-sm text-slate-500">
							Rotina automática das 08h e monitoramento de novos agendamentos do
							dia.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<span
						className={`inline-flex items-center rounded-xl border px-3 py-2 text-sm font-black ${
							config?.enabled
								? "border-emerald-200 bg-emerald-50 text-emerald-700"
								: "border-amber-200 bg-amber-50 text-amber-700"
						}`}
					>
						{config?.enabled ? "Rotina ativa" : "Rotina pausada"}
					</span>
					<button
						type="button"
						onClick={loadData}
						className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={16} /> Atualizar
					</button>
					<button
						type="button"
						onClick={openTomorrowPreview}
						className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
					>
						<Clock size={16} /> Prévia de amanhã
					</button>
					<button
						type="button"
						onClick={openLogs}
						className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						<MessageSquareText size={16} /> Logs
					</button>
					<button
						type="button"
						disabled={working}
						onClick={handleToggleAutomation}
						className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold shadow-sm disabled:opacity-50 ${
							config?.enabled
								? "bg-amber-500 text-white hover:bg-amber-600"
								: "bg-emerald-600 text-white hover:bg-emerald-700"
						}`}
					>
						{config?.enabled ? "Pausar rotina" : "Ativar rotina"}
					</button>
				</div>
			</div>

			{feedback ? (
				<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
					{feedback}
				</div>
			) : null}

			<div className="grid gap-3 md:grid-cols-4">
				{stats.map((item) => (
					<div
						key={item.label}
						className={`rounded-2xl border p-4 shadow-sm ${
							item.tone === "green"
								? "border-emerald-200 bg-emerald-50"
								: item.tone === "amber"
									? "border-amber-200 bg-amber-50"
									: item.tone === "red"
										? "border-red-200 bg-red-50"
										: "border-blue-200 bg-blue-50"
						}`}
					>
						<p className="text-xs font-black uppercase tracking-wide text-slate-600">
							{item.label}
						</p>
						<p className="mt-2 text-3xl font-black text-slate-950">
							{item.value}
						</p>
					</div>
				))}
			</div>

			<div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between gap-3">
						<div>
							<h3 className="text-lg font-black text-slate-950">
								Configuração
							</h3>
							<p className="text-sm text-slate-500">
								As respostas aceitas param a escalação: SIM ou AGENDADO por
								padrão.
							</p>
						</div>
						<button
							type="button"
							disabled={working}
							onClick={handleSave}
							className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
						>
							<Save size={16} /> Salvar
						</button>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<Field label="Horário da rotina">
							<input
								type="time"
								className={inputClass}
								value={config?.dailySendTime || "08:00"}
								onChange={(event) =>
									updateConfig("dailySendTime", event.target.value)
								}
							/>
						</Field>
						<Field label="ESCALAR EM MINUTOS">
							<input
								type="number"
								min="5"
								className={inputClass}
								value={config?.escalationMinutes || 60}
								onChange={(event) =>
									updateConfig("escalationMinutes", event.target.value)
								}
							/>
						</Field>
					</div>

					<div className="mt-4 grid gap-4 md:grid-cols-2">
						<div>
							<span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
								Respostas aceitas
							</span>
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
								<div className="mb-3 flex flex-wrap gap-2">
									{safeArray(config?.acceptedReplies).map((reply) => (
										<span
											key={reply}
											className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700"
										>
											{reply}
										</span>
									))}
									{!safeArray(config?.acceptedReplies).length ? (
										<span className="text-sm font-semibold text-slate-500">
											Nenhuma resposta cadastrada.
										</span>
									) : null}
								</div>
								<button
									type="button"
									onClick={() => setAcceptedRepliesOpen(true)}
									className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"
								>
									Editar respostas
								</button>
							</div>
						</div>
						<Field label="Novos agendamentos do dia">
							<select
								className={inputClass}
								value={config?.sendSameDayNewAppointments ? "sim" : "nao"}
								onChange={(event) =>
									updateConfig(
										"sendSameDayNewAppointments",
										event.target.value === "sim",
									)
								}
							>
								<option value="sim">Enviar unitário automaticamente</option>
								<option value="nao">Não enviar durante o dia</option>
							</select>
						</Field>
					</div>

					<div className="mt-5 space-y-4">
						<Field label="Mensagem da rotina das 08h">
							<textarea
								className={textareaClass}
								value={config?.morningTemplate || ""}
								onChange={(event) =>
									updateConfig("morningTemplate", event.target.value)
								}
							/>
						</Field>
						<Field label="Mensagem de agendamento novo durante o dia">
							<textarea
								className={textareaClass}
								value={config?.sameDayTemplate || ""}
								onChange={(event) =>
									updateConfig("sameDayTemplate", event.target.value)
								}
							/>
						</Field>
						<Field label="Mensagem de escalonamento">
							<textarea
								className={textareaClass}
								value={config?.escalationTemplate || ""}
								onChange={(event) =>
									updateConfig("escalationTemplate", event.target.value)
								}
							/>
						</Field>
						<p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
							Variáveis: {"{responsavel_nome}"}, {"{total}"}, {"{data}"},{" "}
							{"{lista_clientes}"}, {"{cliente_nome}"}, {"{codigo_cliente}"},{" "}
							{"{hora}"}, {"{cidade}"}, {"{agendado_por}"},{" "}
							{"{responsavel_anterior}"} e {"{minutos}"}.
						</p>
					</div>
				</section>

				<section className="space-y-5">
					<div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
						<div className="mb-3 flex items-center gap-2">
							<QrCode size={18} className="text-blue-600" />
							<h3 className="text-lg font-black text-slate-950">
								API Evolution
							</h3>
						</div>
						<div className="space-y-2 text-sm font-semibold text-slate-600">
							<p>
								WhatsApp:{" "}
								<span className="font-black text-slate-950">
									{evolutionStatus?.connection?.connected
										? "conectado"
										: evolutionStatus?.connection?.state || "não conectado"}
								</span>
							</p>
							<p>
								Número:{" "}
								<span className="font-black text-slate-950">
									{evolutionStatus?.connection?.number || "-"}
								</span>
							</p>
							<p>
								Instância:{" "}
								<span className="font-black text-slate-950">
									{config?.evolutionInstance || "-"}
								</span>
							</p>
						</div>
						<div className="mt-4 space-y-3">
							<Field label="URL da Evolution">
								<input
									className={inputClass}
									value={config?.evolutionBaseUrl || ""}
									onChange={(event) =>
										updateConfig("evolutionBaseUrl", event.target.value)
									}
									placeholder="http://127.0.0.1:8080"
								/>
							</Field>
							<Field label="Instância da confirmação">
								<input
									className={inputClass}
									value={config?.evolutionInstance || ""}
									onChange={(event) =>
										updateConfig("evolutionInstance", event.target.value)
									}
									placeholder="retiradas-confirmacao"
								/>
							</Field>
							<Field label="Apikey da confirmação">
								<input
									className={inputClass}
									type="password"
									value={config?.evolutionApiKey || ""}
									onChange={(event) =>
										updateConfig("evolutionApiKey", event.target.value)
									}
									placeholder="apikey da Evolution"
								/>
							</Field>
							<Field label="Webhook da confirmação">
								<input
									className={inputClass}
									value={config?.evolutionWebhookUrl || ""}
									onChange={(event) =>
										updateConfig("evolutionWebhookUrl", event.target.value)
									}
									placeholder="https://retiradas.tech/api/webhooks/evolution"
								/>
							</Field>
						</div>
						<div className="mt-4 grid gap-2 sm:grid-cols-2">
							<button
								type="button"
								disabled={working}
								onClick={handleConnectEvolution}
								className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
							>
								<QrCode size={16} /> Gerar QR Code
							</button>
							<button
								type="button"
								disabled={working || !evolutionStatus?.connection?.connected}
								onClick={handleDisconnectEvolution}
								className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
							>
								<LogOut size={16} /> Desconectar
							</button>
							<button
								type="button"
								disabled={working}
								onClick={handleConfigureEvolutionWebhook}
								className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 sm:col-span-2"
							>
								Configurar webhook
							</button>
						</div>
						{qr ? (
							<div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
								{qr.imageSrc ? (
									<img
										src={qr.imageSrc}
										alt="QR Code Evolution"
										className="mx-auto h-56 w-56 rounded-xl border border-blue-200 bg-white object-contain p-2"
									/>
								) : (
									<code className="block break-all rounded-lg bg-white p-3 text-xs font-bold text-slate-700">
										{qr.raw || "QR Code não retornado."}
									</code>
								)}
								<p className="mt-2 text-center text-xs font-bold text-blue-800">
									Abra o WhatsApp e escaneie em Aparelhos conectados.
								</p>
							</div>
						) : null}
					</div>

					<div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
						<div className="mb-3 flex items-center gap-2">
							<Send size={18} className="text-emerald-600" />
							<h3 className="text-lg font-black text-slate-950">TESTE</h3>
						</div>
						<div className="space-y-3">
							<Field label="Telefone">
								<input
									className={inputClass}
									placeholder="31999999999"
									value={testForm.telefone}
									onChange={(event) =>
										setTestForm((current) => ({
											...current,
											telefone: event.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Nome do responsável">
								<input
									className={inputClass}
									value={testForm.nome}
									onChange={(event) =>
										setTestForm((current) => ({
											...current,
											nome: event.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Tipo de teste">
								<select
									className={inputClass}
									value={testForm.type}
									onChange={(event) =>
										setTestForm((current) => ({
											...current,
											type: event.target.value,
										}))
									}
								>
									<option value="morning">Lista consolidada das 08h</option>
									<option value="same_day">Agendamento unitário do dia</option>
									<option value="escalation">Simular escalonamento</option>
								</select>
							</Field>
							<button
								type="button"
								disabled={working}
								onClick={handleSendTest}
								className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
							>
								<Send size={16} /> TESTE
							</button>
						</div>
					</div>

					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="mb-3 flex items-center gap-2">
							<Clock size={18} className="text-blue-600" />
							<h3 className="text-lg font-black text-slate-950">Worker</h3>
						</div>
						<div className="grid gap-3 text-sm font-semibold text-slate-600">
							<p>
								Estado:{" "}
								<span
									className={`font-black ${worker?.enabled ? "text-emerald-700" : "text-amber-700"}`}
								>
									{worker?.enabled
										? worker?.workerRunning
											? "rodando agora"
											: "ativo"
										: "rotina desativada ou pausada"}
								</span>
							</p>
							<p>
								Última mensagem enviada:{" "}
								<span className="font-black text-slate-950">
									{formatDateTime(worker?.lastMessageSentAt)}
								</span>
							</p>
							<p>
								Próxima rotina:{" "}
								<span className="font-black text-slate-950">
									{worker?.enabled
										? formatDateTime(worker?.nextDailyRunAt)
										: "rotina desativada ou pausada"}
								</span>
							</p>
							<p>
								Erro:{" "}
								<span className="font-black text-red-700">
									{worker?.lastError || "-"}
								</span>
							</p>
						</div>
					</div>

					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="mb-3 flex items-center gap-2">
							<BarChart3 size={18} className="text-emerald-600" />
							<h3 className="text-lg font-black text-slate-950">
								Responsáveis
							</h3>
						</div>
						<div className="space-y-2">
							{safeArray(report?.responsaveis)
								.slice(0, 8)
								.map((item) => (
									<div
										key={item.nome}
										className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
									>
										<span className="font-bold text-slate-800">
											{item.nome}
										</span>
										<span className="font-black text-slate-950">
											{item.confirmados}/{item.enviados}
										</span>
									</div>
								))}
							{!safeArray(report?.responsaveis).length ? (
								<p className="text-sm font-semibold text-slate-500">
									Sem dados ainda.
								</p>
							) : null}
						</div>
					</div>
				</section>
			</div>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 className="text-lg font-black text-slate-950">Envios</h3>
						<p className="text-sm text-slate-500">
							Cada linha é uma trilha auditável de confirmação.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<select
							className={inputClass}
							value={pageSize}
							onChange={(event) => {
								setPageSize(Number(event.target.value));
								setPage(1);
							}}
						>
							{PAGE_SIZES.map((size) => (
								<option key={size} value={size}>
									{size} por página
								</option>
							))}
						</select>
						<button
							type="button"
							disabled={page <= 1}
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
						>
							Anterior
						</button>
						<button
							type="button"
							disabled={tracks.length < pageSize}
							onClick={() => setPage((current) => current + 1)}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
						>
							Próxima
						</button>
					</div>
				</div>

				<div className="overflow-hidden rounded-xl border border-slate-200">
					<table className="min-w-[960px] w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Regional</th>
								<th className="px-4 py-3">Data</th>
								<th className="px-4 py-3">Origem</th>
								<th className="px-4 py-3">Clientes</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Responsável atual</th>
								<th className="px-4 py-3">Próxima ação</th>
								<th className="px-4 py-3">Ação</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{tracks.map((track) => {
								const step =
									safeArray(track.steps)[Number(track.currentStepIndex || 0)] ||
									{};
								return (
									<tr key={track.id} className="align-top">
										<td className="px-4 py-3 font-bold text-slate-900">
											{track.regional || "-"}
										</td>
										<td className="px-4 py-3 font-bold text-slate-700">
											{track.dateKey
												? track.dateKey.split("-").reverse().join("/")
												: "-"}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{track.origin === "rotina_08h"
												? "Rotina 08h"
												: "Agendamento do dia"}
										</td>
										<td className="px-4 py-3 text-slate-700">
											<p className="font-black">
												{safeArray(track.appointments).length} cliente(s)
											</p>
											<p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">
												{safeArray(track.appointments)
													.map(
														(item) =>
															`${item.cliente_nome || "Cliente"} (${item.codigo_cliente || "-"})`,
													)
													.join(", ")}
											</p>
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex rounded-full border px-2 py-1 text-xs font-black ${statusClass[track.status] || statusClass.novo}`}
											>
												{statusLabels[track.status] || track.status || "Novo"}
											</span>
										</td>
										<td className="px-4 py-3 text-slate-700">
											<p className="font-bold">
												{step.nome || track.confirmedBy?.nome || "-"}
											</p>
											<p className="text-xs text-slate-500">
												{step.label || track.confirmedBy?.label || ""}
											</p>
										</td>
										<td className="px-4 py-3 text-slate-600">
											{formatDateTime(track.nextCheckAt)}
										</td>
										<td className="px-4 py-3">
											{track.status === "sem_responsavel" ? (
												<button
													type="button"
													onClick={() => openManualResponsible(track)}
													className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
												>
													Preencher e reenviar
												</button>
											) : (
												<span className="text-xs font-semibold text-slate-400">
													-
												</span>
											)}
										</td>
									</tr>
								);
							})}
							{!tracks.length ? (
								<tr>
									<td
										colSpan={8}
										className="px-4 py-8 text-center text-sm font-semibold text-slate-500"
									>
										Nenhum envio registrado.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>

			{logsOpen ? (
				<ModalShell
					onClose={() => setLogsOpen(false)}
					showClose={false}
					size="4xl"
					bodyClassName="p-0"
				>
					<div className="flex min-h-0 flex-col p-5">
						<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 className="text-xl font-black text-slate-950">
									Logs da confirmação
								</h3>
								<p className="text-sm font-semibold text-slate-500">
									Eventos de envio, confirmação, escalonamento e falhas da
									rotina.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<select
									className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
									value={logsPageSize}
									onChange={(event) => {
										setLogsPageSize(Number(event.target.value));
										setLogsPage(1);
									}}
								>
									{PAGE_SIZES.map((size) => (
										<option key={size} value={size}>
											{size} por página
										</option>
									))}
								</select>
								<button
									type="button"
									onClick={() => loadLogs()}
									className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
								>
									Atualizar
								</button>
								<button
									type="button"
									onClick={() => setLogsOpen(false)}
									className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
								>
									Fechar
								</button>
							</div>
						</div>

						<div className="min-h-0 flex-1 overflow-y-auto pr-1">
							<div className="space-y-2">
								{logsLoading ? (
									<div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">
										Carregando logs...
									</div>
								) : (
									logs.map((log) => (
										<div
											key={log.id}
											className="rounded-xl border border-slate-100 bg-slate-50 p-3"
										>
											<div className="flex flex-wrap items-center justify-between gap-2">
												<p className="font-black text-slate-900">
													{log.type || "evento"}
												</p>
												<p className="text-xs font-bold text-slate-500">
													{formatDateTime(log.criadoEm)}
												</p>
											</div>
											<p className="mt-1 text-sm font-semibold text-slate-600">
												{log.regional || "-"}{" "}
												{log.step?.nome ? `• ${log.step.nome}` : ""}{" "}
												{log.responder?.nome ? `• ${log.responder.nome}` : ""}
											</p>
											{log.reason || log.message ? (
												<p className="mt-2 line-clamp-3 text-xs font-semibold text-slate-500">
													{log.reason || log.message}
												</p>
											) : null}
										</div>
									))
								)}
								{!logsLoading && !logs.length ? (
									<div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">
										Sem logs nesta página.
									</div>
								) : null}
							</div>
						</div>

						<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
							<p className="text-sm font-bold text-slate-500">
								Página {logsPage}
							</p>
							<div className="flex gap-2">
								<button
									type="button"
									disabled={logsPage <= 1 || logsLoading}
									onClick={() =>
										setLogsPage((current) => Math.max(1, current - 1))
									}
									className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
								>
									Anterior
								</button>
								<button
									type="button"
									disabled={logs.length < logsPageSize || logsLoading}
									onClick={() => setLogsPage((current) => current + 1)}
									className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
								>
									Próxima
								</button>
							</div>
						</div>
					</div>
				</ModalShell>
			) : null}

			{previewOpen ? (
				<ModalShell
					onClose={() => setPreviewOpen(false)}
					showClose={false}
					size="5xl"
					bodyClassName="p-0"
				>
					<div className="flex min-h-0 flex-col p-5">
						<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 className="text-xl font-black text-slate-950">
									Prévia de amanhã
								</h3>
								<p className="text-sm font-semibold text-slate-500">
									Simulação da rotina das 08h para{" "}
									{formatDateKey(preview?.dateKey)}. Nenhuma mensagem é enviada
									aqui.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={openTomorrowPreview}
									className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700 hover:bg-blue-100"
								>
									Recalcular
								</button>
								<button
									type="button"
									onClick={() => setPreviewOpen(false)}
									className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
								>
									Fechar
								</button>
							</div>
						</div>

						<div className="mb-4 grid gap-3 md:grid-cols-3">
							<div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
								<p className="text-xs font-black uppercase tracking-wide text-blue-700">
									Data
								</p>
								<p className="mt-1 text-2xl font-black text-slate-950">
									{formatDateKey(preview?.dateKey)}
								</p>
							</div>
							<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
								<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
									Clientes
								</p>
								<p className="mt-1 text-2xl font-black text-slate-950">
									{preview?.total || 0}
								</p>
							</div>
							<div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
								<p className="text-xs font-black uppercase tracking-wide text-amber-700">
									Regionais
								</p>
								<p className="mt-1 text-2xl font-black text-slate-950">
									{safeArray(preview?.groups).length}
								</p>
							</div>
						</div>

						<div className="min-h-0 flex-1 overflow-y-auto pr-1">
							{previewLoading ? (
								<div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
									Calculando prévia...
								</div>
							) : (
								<div className="space-y-3">
									{safeArray(preview?.groups).map((group) => (
										<div
											key={group.regional}
											className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
										>
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div>
													<h4 className="text-base font-black text-slate-950">
														{group.regional || "Sem regional"}
													</h4>
													<p className="text-sm font-semibold text-slate-500">
														{group.total} cliente(s) • Responsável inicial:{" "}
														<strong>
															{group.responsavelInicial?.nome ||
																"não configurado"}
														</strong>
														{group.responsavelInicial?.label
															? ` (${group.responsavelInicial.label})`
															: ""}
													</p>
												</div>
												{group.semResponsavel ? (
													<span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-700">
														Sem responsável
													</span>
												) : null}
											</div>
											<div className="mt-3 grid gap-2 md:grid-cols-2">
												{safeArray(group.appointments).map((item) => (
													<div
														key={
															item.id || `${item.codigo_cliente}-${item.hora}`
														}
														className="rounded-xl border border-white bg-white p-3"
													>
														<p className="font-black text-slate-900">
															{item.cliente_nome || "Cliente sem nome"}
														</p>
														<p className="text-sm font-semibold text-slate-600">
															Código {item.codigo_cliente || "-"} •{" "}
															{item.hora || "-"} • {item.cidade || "-"}
														</p>
														<p className="text-xs font-bold text-slate-400">
															Agendado por: {item.agendado_por || "-"}
														</p>
													</div>
												))}
											</div>
										</div>
									))}
									{!safeArray(preview?.groups).length ? (
										<div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
											Nenhum agendamento encontrado para amanhã.
										</div>
									) : null}
								</div>
							)}
						</div>
					</div>
				</ModalShell>
			) : null}

			{acceptedRepliesOpen ? (
				<ModalShell
					onClose={() => setAcceptedRepliesOpen(false)}
					showClose={false}
					size="lg"
					bodyClassName="p-0"
				>
					<div className="p-5">
						<div className="mb-4 flex items-start justify-between gap-3">
							<div>
								<h3 className="text-xl font-black text-slate-950">
									Respostas aceitas
								</h3>
								<p className="text-sm font-semibold text-slate-500">
									Cadastre as palavras que confirmam ciência e param o
									escalonamento.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setAcceptedRepliesOpen(false)}
								className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
							>
								Fechar
							</button>
						</div>

						<div className="flex gap-2">
							<input
								className={inputClass}
								value={acceptedReplyDraft}
								onChange={(event) => setAcceptedReplyDraft(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addAcceptedReply();
									}
								}}
								placeholder="Ex: SIM"
							/>
							<button
								type="button"
								onClick={addAcceptedReply}
								className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"
							>
								Adicionar
							</button>
						</div>

						<div className="mt-4 flex flex-wrap gap-2">
							{safeArray(config?.acceptedReplies).map((reply) => (
								<button
									key={reply}
									type="button"
									onClick={() => removeAcceptedReply(reply)}
									className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
									title="Clique para remover"
								>
									{reply} ×
								</button>
							))}
							{!safeArray(config?.acceptedReplies).length ? (
								<p className="text-sm font-semibold text-slate-500">
									Nenhuma resposta cadastrada.
								</p>
							) : null}
						</div>

						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setAcceptedRepliesOpen(false)}
								className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								disabled={working}
								onClick={handleSaveAcceptedReplies}
								className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
							>
								Salvar respostas
							</button>
						</div>
					</div>
				</ModalShell>
			) : null}

			{manualResponsibleTrack ? (
				<ModalShell
					onClose={() => setManualResponsibleTrack(null)}
					showClose={false}
					size="lg"
					bodyClassName="p-0"
				>
					<div className="p-5">
						<div className="mb-4">
							<h3 className="text-xl font-black text-slate-950">
								Preencher responsável
							</h3>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Este envio não encontrou BackOffice. Ao salvar, o contato será
								gravado na regional{" "}
								<strong>{manualResponsibleTrack.regional || "-"}</strong> e a
								mensagem será reenviada.
							</p>
						</div>

						<div className="space-y-3">
							<Field label="Nome do responsável">
								<input
									className={inputClass}
									value={manualResponsibleForm.nome}
									onChange={(event) =>
										setManualResponsibleForm((current) => ({
											...current,
											nome: event.target.value,
										}))
									}
									placeholder="Nome completo"
								/>
							</Field>
							<Field label="Telefone">
								<input
									className={inputClass}
									value={manualResponsibleForm.telefone}
									onChange={(event) =>
										setManualResponsibleForm((current) => ({
											...current,
											telefone: event.target.value,
										}))
									}
									placeholder="31999999999"
								/>
							</Field>
							<Field label="E-mail">
								<input
									className={inputClass}
									type="email"
									value={manualResponsibleForm.email}
									onChange={(event) =>
										setManualResponsibleForm((current) => ({
											...current,
											email: event.target.value,
										}))
									}
									placeholder="opcional"
								/>
							</Field>
						</div>

						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setManualResponsibleTrack(null)}
								className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								disabled={
									working ||
									!manualResponsibleForm.nome.trim() ||
									!manualResponsibleForm.telefone.trim()
								}
								onClick={handleSaveManualResponsible}
								className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
							>
								Salvar e reenviar
							</button>
						</div>
					</div>
				</ModalShell>
			) : null}
		</div>
	);
}
