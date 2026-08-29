import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Copy,
	Eye,
	History,
	MessageCircle,
	Phone,
	RefreshCw,
	RotateCcw,
	Save,
	Send,
	Settings,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	atualizarItemFilaMensageria,
	buscarConfigMensageria,
	buscarFilaMensageria,
	buscarHistoricoMensageria,
	buscarStatusEvolutionMensageria,
	buscarTemplatesMensageria,
	CENTRAL_WHATSAPP_BUTTON_TEXT,
	CENTRAL_WHATSAPP_PHONE,
	criarItemFilaMensageria,
	DEFAULT_MENSAGERIA_CONFIG,
	DEFAULT_TEMPLATES,
	enviarTesteEvolution,
	executarEnvioEvolutionAgora,
	pausarEvolutionMensageria,
	retomarEvolutionMensageria,
	SAMPLE_QUEUE_ITEMS,
	salvarConfigMensageria,
	salvarTemplateMensageria,
} from "../services/mensageriaService";

const VARIABLES = [
	{
		token: "{cliente}",
		label: "Cliente",
		field: "cliente",
		sample: "Maria Oliveira",
	},
	{
		token: "{primeiro_nome}",
		label: "Primeiro nome",
		field: "primeiro_nome",
		sample: "Maria",
	},
	{
		token: "{codigo_cliente}",
		label: "Código do cliente",
		field: "codigo_cliente",
		sample: "48291",
	},
	{
		token: "{contrato}",
		label: "Contrato",
		field: "contrato",
		sample: "CTR-10482",
	},
	{ token: "{os}", label: "O.S.", field: "os", sample: "OS-72913" },
	{ token: "{cidade}", label: "Cidade", field: "cidade", sample: "São Paulo" },
	{
		token: "{regional}",
		label: "Regional",
		field: "regional",
		sample: "Leste",
	},
	{
		token: "{endereco}",
		label: "Endereço",
		field: "endereco",
		sample: "Rua das Flores, 120 - Centro",
	},
	{
		token: "{telefone}",
		label: "Telefone",
		field: "telefone",
		sample: "(11) 98888-2211",
	},
	{
		token: "{data_cancelamento}",
		label: "Data do cancelamento",
		field: "data_cancelamento",
		sample: "01/08/2026",
	},
	{
		token: "{data_abertura_os}",
		label: "Data de abertura da O.S.",
		field: "data_abertura_os",
		sample: "01/08/2026",
	},
	{
		token: "{dias_aberta}",
		label: "Dias em aberto",
		field: "dias_aberta",
		sample: "3",
	},
	{
		token: "{status_os}",
		label: "Status da O.S.",
		field: "status_os",
		sample: "Pendente",
	},
	{ token: "{tipo}", label: "Tipo da O.S.", field: "tipo", sample: "Retirada" },
	{
		token: "{protocolo}",
		label: "Protocolo",
		field: "protocolo",
		sample: "PRT-20260801",
	},
	{
		token: "{central_whatsapp}",
		label: "WhatsApp da central",
		field: "central_whatsapp",
		sample: "+55 31 3987-0880",
	},
	{
		token: "{link_agendamento}",
		label: "Link de agendamento",
		field: "link_agendamento",
		sample: "https://wa.me/553139870880",
	},
];

const SEND_DAYS = [
	{ value: "seg", label: "Seg" },
	{ value: "ter", label: "Ter" },
	{ value: "qua", label: "Qua" },
	{ value: "qui", label: "Qui" },
	{ value: "sex", label: "Sex" },
	{ value: "sab", label: "Sáb" },
	{ value: "dom", label: "Dom" },
];

const STATUS_LABELS = {
	novo: "Novo",
	aprovado: "Aprovado",
	enviado: "Enviado",
	falhou: "Falhou",
	ignorado: "Ignorado",
	aguardando_janela: "Aguardando janela",
};

const STATUS_CLASSES = {
	novo: "border-blue-200 bg-blue-50 text-blue-700",
	aprovado: "border-emerald-200 bg-emerald-50 text-emerald-700",
	enviado: "border-slate-200 bg-slate-50 text-slate-700",
	falhou: "border-red-200 bg-red-50 text-red-700",
	ignorado: "border-zinc-200 bg-zinc-50 text-zinc-700",
	aguardando_janela: "border-amber-200 bg-amber-50 text-amber-700",
};

const getProviderLabel = (provider) => {
	if (provider === "official_whatsapp") return "WhatsApp oficial";
	return "Evolution API";
};

const formatDateTime = (value) => {
	const date = value?.toDate?.() || (value ? new Date(value) : null);
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const cleanCustomerName = (name) =>
	String(name || "Cliente")
		.replace(/^\s*\(\d+\)\s*/, "")
		.replace(/\s*-\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
		.replace(/\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
		.replace(/\s+/g, " ")
		.trim();

const getFirstName = (name) =>
	cleanCustomerName(name).split(" ")[0] || "Cliente";

const buildPreviewData = (item) => {
	const source = item || SAMPLE_QUEUE_ITEMS[0];
	const firstName = getFirstName(source.cliente);
	const phone = String(CENTRAL_WHATSAPP_PHONE || "").replace(/\D/g, "");
	return {
		...source,
		primeiro_nome: firstName,
		central_whatsapp: CENTRAL_WHATSAPP_PHONE,
		link_agendamento: phone ? `https://wa.me/${phone}` : "",
	};
};

const replaceVariables = (text, item) => {
	const data = buildPreviewData(item);
	return VARIABLES.reduce(
		(current, variable) =>
			current.replaceAll(
				variable.token,
				data[variable.field] ?? variable.sample,
			),
		text || "",
	);
};

const formatInterval = (value, unit) => {
	const safeValue = Math.max(Number(value) || 1, 1);
	if (unit === "minutes")
		return `${safeValue} minuto${safeValue > 1 ? "s" : ""}`;
	return `${safeValue} hora${safeValue > 1 ? "s" : ""}`;
};

const MensageriaPage = () => {
	const { currentUser } = useAuthContext();
	const textareaRef = useRef(null);
	const [config, setConfig] = useState(DEFAULT_MENSAGERIA_CONFIG);
	const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
	const [fila, setFila] = useState([]);
	const [historico, setHistorico] = useState([]);
	const [activeTemplateId, setActiveTemplateId] = useState("cancelamento");
	const [selectedQueueId, setSelectedQueueId] = useState("");
	const [evolutionStatus, setEvolutionStatus] = useState(null);
	const [testPhone, setTestPhone] = useState("");
	const [testTemplateId, setTestTemplateId] = useState("cancelamento");
	const [testingEvolution, setTestingEvolution] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState("");
	const providerLabel = getProviderLabel(
		config.whatsappProvider || "evolution",
	);
	const canManage =
		hasPermission(currentUser, "mensageria.email_config.manage") ||
		hasPermission(currentUser, "manage_mensageria");

	const activeTemplate =
		templates.find((template) => template.id === activeTemplateId) ||
		templates[0] ||
		DEFAULT_TEMPLATES[0];

	const selectedQueueItem =
		fila.find((item) => item.id === selectedQueueId) ||
		fila[0] ||
		SAMPLE_QUEUE_ITEMS[0];

	const previewMessage = useMemo(
		() => replaceVariables(activeTemplate?.conteudo, selectedQueueItem),
		[activeTemplate?.conteudo, selectedQueueItem],
	);

	const previewButtonMessage = useMemo(
		() => replaceVariables(config.buttonMessage, selectedQueueItem),
		[config, selectedQueueItem],
	);

	const whatsappPhone = String(CENTRAL_WHATSAPP_PHONE || "").replace(/\D/g, "");
	const whatsappLink = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(
		previewButtonMessage,
	)}`;

	const stats = useMemo(() => {
		const sentToday = historico.filter((item) => {
			const date =
				item.criadoEm?.toDate?.() ||
				(item.criadoEm ? new Date(item.criadoEm) : null);
			if (!date) return false;
			const today = new Date();
			return date.toDateString() === today.toDateString();
		}).length;

		return {
			fila: fila.filter(
				(item) => !["enviado", "ignorado"].includes(item.status),
			).length,
			enviadas: sentToday,
			falhas: fila.filter((item) => item.status === "falhou").length,
			aprovadas: fila.filter((item) => item.status === "aprovado").length,
		};
	}, [fila, historico]);

	const loadData = async () => {
		setLoading(true);
		try {
			const [nextConfig, nextTemplates, nextFila, nextHistorico] =
				await Promise.all([
					buscarConfigMensageria(),
					buscarTemplatesMensageria(),
					buscarFilaMensageria(),
					buscarHistoricoMensageria(),
				]);
			setConfig(nextConfig);
			setTemplates(nextTemplates.length ? nextTemplates : DEFAULT_TEMPLATES);
			setFila(nextFila);
			setHistorico(nextHistorico);
			setActiveTemplateId(
				nextConfig.activeTemplateId || nextTemplates[0]?.id || "cancelamento",
			);
			setTestTemplateId(
				nextConfig.activeTemplateId || nextTemplates[0]?.id || "cancelamento",
			);
			setSelectedQueueId(nextFila[0]?.id || "");
			buscarStatusEvolutionMensageria()
				.then(setEvolutionStatus)
				.catch(() => setEvolutionStatus(null));
		} catch (error) {
			setFeedback(error?.message || "Não foi possível carregar a Mensageria.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const updateConfig = (field, value) => {
		if (!canManage) return;
		setConfig((current) => ({ ...current, [field]: value }));
	};

	const updateTemplate = (field, value) => {
		if (!canManage) return;
		setTemplates((current) =>
			current.map((template) =>
				template.id === activeTemplate.id
					? { ...template, [field]: value }
					: template,
			),
		);
	};

	const insertVariable = (token) => {
		if (!canManage) return;
		const textarea = textareaRef.current;
		const currentText = activeTemplate?.conteudo || "";
		if (!textarea) {
			updateTemplate("conteudo", `${currentText} ${token}`);
			return;
		}

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const nextText = `${currentText.slice(0, start)}${token}${currentText.slice(end)}`;
		updateTemplate("conteudo", nextText);

		window.requestAnimationFrame(() => {
			textarea.focus();
			textarea.setSelectionRange(start + token.length, start + token.length);
		});
	};

	const handleSave = async () => {
		if (!canManage) return;
		setSaving(true);
		setFeedback("");
		try {
			await Promise.all([
				salvarConfigMensageria({ ...config, activeTemplateId }),
				salvarTemplateMensageria({
					...activeTemplate,
					requiredCentralButton: false,
				}),
			]);
			setFeedback("Configuração e modelo salvos com sucesso.");
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível salvar a configuração.");
		} finally {
			setSaving(false);
		}
	};

	const handleNewTemplate = async () => {
		if (!canManage) return;
		const id = crypto.randomUUID();
		const template = {
			id,
			nome: "Novo modelo",
			situacao: "Personalizado",
			requiredCentralButton: false,
			conteudo:
				"Olá, {primeiro_nome}! Podemos ajudar com o agendamento da coleta?",
		};
		setTemplates((current) => [...current, template]);
		setActiveTemplateId(id);
	};

	const handleToggleDay = (day) => {
		if (!canManage) return;
		const currentDays = config.sendDays || [];
		const nextDays = currentDays.includes(day)
			? currentDays.filter((item) => item !== day)
			: [...currentDays, day];
		updateConfig("sendDays", nextDays);
	};

	const handleSimulateMapDiff = async () => {
		if (!canManage) return;
		setFeedback("");
		try {
			const existingKeys = new Set(
				fila.map(
					(item) =>
						`${item.os || ""}|${String(item.telefone || "").replace(/\D/g, "")}`,
				),
			);
			const created = [];

			for (const sample of SAMPLE_QUEUE_ITEMS) {
				const key = `${sample.os}|${String(sample.telefone || "").replace(/\D/g, "")}`;
				if (config.avoidDuplicates && existingKeys.has(key)) continue;
				const ref = await criarItemFilaMensageria({
					...sample,
					status:
						config.autoSend && config.approvedTemplate ? "aprovado" : "novo",
					templateId: activeTemplateId,
					requiredCentralButton: false,
					centralButtonText: CENTRAL_WHATSAPP_BUTTON_TEXT,
					centralButtonPhone: CENTRAL_WHATSAPP_PHONE,
					centralButtonMessage: config.buttonMessage,
				});
				created.push(ref.id);
			}

			setFeedback(
				created.length
					? `${created.length} cliente(s) adicionados à fila pela simulação do Mapa.`
					: "Nenhum cliente novo encontrado. A regra de duplicidade bloqueou repetições.",
			);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível simular a comparação.");
		}
	};

	const handleQueueStatus = async (item, status) => {
		if (!canManage) return;
		await atualizarItemFilaMensageria(item.id, { status });
		await loadData();
	};

	const handleRegisterSend = async (item) => {
		if (!canManage) return;
		await atualizarItemFilaMensageria(item.id, {
			status: "aprovado",
			templateId: item.templateId || activeTemplateId,
			proximaTentativaEm: "",
		});
		const result = await executarEnvioEvolutionAgora();
		setFeedback(
			result?.sent
				? `Envio acionado. ${result.sent} mensagem(ns) enviada(s).`
				: result?.skipped ||
						"Envio acionado, mas nenhum item apto foi encontrado na fila.",
		);
		await loadData();
	};

	const handleRetry = async (item) => {
		if (!canManage) return;
		await atualizarItemFilaMensageria(item.id, {
			status: "aprovado",
			tentativas: Number(item.tentativas || 0) + 1,
			proximaTentativaEm: new Date(
				Date.now() + Number(config.retryAfterMinutes || 15) * 60 * 1000,
			).toISOString(),
		});
		setFeedback("Retentativa reagendada para a fila.");
		await loadData();
	};

	const handleToggleEvolutionPause = async () => {
		if (!canManage) return;
		setSaving(true);
		setFeedback("");
		try {
			if (config.evolutionPaused) {
				await salvarConfigMensageria({
					...config,
					evolutionEnabled: true,
					evolutionPaused: false,
					autoSend: true,
				});
				await retomarEvolutionMensageria();
				setConfig((current) => ({
					...current,
					evolutionEnabled: true,
					evolutionPaused: false,
					autoSend: true,
				}));
				setFeedback(
					"Automação iniciada. Novos clientes do Mapa entram na fila conforme as regras configuradas.",
				);
			} else {
				await pausarEvolutionMensageria();
				setConfig((current) => ({ ...current, evolutionPaused: true }));
				setFeedback("Automação pausada.");
			}
			await loadData();
		} catch (error) {
			setFeedback(
				error?.message || "N?o foi poss?vel iniciar ou pausar a automação.",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleSendEvolutionTest = async () => {
		if (!canManage) return;
		if (!testPhone.trim()) {
			setFeedback("Informe um numero para testar.");
			return;
		}
		setTestingEvolution(true);
		setFeedback("");
		try {
			await enviarTesteEvolution({
				number: testPhone,
				templateId: testTemplateId,
			});
			setFeedback(`Mensagem de teste enviada pela ${providerLabel}.`);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "N?o foi poss?vel enviar o teste.");
		} finally {
			setTestingEvolution(false);
		}
	};

	if (loading) {
		return (
			<div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white">
				<div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
					<RefreshCw size={18} className="animate-spin" />
					Carregando Mensageria...
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
						<MessageCircle size={22} />
					</span>
					<div>
						<h1 className="text-2xl font-bold text-slate-900">Mensageria</h1>
						<p className="mt-1 text-sm text-slate-500">
							Central para mensagens automáticas de coleta geradas pela
							diferença do Mapa.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={loadData}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						<RefreshCw size={17} />
						Atualizar
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={saving || !canManage}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Save size={17} />
						{saving ? "Salvando..." : "Salvar configuração"}
					</button>
				</div>
			</section>

			{feedback ? (
				<div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
					{feedback}
				</div>
			) : null}

			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{[
					{
						label: "Na fila",
						value: stats.fila,
						icon: Clock,
						tone: "text-amber-600 bg-amber-50",
					},
					{
						label: "Enviadas hoje",
						value: stats.enviadas,
						icon: Send,
						tone: "text-blue-600 bg-blue-50",
					},
					{
						label: "Aprovadas",
						value: stats.aprovadas,
						icon: CheckCircle2,
						tone: "text-emerald-600 bg-emerald-50",
					},
					{
						label: "Falhas",
						value: stats.falhas,
						icon: AlertTriangle,
						tone: "text-red-600 bg-red-50",
					},
				].map(({ label, value, icon: Icon, tone }) => (
					<div
						key={label}
						className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
					>
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
									{label}
								</p>
								<p className="mt-2 text-2xl font-bold text-slate-900">
									{Number(value || 0).toLocaleString("pt-BR")}
								</p>
							</div>
							<span
								className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}
							>
								<Icon size={20} />
							</span>
						</div>
					</div>
				))}
			</section>

			<section className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex items-center gap-2 text-slate-900">
							<ShieldCheck size={18} className="text-emerald-600" />
							<h2 className="text-lg font-bold">
								Teste e automação {providerLabel}
							</h2>
						</div>
						<p className="mt-1 text-sm text-slate-500">
							Envie uma mensagem de teste com qualquer modelo cadastrado antes
							de liberar a fila automática.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={handleToggleEvolutionPause}
							disabled={saving || !canManage}
							className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
								config.evolutionPaused
									? "bg-emerald-600 text-white hover:bg-emerald-700"
									: "bg-amber-500 text-white hover:bg-amber-600"
							}`}
						>
							{config.evolutionPaused ? "Iniciar automação" : "Parar automação"}
						</button>
					</div>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Número de teste
						</span>
						<input
							value={testPhone}
							onChange={(event) => setTestPhone(event.target.value)}
							disabled={!canManage}
							placeholder="Ex: 31999999999"
							className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
						/>
					</label>
					<label className="block">
						<span className="text-sm font-semibold text-slate-700">
							Tipo de mensagem
						</span>
						<select
							value={testTemplateId}
							onChange={(event) => setTestTemplateId(event.target.value)}
							disabled={!canManage}
							className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
						>
							{templates.map((template) => (
								<option key={template.id} value={template.id}>
									{template.nome || template.id}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						onClick={handleSendEvolutionTest}
						disabled={testingEvolution || !testPhone.trim() || !canManage}
						className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Send size={16} />
						{testingEvolution ? "Enviando..." : "Enviar teste"}
					</button>
				</div>

				<div className="mt-4 grid gap-3 text-xs text-slate-500 md:grid-cols-4">
					<span>
						Worker:{" "}
						{evolutionStatus?.worker?.workerActive ? "ativo" : "inativo"}
					</span>
					<span>Fila: {config.evolutionPaused ? "pausada" : "automática"}</span>
					<span>Último envio: {evolutionStatus?.worker?.lastRun || "-"}</span>
					<span>Erro: {evolutionStatus?.worker?.lastError || "-"}</span>
				</div>
			</section>

			<section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
				<div className="space-y-6">
					<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex items-center gap-2 text-slate-900">
							<Settings size={18} />
							<h2 className="text-lg font-bold">
								Atualização do Mapa e regras de envio
							</h2>
						</div>
						<p className="mt-1 text-sm text-slate-500">
							Defina a frequência, janela permitida, duplicidade e retentativas
							antes de conectar a API.
						</p>

						<div className="mt-5 grid gap-4 md:grid-cols-5">
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Intervalo
								</span>
								<input
									type="number"
									min="1"
									value={config.intervalValue}
									onChange={(event) =>
										updateConfig("intervalValue", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Unidade
								</span>
								<select
									value={config.intervalUnit}
									onChange={(event) =>
										updateConfig("intervalUnit", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								>
									<option value="minutes">Minutos</option>
									<option value="hours">Horas</option>
								</select>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Início
								</span>
								<input
									type="time"
									value={config.sendWindowStart}
									onChange={(event) =>
										updateConfig("sendWindowStart", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Fim
								</span>
								<input
									type="time"
									value={config.sendWindowEnd}
									onChange={(event) =>
										updateConfig("sendWindowEnd", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Limite diário
								</span>
								<input
									type="number"
									min="1"
									value={config.dailySendLimit || 100}
									onChange={(event) =>
										updateConfig("dailySendLimit", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
						</div>

						<div className="mt-4 grid gap-4 md:grid-cols-5">
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Bloquear duplicidade por
								</span>
								<div className="mt-1 flex items-center gap-2">
									<input
										type="number"
										min="1"
										value={config.duplicateBlockDays}
										onChange={(event) =>
											updateConfig("duplicateBlockDays", event.target.value)
										}
										disabled={!canManage}
										className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
									/>
									<span className="text-sm font-semibold text-slate-500">
										dias
									</span>
								</div>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Limite de tentativas
								</span>
								<input
									type="number"
									min="1"
									value={config.retryLimit}
									onChange={(event) =>
										updateConfig("retryLimit", event.target.value)
									}
									disabled={!canManage}
									className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Retentar após
								</span>
								<div className="mt-1 flex items-center gap-2">
									<input
										type="number"
										min="1"
										value={config.retryAfterMinutes}
										onChange={(event) =>
											updateConfig("retryAfterMinutes", event.target.value)
										}
										disabled={!canManage}
										className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
									/>
									<span className="text-sm font-semibold text-slate-500">
										min
									</span>
								</div>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Delay mínimo
								</span>
								<div className="mt-1 flex items-center gap-2">
									<input
										type="number"
										min="5"
										value={config.evolutionMinDelaySeconds || 45}
										onChange={(event) =>
											updateConfig(
												"evolutionMinDelaySeconds",
												event.target.value,
											)
										}
										disabled={!canManage}
										className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
									/>
									<span className="text-sm font-semibold text-slate-500">
										s
									</span>
								</div>
							</label>
							<label className="block">
								<span className="text-sm font-semibold text-slate-700">
									Delay máximo
								</span>
								<div className="mt-1 flex items-center gap-2">
									<input
										type="number"
										min="10"
										value={config.evolutionMaxDelaySeconds || 120}
										onChange={(event) =>
											updateConfig(
												"evolutionMaxDelaySeconds",
												event.target.value,
											)
										}
										disabled={!canManage}
										className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
									/>
									<span className="text-sm font-semibold text-slate-500">
										s
									</span>
								</div>
							</label>
						</div>

						<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
							A automação respeita o limite diário e envia apenas dentro da
							janela configurada. Com delay inteligente ativo, o sistema calcula
							o intervalo ideal para distribuir a fila do mapa até o fim do
							período.
						</div>

						<div className="mt-4 flex flex-wrap gap-2">
							{SEND_DAYS.map((day) => (
								<button
									key={day.value}
									type="button"
									onClick={() => handleToggleDay(day.value)}
									disabled={!canManage}
									className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
										config.sendDays?.includes(day.value)
											? "border-emerald-500 bg-emerald-50 text-emerald-700"
											: "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
									}`}
								>
									{day.label}
								</button>
							))}
						</div>

						<div className="mt-5 grid gap-3 md:grid-cols-4">
							{[
								[
									"autoSync",
									"Atualização automática",
									"Buscar diferenças a cada " +
										formatInterval(config.intervalValue, config.intervalUnit),
								],
								[
									"approvedTemplate",
									"Modelo aprovado",
									"Libera o envio quando a API estiver conectada.",
								],
								[
									"autoSend",
									"Envio automático",
									"Envia assim que uma diferença nova entrar.",
								],
								[
									"autoEnqueueMapDiff",
									"Fila pelo mapa",
									"Novos clientes do mapa entram automaticamente na fila.",
								],
								[
									"smartDelayEnabled",
									"Delay inteligente",
									"Distribui o limite diário do começo ao fim da janela.",
								],
								[
									"avoidDuplicates",
									"Bloquear duplicidade",
									"Evita repetir mensagem para a mesma O.S. ou telefone.",
								],
							].map(([field, title, description]) => (
								<label
									key={field}
									className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
								>
									<input
										type="checkbox"
										checked={Boolean(config[field])}
										onChange={(event) =>
											updateConfig(field, event.target.checked)
										}
										disabled={!canManage}
										className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
									/>
									<span>
										<strong className="block text-slate-900">{title}</strong>
										{description}
									</span>
								</label>
							))}
						</div>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h2 className="text-lg font-bold text-slate-900">
									Modelos de mensagem
								</h2>
								<p className="mt-1 text-sm text-slate-500">
									Cadastre templates por situação e use variáveis para
									personalizar cada cliente.
								</p>
							</div>
							<button
								type="button"
								onClick={handleNewTemplate}
								disabled={!canManage}
								className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
							>
								Novo modelo
							</button>
						</div>

						<div className="mt-4 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
							<div className="space-y-2">
								{templates.map((template) => (
									<button
										key={template.id}
										type="button"
										onClick={() => setActiveTemplateId(template.id)}
										className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
											template.id === activeTemplateId
												? "border-emerald-500 bg-emerald-50 text-emerald-800"
												: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
										}`}
									>
										<span className="block font-bold">{template.nome}</span>
										<span className="text-xs opacity-75">
											{template.situacao}
										</span>
									</button>
								))}
							</div>

							<div>
								<div className="grid gap-3 md:grid-cols-2">
									<label className="block">
										<span className="text-sm font-semibold text-slate-700">
											Nome do modelo
										</span>
										<input
											value={activeTemplate?.nome || ""}
											onChange={(event) =>
												updateTemplate("nome", event.target.value)
											}
											disabled={!canManage}
											className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
										/>
									</label>
									<label className="block">
										<span className="text-sm font-semibold text-slate-700">
											Situação
										</span>
										<input
											value={activeTemplate?.situacao || ""}
											onChange={(event) =>
												updateTemplate("situacao", event.target.value)
											}
											disabled={!canManage}
											className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
										/>
									</label>
								</div>

								<div className="mt-4 flex flex-wrap gap-2">
									{VARIABLES.map((variable) => (
										<button
											key={variable.token}
											type="button"
											onClick={() => insertVariable(variable.token)}
											disabled={!canManage}
											className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
											title={`Inserir ${variable.label}`}
										>
											<Copy size={13} />
											{variable.token}
										</button>
									))}
								</div>

								<textarea
									ref={textareaRef}
									value={activeTemplate?.conteudo || ""}
									onChange={(event) =>
										updateTemplate("conteudo", event.target.value)
									}
									disabled={!canManage}
									rows={9}
									className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
								/>

								<div className="mt-4 grid gap-3 md:grid-cols-3">
									<label className="block">
										<span className="text-sm font-semibold text-slate-700">
											Texto do botão
										</span>
										<input
											value={CENTRAL_WHATSAPP_BUTTON_TEXT}
											readOnly
											className="mt-1 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
										/>
									</label>
									<label className="block">
										<span className="text-sm font-semibold text-slate-700">
											WhatsApp da central
										</span>
										<input
											value={CENTRAL_WHATSAPP_PHONE}
											readOnly
											placeholder="+55 31 3987-0880"
											className="mt-1 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
										/>
									</label>
									<label className="block">
										<span className="text-sm font-semibold text-slate-700">
											Mensagem do botão
										</span>
										<input
											value={config.buttonMessage}
											onChange={(event) =>
												updateConfig("buttonMessage", event.target.value)
											}
											disabled={!canManage}
											className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
										/>
									</label>
								</div>
							</div>
						</div>
					</div>
				</div>

				<aside className="space-y-6">
					<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex items-center gap-2 text-slate-900">
							<Eye size={18} />
							<h2 className="text-lg font-bold">Prévia por cliente</h2>
						</div>
						<label className="mt-4 block">
							<span className="text-sm font-semibold text-slate-700">
								Cliente da prévia
							</span>
							<select
								value={selectedQueueId}
								onChange={(event) => setSelectedQueueId(event.target.value)}
								className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
							>
								{fila.length ? (
									fila.map((item) => (
										<option key={item.id} value={item.id}>
											{item.cliente} - {item.os}
										</option>
									))
								) : (
									<option value="">Cliente de exemplo</option>
								)}
							</select>
						</label>
						<div className="mt-4 rounded-lg bg-[#e5ddd5] p-4">
							<div className="ml-auto max-w-[92%] rounded-lg bg-[#dcf8c6] px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm">
								{previewMessage.split("\n").map((line, index) => (
									<p key={`${line}-${index}`} className={line ? "" : "h-3"}>
										{line}
									</p>
								))}
								<a
									href={whatsappLink}
									target="_blank"
									rel="noreferrer"
									className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white"
								>
									<Phone size={15} />
									{CENTRAL_WHATSAPP_BUTTON_TEXT}
								</a>
							</div>
						</div>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex items-center gap-2 text-slate-900">
							<ShieldCheck size={18} />
							<h2 className="text-lg font-bold">Proteções ativas</h2>
						</div>
						<div className="mt-4 space-y-3 text-sm text-slate-600">
							<p>
								Limite diário:{" "}
								{Number(config.dailySendLimit || 100).toLocaleString("pt-BR")}{" "}
								mensagem(ns)
							</p>
							<p>
								Janela: {config.sendWindowStart} até {config.sendWindowEnd}
							</p>
							<p>
								Delay:{" "}
								{config.smartDelayEnabled
									? "inteligente pela janela de envio"
									: "manual por intervalo"}
							</p>
							<p>
								Intervalo de segurança: {config.evolutionMinDelaySeconds || 45}s
								até {config.evolutionMaxDelaySeconds || 120}s
							</p>
							<p>
								Dias:{" "}
								{(config.sendDays || []).join(", ") || "Nenhum dia selecionado"}
							</p>
							<p>
								Duplicidade:{" "}
								{config.avoidDuplicates
									? `${config.duplicateBlockDays} dias`
									: "desativada"}
							</p>
							<p>
								Retentativa: até {config.retryLimit} tentativa(s), a cada{" "}
								{config.retryAfterMinutes} minutos
							</p>
						</div>
					</div>
				</aside>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="text-lg font-bold text-slate-900">
							Fila de aprovação
						</h2>
						<p className="mt-1 text-sm text-slate-500">
							Clientes detectados pela diferença do Mapa antes do disparo pelo
							WhatsApp.
						</p>
					</div>
					<button
						type="button"
						onClick={handleSimulateMapDiff}
						disabled={!canManage}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						<RefreshCw size={16} />
						Simular comparação do Mapa
					</button>
				</div>

				<div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
					<table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Cliente</th>
								<th className="px-4 py-3">O.S.</th>
								<th className="px-4 py-3">Cidade</th>
								<th className="px-4 py-3">Telefone</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Tentativas</th>
								<th className="px-4 py-3">Ações</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{fila.length ? (
								fila.map((item) => (
									<tr key={item.id} className="hover:bg-slate-50">
										<td className="px-4 py-3 font-semibold text-slate-900">
											{item.cliente}
										</td>
										<td className="px-4 py-3 text-slate-600">{item.os}</td>
										<td className="px-4 py-3 text-slate-600">{item.cidade}</td>
										<td className="px-4 py-3 text-slate-600">
											{item.telefone}
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[item.status] || STATUS_CLASSES.novo}`}
											>
												{STATUS_LABELS[item.status] || item.status}
											</span>
										</td>
										<td className="px-4 py-3 text-slate-600">
											{Number(item.tentativas || 0)}
										</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-2">
												<button
													type="button"
													disabled={!canManage}
													onClick={() => handleQueueStatus(item, "aprovado")}
													className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
												>
													Aprovar
												</button>
												<button
													type="button"
													disabled={!canManage}
													onClick={() => handleRegisterSend(item)}
													className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
												>
													Enviar
												</button>
												<button
													type="button"
													disabled={!canManage}
													onClick={() => handleRetry(item)}
													className="rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
												>
													<RotateCcw size={12} className="mr-1 inline" />
													Retentar
												</button>
												<button
													type="button"
													disabled={!canManage}
													onClick={() => handleQueueStatus(item, "ignorado")}
													className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
												>
													Ignorar
												</button>
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={7}
										className="px-4 py-8 text-center text-sm text-slate-500"
									>
										Nenhum cliente na fila. Use a simulação para preparar dados
										de teste.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-2 text-slate-900">
					<History size={18} />
					<h2 className="text-lg font-bold">Histórico de envios</h2>
				</div>
				<div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
					<table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Data</th>
								<th className="px-4 py-3">Cliente</th>
								<th className="px-4 py-3">Telefone</th>
								<th className="px-4 py-3">O.S.</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Origem</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{historico.length ? (
								historico.map((item) => (
									<tr key={item.id} className="hover:bg-slate-50">
										<td className="px-4 py-3 text-slate-600">
											{formatDateTime(item.criadoEm)}
										</td>
										<td className="px-4 py-3 font-semibold text-slate-900">
											{item.cliente}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{item.telefone}
										</td>
										<td className="px-4 py-3 text-slate-600">{item.os}</td>
										<td className="px-4 py-3 text-slate-600">{item.status}</td>
										<td className="px-4 py-3 text-slate-600">{item.origem}</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={6}
										className="px-4 py-8 text-center text-sm text-slate-500"
									>
										Nenhum envio registrado ainda.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
};

export default MensageriaPage;
