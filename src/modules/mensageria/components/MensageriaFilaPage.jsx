import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Pause,
	Play,
	RefreshCw,
	Save,
	Search,
	Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	atualizarItemFilaMensageria,
	buscarConfigMensageria,
	buscarFilaMensageria,
	buscarStatusEvolutionMensageria,
	executarEnvioEvolutionAgora,
	pausarEvolutionMensageria,
	retomarEvolutionMensageria,
	salvarConfigMensageria,
} from "../services/mensageriaService";

const PAGE_SIZES = [20, 30, 50, 100];

const DAY_OPTIONS = [
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

const formatDateTime = (value) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	});
};

const normalize = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

const getSendForecast = (item, config = {}) => {
	const status = String(item.status || "novo");
	if (status === "enviado") return "Já enviado";
	if (status === "ignorado") return "Ignorado";
	if (status === "falhou") return "Falhou";
	if (item.proximaTentativaEm)
		return `Após ${formatDateTime(item.proximaTentativaEm)}`;
	if (config.evolutionPaused) return "Pausada";
	return "Apto para envio";
};

const getProviderLabel = (config = {}) => {
	if (config.whatsappProvider === "official_whatsapp")
		return "WhatsApp oficial";
	return "Evolution API";
};

const getQueueItemLabel = (item = {}) => {
	if (!item) return "-";
	const codigo =
		item.codigoCliente || item.codigo_cliente || item.codigo || item.contrato || "";
	const cliente = item.cliente || item.cliente_nome || "";
	if (codigo && cliente) return `${codigo} - ${cliente}`;
	return cliente || codigo || item.telefone || item.os || "-";
};

const isQueueItemSendableNow = (item = {}, config = {}, now = new Date()) => {
	const status = String(item.status || "novo");
	if (!["aprovado", "novo", "aguardando_janela", "enviando"].includes(status)) {
		return false;
	}
	if (Number(item.tentativas || 0) >= Number(config.retryLimit || 3)) {
		return false;
	}
	if (item.proximaTentativaEm) {
		const next = new Date(item.proximaTentativaEm);
		if (!Number.isNaN(next.getTime()) && next > now) return false;
	}
	return true;
};

// Extraidos de useMensageriaFilaController (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma logica de antes, so tirados do hook
// pra funcoes puras (nao dependem de estado do React).
function matchesQueueFilters(item, filters, searchText) {
	const itemStatus = String(item.status || "novo");
	if (
		filters.status === "pendentes" &&
		["enviado", "ignorado"].includes(itemStatus)
	) {
		return false;
	}
	if (
		filters.status !== "todos" &&
		filters.status !== "pendentes" &&
		itemStatus !== filters.status
	) {
		return false;
	}
	if (
		filters.origem !== "todas" &&
		String(item.origem || "Sem origem") !== filters.origem
	) {
		return false;
	}
	if (!searchText) return true;
	return normalize(
		[
			item.cliente,
			item.telefone,
			item.os,
			item.cidade,
			item.origem,
			item.tipo,
		].join(" "),
	).includes(searchText);
}

function resolveStartButtonState({
	queueHasError,
	queueWaiting,
	queueRunning,
	workerActive,
}) {
	if (queueHasError) return "error";
	if (queueWaiting) return "waiting";
	if (queueRunning && workerActive) return "active";
	return "idle";
}

function resolveStartButtonLabel({ working, startButtonState, workerRunning }) {
	if (working) return "Processando...";
	if (startButtonState === "active") {
		return workerRunning ? "Enviando agora" : "Fila funcionando";
	}
	if (startButtonState === "waiting") return "Aguardando janela";
	if (startButtonState === "error") return "Fila com erro";
	return "Iniciar fila";
}

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveStartButtonTitle(startButtonState, status) {
	if (startButtonState === "active") {
		return "A fila esta ativa e enviando conforme a janela configurada.";
	}
	if (startButtonState === "waiting") {
		return (
			status?.worker?.lastSkipped || "A fila esta aguardando a proxima janela."
		);
	}
	if (startButtonState === "error") {
		return status?.worker?.lastError || "A fila encontrou um erro.";
	}
	return "Clique para iniciar a fila automatica.";
}

// Extraido do componente (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// pra reduzir a complexidade cognitiva da funcao de render — mesmo
// estado e mesmas chamadas, sem mudanca de comportamento.
function useMensageriaFilaController() {
	const { currentUser } = useAuthContext();
	const canManage =
		hasPermission(currentUser, "mensageria.fila.manage") ||
		hasPermission(currentUser, "manage_mensageria");
	const [fila, setFila] = useState([]);
	const [config, setConfig] = useState({});
	const [status, setStatus] = useState(null);
	const [loading, setLoading] = useState(true);
	const [working, setWorking] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [filters, setFilters] = useState({
		status: "pendentes",
		origem: "todas",
		search: "",
	});
	const [pageSize, setPageSize] = useState(20);
	const [page, setPage] = useState(1);

	const loadData = async () => {
		setLoading(true);
		try {
			const [nextConfig, nextStatus, nextFila] = await Promise.all([
				buscarConfigMensageria(),
				buscarStatusEvolutionMensageria().catch(() => null),
				buscarFilaMensageria(),
			]);
			setConfig(nextConfig || {});
			setStatus(nextStatus || null);
			setFila(nextFila || []);
		} catch (error) {
			setFeedback(error?.message || "Não foi possível carregar a fila.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
		const timer = window.setInterval(loadData, 30000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		setPage(1);
	}, [filters, pageSize]);

	const origemOptions = useMemo(() => {
		const values = new Set(
			fila.map((item) => String(item.origem || "Sem origem")).filter(Boolean),
		);
		return [
			"todas",
			...Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR")),
		];
	}, [fila]);

	const filteredFila = useMemo(() => {
		const text = normalize(filters.search);
		return fila.filter((item) => matchesQueueFilters(item, filters, text));
	}, [fila, filters]);

	const totalPages = Math.max(1, Math.ceil(filteredFila.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageItems = filteredFila.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);
	const nextQueueItem = useMemo(
		() =>
			fila.find((item) => isQueueItemSendableNow(item, config)) || null,
		[fila, config],
	);

	const stats = useMemo(
		() => ({
			total: fila.length,
			pendentes: fila.filter(
				(item) =>
					!["enviado", "ignorado"].includes(String(item.status || "novo")),
			).length,
			aprovados: fila.filter((item) => String(item.status || "") === "aprovado")
				.length,
			falhas: fila.filter((item) => String(item.status || "") === "falhou")
				.length,
		}),
		[fila],
	);

	const queueRunning = !config.evolutionPaused && Boolean(config.autoSend);
	const workerRunning = Boolean(status?.worker?.workerRunning);
	const workerActive = Boolean(status?.worker?.workerActive);
	const queueHasError = Boolean(status?.worker?.lastError);
	const queueWaiting =
		queueRunning && !queueHasError && Boolean(status?.worker?.lastSkipped);
	const startButtonState = resolveStartButtonState({
		queueHasError,
		queueWaiting,
		queueRunning,
		workerActive,
	});
	const startButtonClass = {
		active: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
		waiting: "bg-amber-500 text-white shadow-sm hover:bg-amber-600",
		error: "bg-red-600 text-white shadow-sm hover:bg-red-700",
		idle: "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
	}[startButtonState];
	const StartButtonIcon = startButtonState === "active" ? CheckCircle2 : Play;
	const startButtonLabel = resolveStartButtonLabel({
		working,
		startButtonState,
		workerRunning,
	});

	const handleStartQueue = async () => {
		setWorking(true);
		setFeedback("");
		try {
			await retomarEvolutionMensageria();
			setFeedback(
				"Fila iniciada. O sistema vai enviar uma mensagem por vez respeitando o delay configurado.",
			);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível iniciar a fila.");
		} finally {
			setWorking(false);
		}
	};

	const handlePauseQueue = async () => {
		setWorking(true);
		setFeedback("");
		try {
			await pausarEvolutionMensageria();
			setFeedback("Fila pausada.");
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível pausar a fila.");
		} finally {
			setWorking(false);
		}
	};

	const handleSendNow = async (item) => {
		setWorking(true);
		setFeedback("");
		try {
			await atualizarItemFilaMensageria(item.id, {
				status: "aprovado",
				proximaTentativaEm: "",
				prioridadeEm: new Date().toISOString(),
			});
			const result = await executarEnvioEvolutionAgora();
			setFeedback(
				result?.sent
					? `${result.sent} mensagem(ns) enviada(s).`
					: result?.skipped ||
							"Item priorizado, mas nenhum envio foi executado.",
			);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível enviar agora.");
		} finally {
			setWorking(false);
		}
	};

	const updateQueueConfig = (field, value) => {
		setConfig((current) => ({ ...current, [field]: value }));
	};

	const toggleSendDay = (day) => {
		setConfig((current) => {
			const days = Array.isArray(current.sendDays) ? current.sendDays : [];
			return {
				...current,
				sendDays: days.includes(day)
					? days.filter((item) => item !== day)
					: [...days, day],
			};
		});
	};

	const handleSaveQueueConfig = async () => {
		setWorking(true);
		setFeedback("");
		try {
			const minDelay = Math.max(
				5,
				Number(config.evolutionMinDelaySeconds || 45),
			);
			const nextConfig = {
				...config,
				dailySendLimit: Math.max(1, Number(config.dailySendLimit || 100)),
				evolutionMinDelaySeconds: minDelay,
				evolutionMaxDelaySeconds: Math.max(
					minDelay,
					Number(config.evolutionMaxDelaySeconds || 120),
				),
				sendDays:
					Array.isArray(config.sendDays) && config.sendDays.length
						? config.sendDays
						: ["seg", "ter", "qua", "qui", "sex", "sab"],
			};
			await salvarConfigMensageria(nextConfig);
			setFeedback("Configurações da fila salvas.");
			await loadData();
		} catch (error) {
			setFeedback(
				error?.message || "Não foi possível salvar as configurações da fila.",
			);
		} finally {
			setWorking(false);
		}
	};

	return {
		canManage,
		fila,
		config,
		status,
		loading,
		working,
		feedback,
		filters,
		setFilters,
		pageSize,
		setPageSize,
		page,
		setPage,
		loadData,
		origemOptions,
		filteredFila,
		totalPages,
		currentPage,
		pageItems,
		nextQueueItem,
		stats,
		queueRunning,
		workerRunning,
		workerActive,
		queueHasError,
		queueWaiting,
		startButtonState,
		startButtonClass,
		StartButtonIcon,
		startButtonLabel,
		handleStartQueue,
		handlePauseQueue,
		handleSendNow,
		updateQueueConfig,
		toggleSendDay,
		handleSaveQueueConfig,
	};
}

const MensageriaFilaPage = () => {
	const {
		canManage,
		config,
		status,
		loading,
		working,
		feedback,
		filters,
		setFilters,
		pageSize,
		setPageSize,
		setPage,
		loadData,
		origemOptions,
		filteredFila,
		totalPages,
		currentPage,
		pageItems,
		nextQueueItem,
		stats,
		workerRunning,
		startButtonState,
		startButtonClass,
		StartButtonIcon,
		startButtonLabel,
		handleStartQueue,
		handlePauseQueue,
		handleSendNow,
		updateQueueConfig,
		toggleSendDay,
		handleSaveQueueConfig,
	} = useMensageriaFilaController();

	if (loading) {
		return (
			<div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white">
				<div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
					<RefreshCw size={18} className="animate-spin" />
					Carregando fila da Mensageria...
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{feedback ? (
				<div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
					{feedback}
				</div>
			) : null}

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<div className="flex items-center gap-3">
							<span className="rounded-lg bg-blue-50 p-3 text-blue-600">
								<Clock size={22} />
							</span>
							<div>
								<h1 className="text-2xl font-bold text-slate-900">Fila</h1>
								<p className="text-sm text-slate-500">
									Veja quem está aguardando envio, quando será enviado e de onde
									o cliente entrou na fila.
								</p>
							</div>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={loadData}
							className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
						>
							<RefreshCw size={16} />
							Atualizar
						</button>
						<button
							type="button"
							onClick={handlePauseQueue}
							disabled={working || !canManage}
							className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
						>
							<Pause size={16} />
							Pausar
						</button>
						<button
							type="button"
							onClick={handleStartQueue}
							disabled={working || !canManage}
							title={resolveStartButtonTitle(startButtonState, status)}
							className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60 ${startButtonClass}`}
						>
							<StartButtonIcon
								size={16}
								className={workerRunning ? "animate-pulse" : ""}
							/>
							{startButtonLabel}
						</button>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-4">
				{[
					{
						label: "Na fila",
						value: stats.pendentes,
						icon: Clock,
						tone: "border-amber-200 bg-amber-50 text-amber-700",
					},
					{
						label: "Aprovadas",
						value: stats.aprovados,
						icon: CheckCircle2,
						tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
					},
					{
						label: "Falhas",
						value: stats.falhas,
						icon: AlertTriangle,
						tone: "border-red-200 bg-red-50 text-red-700",
					},
					{
						label: "Total",
						value: stats.total,
						icon: Send,
						tone: "border-blue-200 bg-blue-50 text-blue-700",
					},
				].map((card) => {
					const Icon = card.icon;
					return (
						<div
							key={card.label}
							className={`rounded-lg border p-5 shadow-sm ${card.tone}`}
						>
							<div className="flex items-center justify-between">
								<p className="text-xs font-black uppercase tracking-wide">
									{card.label}
								</p>
								<Icon size={18} />
							</div>
							<p className="mt-3 text-3xl font-black">
								{card.value.toLocaleString("pt-BR")}
							</p>
						</div>
					);
				})}
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="grid gap-4 md:grid-cols-4">
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-bold uppercase text-slate-500">
							Sistema
						</p>
						<p className="mt-1 text-sm font-black text-slate-900">
							{getProviderLabel(config)}
						</p>
					</div>
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-bold uppercase text-slate-500">
							Automação
						</p>
						<p className="mt-1 text-sm font-black text-slate-900">
							{config.evolutionPaused ? "Pausada" : "Ativa"}
						</p>
					</div>
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-bold uppercase text-slate-500">
							Próxima execução
						</p>
						<p className="mt-1 text-sm font-black text-slate-900">
							{formatDateTime(status?.worker?.nextRunAt)}
						</p>
						<p className="mt-1 truncate text-xs font-semibold text-slate-500">
							{getQueueItemLabel(status?.worker?.nextItem || nextQueueItem)}
						</p>
					</div>
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs font-bold uppercase text-slate-500">
							Última execução
						</p>
						<p className="mt-1 text-sm font-black text-slate-900">
							{formatDateTime(status?.worker?.lastRun)}
						</p>
						<p className="mt-1 truncate text-xs font-semibold text-slate-500">
							{getQueueItemLabel(status?.worker?.lastItem)}
						</p>
					</div>
				</div>
				{status?.worker?.lastSkipped ? (
					<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
						Último bloqueio: {status.worker.lastSkipped}
					</div>
				) : null}
				{status?.worker?.lastError ? (
					<div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
						Último erro: {status.worker.lastError}
					</div>
				) : null}
			</section>

			<section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<h2 className="text-lg font-bold text-slate-900">
							Janela de envio
						</h2>
						<p className="text-sm text-slate-500">
							Configure aqui quando a fila pode enviar automaticamente e qual
							intervalo será usado entre uma mensagem e outra.
						</p>
					</div>
					<button
						type="button"
						onClick={handleSaveQueueConfig}
						disabled={working || !canManage}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
					>
						<Save size={16} />
						Salvar janela
					</button>
				</div>

				<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
					<label className="block">
						<span className="text-xs font-bold uppercase text-slate-500">
							Início
						</span>
						<input
							type="time"
							value={config.sendWindowStart || "08:00"}
							onChange={(event) =>
								updateQueueConfig("sendWindowStart", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-bold uppercase text-slate-500">
							Fim
						</span>
						<input
							type="time"
							value={config.sendWindowEnd || "18:00"}
							onChange={(event) =>
								updateQueueConfig("sendWindowEnd", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-bold uppercase text-slate-500">
							Limite diário
						</span>
						<input
							type="number"
							min="1"
							value={config.dailySendLimit || 100}
							onChange={(event) =>
								updateQueueConfig("dailySendLimit", event.target.value)
							}
							disabled={!canManage}
							className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-bold uppercase text-slate-500">
							Delay mínimo
						</span>
						<input
							type="number"
							min="5"
							value={config.evolutionMinDelaySeconds || 45}
							onChange={(event) =>
								updateQueueConfig(
									"evolutionMinDelaySeconds",
									event.target.value,
								)
							}
							disabled={!canManage}
							className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-bold uppercase text-slate-500">
							Delay máximo
						</span>
						<input
							type="number"
							min="5"
							value={config.evolutionMaxDelaySeconds || 120}
							onChange={(event) =>
								updateQueueConfig(
									"evolutionMaxDelaySeconds",
									event.target.value,
								)
							}
							disabled={!canManage}
							className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
				</div>

				<div className="mt-4">
					<p className="text-xs font-bold uppercase text-slate-500">
						Dias de envio
					</p>
					<div className="mt-2 flex flex-wrap gap-2">
						{DAY_OPTIONS.map((day) => {
							const checked = (config.sendDays || []).includes(day.value);
							return (
								<button
									key={day.value}
									type="button"
									onClick={() => toggleSendDay(day.value)}
									disabled={!canManage}
									className={`rounded-lg border px-3 py-2 text-sm font-bold ${
										checked
											? "border-blue-600 bg-blue-600 text-white"
											: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
									}`}
								>
									{day.label}
								</button>
							);
						})}
					</div>
				</div>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_120px]">
					<label className="relative block">
						<Search
							className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
							size={17}
						/>
						<input
							value={filters.search}
							onChange={(event) =>
								setFilters((current) => ({
									...current,
									search: event.target.value,
								}))
							}
							placeholder="Buscar por cliente, telefone, O.S., cidade ou origem"
							className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
					<select
						value={filters.status}
						onChange={(event) =>
							setFilters((current) => ({
								...current,
								status: event.target.value,
							}))
						}
						className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
					>
						<option value="pendentes">Pendentes</option>
						<option value="todos">Todos</option>
						{Object.entries(STATUS_LABELS).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
					<select
						value={filters.origem}
						onChange={(event) =>
							setFilters((current) => ({
								...current,
								origem: event.target.value,
							}))
						}
						className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
					>
						{origemOptions.map((value) => (
							<option key={value} value={value}>
								{value === "todas" ? "Todas as origens" : value}
							</option>
						))}
					</select>
					<select
						value={pageSize}
						onChange={(event) => setPageSize(Number(event.target.value))}
						className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
					>
						{PAGE_SIZES.map((size) => (
							<option key={size} value={size}>
								{size} por página
							</option>
						))}
					</select>
				</div>

				<div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
					<table className="min-w-[920px] w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Cliente</th>
								<th className="px-4 py-3">Telefone</th>
								<th className="px-4 py-3">O.S.</th>
								<th className="px-4 py-3">Cidade</th>
								<th className="px-4 py-3">Origem</th>
								<th className="px-4 py-3">Quando vai enviar</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Tent.</th>
								<th className="px-4 py-3">Ações</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{pageItems.length ? (
								pageItems.map((item) => (
									<tr key={item.id} className="hover:bg-slate-50">
										<td className="px-4 py-3">
											<p className="font-bold text-slate-900">
												{item.cliente || "-"}
											</p>
											<p className="text-xs text-slate-500">
												{item.codigo_cliente || item.contrato || "-"}
											</p>
										</td>
										<td className="px-4 py-3 font-semibold text-slate-700">
											{item.telefone || "-"}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{item.os || "-"}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{item.cidade || "-"}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{item.origem || "-"}
										</td>
										<td className="px-4 py-3">
											<p className="font-semibold text-slate-800">
												{getSendForecast(item, config)}
											</p>
											{item.ultimoErro ? (
												<p className="mt-1 max-w-xs text-xs text-red-600">
													{item.ultimoErro}
												</p>
											) : null}
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_CLASSES[item.status] || STATUS_CLASSES.novo}`}
											>
												{STATUS_LABELS[item.status] || item.status || "Novo"}
											</span>
										</td>
										<td className="px-4 py-3 text-slate-600">
											{Number(item.tentativas || 0)}
										</td>
										<td className="px-4 py-3">
											<button
												type="button"
												onClick={() => handleSendNow(item)}
												disabled={
													working ||
													!canManage ||
													["enviado", "ignorado"].includes(
														String(item.status || ""),
													)
												}
												className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
											>
												<Send size={13} />
												Enviar agora
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={9}
										className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
									>
										Nenhum item encontrado na fila com os filtros atuais.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>

				<div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
					<span>
						Mostrando {pageItems.length ? (currentPage - 1) * pageSize + 1 : 0}{" "}
						a {Math.min(currentPage * pageSize, filteredFila.length)} de{" "}
						{filteredFila.length} item(ns)
					</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							disabled={currentPage <= 1}
							className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-50"
						>
							Anterior
						</button>
						<span className="font-bold text-slate-800">
							Página {currentPage} de {totalPages}
						</span>
						<button
							type="button"
							onClick={() =>
								setPage((current) => Math.min(totalPages, current + 1))
							}
							disabled={currentPage >= totalPages}
							className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-50"
						>
							Próxima
						</button>
					</div>
				</div>
			</section>
		</div>
	);
};

export default MensageriaFilaPage;
