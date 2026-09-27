import {
	AlertTriangle,
	CalendarClock,
	ChevronDown,
	CheckCircle2,
	Clock3,
	DatabaseZap,
	History,
	Loader2,
	PlugZap,
	PlayCircle,
	RefreshCw,
	Save,
	Search,
	ShieldCheck,
	X,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import {
	associarHubsoft,
	buscarConfigHubsoft,
	buscarHistoricoSyncHubsoft,
	buscarJobSyncHubsoft,
	buscarProfilesHubsoft,
	buscarRegistrosHubsoft,
	buscarRunsProfilesHubsoft,
	buscarTecnicosRetiradaHubsoft,
	descobrirTecnicosRetiradaHubsoft,
	executarAuditoriaMetasHubsoft,
	executarProfileHubsoft,
	consultarOrdensHubsoft,
	DEFAULT_HUBSOFT_CONFIG,
	iniciarSyncHubsoft,
	salvarConfigHubsoft,
	testarConexaoHubsoft,
} from "../services/hubsoftService";

const SEARCH_TYPES = [
	{ value: "codigo_cliente", label: "Código do cliente" },
	{ value: "cpf_cnpj", label: "CPF/CNPJ" },
	{ value: "id_cliente_servico", label: "ID cliente serviço" },
	{ value: "numero_ordem_servico", label: "Número da O.S." },
];
const SYNC_STATUSES = [
	{ value: "pendente", label: "Pendente" },
	{ value: "aguardando_agendamento", label: "Aguardando agendamento" },
	{ value: "finalizado", label: "Finalizado" },
];
const SYNC_FONTES = [
	{ value: "sempre", label: "Sempre" },
	{ value: "onnet", label: "Onnet" },
];
const HUBSOFT_PROFILES = [
	{ id: "MAPA", label: "Mapa", helper: "O.S. abertas para Mensageria" },
	{ id: "MATCH", label: "Match", helper: "O.S. abertas para conciliação" },
	{ id: "LOJA", label: "Loja D-1", helper: "Entregas em loja concluídas" },
	{ id: "MULTAS", label: "Multas", helper: "Multa de equipamento por indisponibilidade" },
	{ id: "META_D0", label: "Meta D+0", helper: "Acompanhamento do dia" },
	{ id: "META_D_MINUS_ONE", label: "Meta D-1", helper: "Fechamento do dia anterior" },
];
const JOB_POLL_MS = 1500;

function formatDateTime(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function toInputDate(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return toInputDate(new Date());
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function buildMetaAuditDates({ mode, endDate }) {
	const finalDate = endDate || toInputDate();
	const end = new Date(`${finalDate}T12:00:00`);
	if (Number.isNaN(end.getTime())) return [toInputDate()];
	let start = new Date(end);
	if (mode === "weekly") {
		start.setDate(end.getDate() - 6);
	} else if (mode === "monthly") {
		start = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0);
	} else if (mode === "yearly") {
		start = new Date(end.getFullYear(), 0, 1, 12, 0, 0);
	}
	const dates = [];
	for (
		const cursor = new Date(start);
		cursor.getTime() <= end.getTime();
		cursor.setDate(cursor.getDate() + 1)
	) {
		dates.push(toInputDate(cursor));
	}
	return dates;
}

function safePreview(payload) {
	if (!payload) return "";
	try {
		return JSON.stringify(payload, null, 2).slice(0, 6000);
	} catch {
		return String(payload).slice(0, 6000);
	}
}

function formatNumber(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) return "-";
	return new Intl.NumberFormat("pt-BR").format(number);
}

function getStatusKind(status) {
	if (["COMPLETE", "VALID_EMPTY_RESULT", "completed", "Operacional"].includes(status)) {
		return "success";
	}
	if (["RUNNING", "queued", "running", "Sincronizando"].includes(status)) return "running";
	if (["NEVER_RUN", "Pendente", undefined, null, ""].includes(status)) return "neutral";
	return "error";
}

function StatusBadge({ status, label }) {
	const kind = getStatusKind(status);
	const classes = {
		success: "border-emerald-200 bg-emerald-50 text-emerald-800",
		running: "border-blue-200 bg-blue-50 text-blue-800",
		neutral: "border-slate-200 bg-slate-50 text-slate-700",
		error: "border-red-200 bg-red-50 text-red-800",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${classes[kind]}`}
		>
			{label || status || "NEVER_RUN"}
		</span>
	);
}

function getProfileState(profiles, profile) {
	return (profiles || []).find((item) => item.profile === profile) || {};
}

function getLatestRun(profiles, profileIds) {
	const ids = Array.isArray(profileIds) ? profileIds : [profileIds];
	return ids
		.map((id) => getProfileState(profiles, id)?.lastRun)
		.filter(Boolean)
		.sort(
			(a, b) =>
				new Date(b.started_at || 0).getTime() -
				new Date(a.started_at || 0).getTime(),
		)[0];
}

function addMinutes(value, minutes) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	date.setMinutes(date.getMinutes() + Number(minutes || 0));
	return formatDateTime(date);
}

function nextDailyTime(time, enabled = true) {
	if (!enabled) return "Automação desativada";
	const [hour = "0", minute = "0"] = String(time || "00:00").split(":");
	const now = new Date();
	const next = new Date(now);
	next.setHours(Number(hour), Number(minute), 0, 0);
	if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
	return formatDateTime(next);
}

function nextCheckpoint(config) {
	if (config.autoDailyEnabled === false || config.autoSyncEnabled === false) {
		return "Automação desativada";
	}
	const hours = Array.isArray(config.autoDailyCheckpointHours)
		? config.autoDailyCheckpointHours
		: [];
	if (!hours.length) return "-";
	const now = new Date();
	const sorted = [...hours].sort((a, b) => a - b);
	const nextHour = sorted.find((hour) => hour > now.getHours());
	const date = new Date(now);
	date.setHours(nextHour ?? sorted[0], 0, 0, 0);
	if (nextHour === undefined) date.setDate(date.getDate() + 1);
	return formatDateTime(date);
}

function getOverallStatus(config, profiles) {
	if (!config.webUsername || !config.webPasswordConfigured) return "Pendente";
	if ((profiles || []).some((item) => getStatusKind(item.status) === "running")) {
		return "Sincronizando";
	}
	if ((profiles || []).some((item) => getStatusKind(item.status) === "error")) {
		return "Atenção";
	}
	return "Operacional";
}

function HubsoftHeader({
	onRefresh,
	onSave,
	saving,
	testing,
	associating,
	config,
	profiles,
}) {
	const busy = saving || testing || associating;
	return (
		<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
						<PlugZap size={24} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Hubsoft</h1>
						<p className="text-sm font-semibold text-slate-500">
							Integração, sincronização e auditoria operacional
						</p>
						<p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">
							Configure credenciais, automações e acompanhe as execuções de
							Mapa, Match, Metas, Loja, Multas e técnicos de retirada.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<StatusBadge status={getOverallStatus(config, profiles)} />
					<button
						type="button"
						onClick={onRefresh}
						disabled={busy}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
					>
						<RefreshCw size={17} /> Atualizar
					</button>
					<button
						type="button"
						onClick={onSave}
						disabled={busy}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
					>
						{saving ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Save size={17} />
						)}{" "}
						Salvar alterações
					</button>
				</div>
			</div>
		</section>
	);
}

function HubsoftFeedback({ feedback, error }) {
	return (
		<>
			{feedback ? (
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-800">
					{feedback}
				</div>
			) : null}
			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">
					{error}
				</div>
			) : null}
		</>
	);
}

function OverviewCard({ label, value, helper, icon, tone = "blue" }) {
	const tones = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		slate: "border-slate-100 bg-slate-50 text-slate-700",
		red: "border-red-100 bg-red-50 text-red-700",
	};
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">
						{label}
					</p>
					<p className="mt-2 text-lg font-black text-slate-950">{value}</p>
				</div>
				<div
					className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}
				>
					{icon}
				</div>
			</div>
			<p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p>
		</div>
	);
}

function HubsoftStatusCards({ config, profiles }) {
	const latestRun = getLatestRun(
		profiles,
		HUBSOFT_PROFILES.map((profile) => profile.id),
	);
	const failed = (profiles || []).filter(
		(item) => getStatusKind(item.status) === "error",
	).length;
	const activeRoutines = [
		config.autoDailyEnabled,
		config.autoMetaEnabled,
		config.autoFinesEnabled,
		config.autoMapMatchEnabled,
	].filter((item) => item !== false).length;
	const overall = getOverallStatus(config, profiles);
	return (
		<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
			<OverviewCard
				label="Status geral"
				value={overall}
				helper={`Origem HubSoft: ${config.useHubsoftAsSource ? "ativa" : "não ativa"}`}
				icon={<PlugZap size={20} />}
				tone={overall === "Atenção" ? "red" : "emerald"}
			/>
			<OverviewCard
				label="Autenticação"
				value={config.webPasswordConfigured ? "Login salvo" : "Pendente"}
				helper={config.webUsername || "Credenciais web não configuradas"}
				icon={<ShieldCheck size={20} />}
			/>
			<OverviewCard
				label="Última execução"
				value={formatDateTime(latestRun?.started_at)}
				helper={latestRun?.profile || "Nenhuma rotina executada"}
				icon={<History size={20} />}
				tone="slate"
			/>
			<OverviewCard
				label="Próximo checkpoint"
				value={nextCheckpoint(config)}
				helper="Diário operacional"
				icon={<CalendarClock size={20} />}
				tone="orange"
			/>
			<OverviewCard
				label="Erros recentes"
				value={formatNumber(failed)}
				helper={failed ? "Há rotinas com falha" : "Sem falhas nos profiles"}
				icon={<AlertTriangle size={20} />}
				tone={failed ? "red" : "emerald"}
			/>
			<OverviewCard
				label="Rotinas ativas"
				value={`${activeRoutines}/4`}
				helper="Diário, metas, multas, mapa/match"
				icon={<Clock3 size={20} />}
				tone="blue"
			/>
		</section>
	);
}

// Extraido do componente (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// pra reduzir a complexidade cognitiva da funcao de render — mesmo
// estado e mesmas chamadas, sem mudanca de comportamento.
function useHubsoftSettingsController() {
	const [config, setConfig] = useState(DEFAULT_HUBSOFT_CONFIG);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [associating, setAssociating] = useState(false);
	const [searching, setSearching] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");
	const [testResult, setTestResult] = useState(null);
	const [syncJob, setSyncJob] = useState(null);
	const [syncRuns, setSyncRuns] = useState([]);
	const [profiles, setProfiles] = useState([]);
	const [profileRuns, setProfileRuns] = useState([]);
	const [profileRunning, setProfileRunning] = useState("");
	const [metaAuditRunning, setMetaAuditRunning] = useState(false);
	const [metaAuditProgress, setMetaAuditProgress] = useState(null);
	const [metaAuditForm, setMetaAuditForm] = useState({
		mode: "daily",
		endDate: toInputDate(),
	});
	const [technicians, setTechnicians] = useState([]);
	const [discoveringTechnicians, setDiscoveringTechnicians] = useState(false);
	const [query, setQuery] = useState({
		busca: "codigo_cliente",
		termo_busca: "",
		status: "",
		limit: 20,
	});
	const [queryResult, setQueryResult] = useState(null);

	const loadConfig = async () => {
		setLoading(true);
		setError("");
		try {
			setConfig({
				...DEFAULT_HUBSOFT_CONFIG,
				...(await buscarConfigHubsoft()),
			});
			const runs = await buscarHistoricoSyncHubsoft(8).catch(() => ({
				items: [],
			}));
			setSyncRuns(runs?.items || []);
			const [profileResult, technicianResult] = await Promise.all([
				buscarProfilesHubsoft().catch(() => ({ items: [] })),
				buscarTecnicosRetiradaHubsoft().catch(() => ({ items: [] })),
			]);
			setProfiles(profileResult?.items || []);
			setTechnicians(technicianResult?.items || []);
			const profileRunResult = await buscarRunsProfilesHubsoft({ limit: 60 }).catch(
				() => [],
			);
			setProfileRuns(
				Array.isArray(profileRunResult)
					? profileRunResult
					: profileRunResult?.items || [],
			);
		} catch (err) {
			setError(
				err?.message || "Não foi possível carregar a configuração do Hubsoft.",
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadConfig();
	}, []);

	const updateConfig = (field, value) => {
		setConfig((current) => ({ ...current, [field]: value }));
	};

	const handleSave = async () => {
		setSaving(true);
		setError("");
		setFeedback("");
		try {
			const saved = await salvarConfigHubsoft(config);
			setConfig({ ...DEFAULT_HUBSOFT_CONFIG, ...saved });
			setFeedback("Configuração do Hubsoft salva com sucesso.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a configuração.");
		} finally {
			setSaving(false);
		}
	};

	const handleTest = async () => {
		setTesting(true);
		setError("");
		setFeedback("");
		setTestResult(null);
		try {
			await salvarConfigHubsoft(config);
			const result = await testarConexaoHubsoft();
			setTestResult(result);
			setFeedback(
				"Conexão Hubsoft validada. Token gerado e armazenado para uso do backend.",
			);
			await loadConfig();
		} catch (err) {
			setError(err?.message || "Não foi possível validar a conexão Hubsoft.");
		} finally {
			setTesting(false);
		}
	};

	const handleAssociate = async () => {
		const confirmed = window.confirm(
			"Associar Hubsoft como origem de dados? O sistema ficará marcado para consultar o Hubsoft no lugar das planilhas quando a rotina for ativada.",
		);
		if (!confirmed) return;
		setAssociating(true);
		setError("");
		setFeedback("");
		try {
			const saved = await associarHubsoft();
			setConfig({ ...DEFAULT_HUBSOFT_CONFIG, ...saved });
			setFeedback(
				"Hubsoft associado. A integração ficou marcada como origem preferencial.",
			);
		} catch (err) {
			setError(err?.message || "Não foi possível associar o Hubsoft.");
		} finally {
			setAssociating(false);
		}
	};

	const handleSearch = async () => {
		setSearching(true);
		setError("");
		setQueryResult(null);
		try {
			setQueryResult(await consultarOrdensHubsoft(query));
		} catch (err) {
			setError(err?.message || "Não foi possível consultar O.S. no Hubsoft.");
		} finally {
			setSearching(false);
		}
	};

	const toggleArrayValue = (field, value) => {
		setConfig((current) => {
			const values = Array.isArray(current[field]) ? current[field] : [];
			return {
				...current,
				[field]: values.includes(value)
					? values.filter((item) => item !== value)
					: [...values, value],
			};
		});
	};

	const pollSyncJob = async (jobId) => {
		const active = true;
		while (active) {
			const job = await buscarJobSyncHubsoft(jobId);
			setSyncJob(job);
			if (job.status === "completed") {
				setFeedback("Sincronização Hubsoft concluída.");
				setSyncing(false);
				await loadConfig();
				return job;
			}
			if (job.status === "failed") {
				setError(job.error || "Falha na sincronização Hubsoft.");
				setSyncing(false);
				await loadConfig();
				return job;
			}
			await new Promise((resolve) => window.setTimeout(resolve, JOB_POLL_MS));
		}
		return null;
	};

	const handleSync = async (mode) => {
		const isProduction = mode === "production";
		if (isProduction) {
			const confirmed = window.confirm(
				"Executar sincronização em produção? Isso substituirá os dados atuais de Mapa e Match pelas O.S. retornadas pelo Hubsoft.",
			);
			if (!confirmed) return;
		}
		setSyncing(true);
		setError("");
		setFeedback("");
		setSyncJob(null);
		try {
			await salvarConfigHubsoft(config);
			const started = await iniciarSyncHubsoft({ mode });
			setSyncJob(started);
			await pollSyncJob(started.jobId);
		} catch (err) {
			setError(
				err?.message || "Não foi possível iniciar a sincronização Hubsoft.",
			);
			setSyncing(false);
		}
	};

	const handleRunProfile = async (profile, payload = {}) => {
		setProfileRunning(profile);
		setError("");
		setFeedback("");
		try {
			const result = await executarProfileHubsoft(profile, {
				...payload,
				async: true,
			});
			setFeedback(
				`${profile} iniciado no backend. Use Atualizar para acompanhar o status.`,
			);
			await loadConfig();
			return result;
		} catch (err) {
			setError(err?.message || `Não foi possível executar ${profile}.`);
			return null;
		} finally {
			setProfileRunning("");
		}
	};

	const handleRunMetaAudit = async () => {
		const dates = buildMetaAuditDates(metaAuditForm);
		if (
			dates.length > 31 &&
			!window.confirm(
				`A auditoria vai executar ${dates.length} dias de metas. Deseja continuar?`,
			)
		) {
			return null;
		}
		setMetaAuditRunning(true);
		setError("");
		setFeedback("");
		setMetaAuditProgress({
			current: 0,
			total: dates.length,
			date: "",
			status: "Enviando auditoria para o backend",
		});
		try {
			const result = await executarAuditoriaMetasHubsoft({ dates, force: true });
			setFeedback(
				`Auditoria de metas iniciada no backend: ${dates.length} dia(s), incluindo entrega em loja diária.`,
			);
			setMetaAuditProgress({
				current: 1,
				total: dates.length,
				date: dates[dates.length - 1] || "",
				status: "Auditoria enviada. Use Atualizar para acompanhar.",
			});
			await loadConfig();
			return result;
		} catch (err) {
			setError(err?.message || "Não foi possível concluir a auditoria de metas.");
			return null;
		} finally {
			setMetaAuditRunning(false);
		}
	};

	const handleDiscoverTechnicians = async () => {
		setDiscoveringTechnicians(true);
		setError("");
		setFeedback("");
		try {
			const result = await descobrirTecnicosRetiradaHubsoft();
			setFeedback(
				`Técnicos de retirada atualizados: ${result?.saved?.length || 0}.`,
			);
			await loadConfig();
		} catch (err) {
			setError(
				err?.message || "Não foi possível descobrir técnicos de retirada.",
			);
		} finally {
			setDiscoveringTechnicians(false);
		}
	};

	return {
		config,
		loading,
		saving,
		testing,
		associating,
		searching,
		syncing,
		feedback,
		error,
		testResult,
		syncJob,
		syncRuns,
		profiles,
		profileRuns,
		profileRunning,
		metaAuditForm,
		setMetaAuditForm,
		metaAuditRunning,
		metaAuditProgress,
		technicians,
		discoveringTechnicians,
		query,
		setQuery,
		queryResult,
		loadConfig,
		updateConfig,
		handleSave,
		handleTest,
		handleAssociate,
		handleSearch,
		handleRunProfile,
		handleRunMetaAudit,
		handleDiscoverTechnicians,
		toggleArrayValue,
		handleSync,
	};
}

function CollapsibleSection({
	title,
	description,
	icon,
	iconClassName = "bg-slate-100 text-slate-700",
	defaultOpen = false,
	status,
	summary,
	lastUpdate,
	nextUpdate,
	onLastUpdateClick,
	children,
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				className="flex w-full items-start justify-between gap-4 text-left"
			>
				<div className="flex min-w-0 items-start gap-3">
					<div
						className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}
					>
						{icon}
					</div>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-lg font-black text-slate-950">{title}</h2>
							{status ? <StatusBadge status={status} /> : null}
						</div>
						{description ? (
							<p className="text-sm font-semibold text-slate-500">
								{description}
							</p>
						) : null}
						{summary || lastUpdate || nextUpdate ? (
							<div className="mt-3 flex flex-wrap gap-2">
								{summary ? (
									<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
										{summary}
									</span>
								) : null}
								{lastUpdate ? (
									<span
										role={onLastUpdateClick ? "button" : undefined}
										tabIndex={onLastUpdateClick ? 0 : undefined}
										onClick={(event) => {
											event.stopPropagation();
											onLastUpdateClick?.();
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												event.stopPropagation();
												onLastUpdateClick?.();
											}
										}}
										className={`rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 ${
											onLastUpdateClick ? "cursor-pointer hover:bg-blue-100" : ""
										}`}
									>
										Última: {lastUpdate}
									</span>
								) : null}
								{nextUpdate ? (
									<span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
										Próxima: {nextUpdate}
									</span>
								) : null}
							</div>
						) : null}
					</div>
				</div>
				<ChevronDown
					size={22}
					className={`mt-2 shrink-0 text-slate-500 transition-transform ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>
			{open ? <div className="mt-5">{children}</div> : null}
		</section>
	);
}

// Extraido de HubsoftSettingsPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — secao inteira de sincronizacao Mapa/Match
// (botoes, config, job em andamento e historico de execucoes), mesma
// JSX/logica de antes.
function HubsoftSyncSection({
	syncing,
	handleSync,
	config,
	updateConfig,
	toggleArrayValue,
	syncJob,
	syncRuns,
}) {
	return (
		<CollapsibleSection
			title="Sincronização Mapa e Match"
			description="Fluxo legado de prévia/produção. Mantenha fechado se for usar a Central de Sincronização."
			icon={<DatabaseZap size={21} />}
			iconClassName="bg-orange-50 text-orange-700"
			defaultOpen={false}
		>
			<div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<p className="text-sm font-semibold text-slate-500">
					Prepare a leitura automática do HubSoft. Use prévia primeiro; produção
					substitui os dados atuais.
				</p>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						disabled={syncing}
						onClick={() => handleSync("preview")}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
					>
						{syncing ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Search size={17} />
						)}{" "}
						Gerar prévia
					</button>
					<button
						type="button"
						disabled={syncing}
						onClick={() => handleSync("production")}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
					>
						{syncing ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<DatabaseZap size={17} />
						)}{" "}
						Sincronizar produção
					</button>
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Tipo de busca padrão
					</span>
					<select
						value={config.syncBusca || "numero_ordem_servico"}
						onChange={(event) => updateConfig("syncBusca", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-300"
					>
						{SEARCH_TYPES.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Limite por chamada
					</span>
					<input
						type="number"
						min="1"
						max="50"
						value={config.syncLimit || 50}
						onChange={(event) =>
							updateConfig("syncLimit", Number(event.target.value))
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
					/>
				</label>
				<label className="block lg:col-span-2">
					<span className="text-xs font-black uppercase text-slate-500">
						Termos de busca opcionais
					</span>
					<textarea
						value={(Array.isArray(config.syncTermos)
							? config.syncTermos
							: []
						).join("\n")}
						onChange={(event) =>
							updateConfig(
								"syncTermos",
								event.target.value
									.split(/[\n,;]+/)
									.map((item) => item.trim())
									.filter(Boolean),
							)
						}
						rows={3}
						placeholder="Um termo por linha. Ex: códigos de clientes, números de O.S. ou deixe vazio para tentativa geral por status."
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300"
					/>
				</label>
			</div>

			<div className="mt-5 grid gap-4 lg:grid-cols-3">
				<div className="rounded-2xl border border-slate-200 p-4">
					<p className="text-xs font-black uppercase text-slate-500">
						Status de O.S.
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{SYNC_STATUSES.map((item) => (
							<button
								key={item.value}
								type="button"
								onClick={() => toggleArrayValue("syncStatuses", item.value)}
								className={`rounded-full px-3 py-2 text-xs font-black transition ${
									(config.syncStatuses || []).includes(item.value)
										? "bg-blue-600 text-white"
										: "bg-slate-100 text-slate-600 hover:bg-slate-200"
								}`}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>
				<div className="rounded-2xl border border-slate-200 p-4">
					<p className="text-xs font-black uppercase text-slate-500">
						Fontes atualizadas
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{SYNC_FONTES.map((item) => (
							<button
								key={item.value}
								type="button"
								onClick={() => toggleArrayValue("syncFontes", item.value)}
								className={`rounded-full px-3 py-2 text-xs font-black transition ${
									(config.syncFontes || []).includes(item.value)
										? "bg-emerald-600 text-white"
										: "bg-slate-100 text-slate-600 hover:bg-slate-200"
								}`}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>
				<div className="rounded-2xl border border-slate-200 p-4">
					<p className="text-xs font-black uppercase text-slate-500">Match</p>
					<label className="mt-3 inline-flex items-center gap-2 text-sm font-black text-slate-700">
						<input
							type="checkbox"
							checked={config.syncMatchEnabled !== false}
							onChange={(event) =>
								updateConfig("syncMatchEnabled", event.target.checked)
							}
							className="h-4 w-4"
						/>
						Atualizar Match junto com Mapa
					</label>
				</div>
			</div>

			{syncJob ? (
				<div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm font-black text-blue-950">
								{syncJob.stage || "Processando"}
							</p>
							<p className="text-xs font-semibold text-blue-700">
								Status: {syncJob.status || "-"}{" "}
								{syncJob.error ? `| ${syncJob.error}` : ""}
							</p>
						</div>
						<span className="text-lg font-black text-blue-950">
							{Number(syncJob.percent || 0)}%
						</span>
					</div>
					<div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
						<div
							className="h-full rounded-full bg-blue-600 transition-all"
							style={{
								width: `${Math.min(Math.max(Number(syncJob.percent || 0), 0), 100)}%`,
							}}
						/>
					</div>
					{syncJob.result?.sample?.length ? (
						<pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">
							{safePreview(syncJob.result.sample)}
						</pre>
					) : null}
				</div>
			) : null}

			{syncRuns.length ? (
				<div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
					<table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Data</th>
								<th className="px-4 py-3">Modo</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">O.S.</th>
								<th className="px-4 py-3">Mapa</th>
								<th className="px-4 py-3">Match</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{syncRuns.map((run) => (
								<tr key={run.id}>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{formatDateTime(run.createdAt)}
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{run.mode || "-"}
									</td>
									<td className="px-4 py-3 font-black text-slate-900">
										{run.status || "-"}
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{run.totalRows || 0}
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{run.mapaTotal || 0}
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{run.matchTotal || 0}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</CollapsibleSection>
	);
}

function statusTone(status) {
	if (["COMPLETE", "VALID_EMPTY_RESULT", "completed"].includes(status)) {
		return "bg-emerald-50 text-emerald-800 border-emerald-200";
	}
	if (["RUNNING", "queued", "running"].includes(status)) {
		return "bg-blue-50 text-blue-800 border-blue-200";
	}
	if (["NEVER_RUN"].includes(status)) {
		return "bg-slate-50 text-slate-700 border-slate-200";
	}
	return "bg-red-50 text-red-800 border-red-200";
}

function getNextProfileRun(profileId, state, config) {
	if (state?.status === "RUNNING" || state?.locked) return "Após conclusão";
	const lastRun = state?.lastRun;
	if (["MAPA", "MATCH"].includes(profileId)) {
		if (config.autoMapMatchEnabled === false || config.autoSyncEnabled === false) {
			return "Automação desativada";
		}
		return addMinutes(lastRun?.started_at, config.autoMapMatchIntervalMinutes || 60);
	}
	if (profileId === "META_D0") {
		if (config.autoDailyEnabled === false || config.autoSyncEnabled === false) {
			return "Automação desativada";
		}
		return addMinutes(lastRun?.started_at, config.autoDailyIntervalMinutes || 30);
	}
	if (profileId === "META_D_MINUS_ONE" || profileId === "LOJA") {
		return nextDailyTime(
			config.autoMetaTime || "03:00",
			config.autoMetaEnabled !== false && config.autoSyncEnabled !== false,
		);
	}
	if (profileId === "MULTAS") {
		return nextDailyTime(
			config.autoFinesTime || "18:00",
			config.autoFinesEnabled !== false && config.autoSyncEnabled !== false,
		);
	}
	return "-";
}

function ProfileHistoryButton({ run, onOpenRun }) {
	if (!run?.id) return null;
	return (
		<button
			type="button"
			onClick={() => onOpenRun(run)}
			className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 transition hover:bg-slate-200"
		>
			{formatDateTime(run.started_at)}
		</button>
	);
}

function HubsoftProfilesSection({
	profiles,
	profileRuns,
	profileRunning,
	onRunProfile,
	onOpenRun,
	config,
}) {
	const byProfile = new Map((profiles || []).map((item) => [item.profile, item]));
	const latestRun = getLatestRun(
		profiles,
		HUBSOFT_PROFILES.map((profile) => profile.id),
	);
	return (
		<CollapsibleSection
			title="Central Técnica de Integração HubSoft"
			description="Rotinas operacionais separadas por domínio, com histórico e snapshots auditáveis."
			icon={<PlayCircle size={21} />}
			iconClassName="bg-indigo-50 text-indigo-700"
			status={
				(profiles || []).some((item) => item.status === "RUNNING")
					? "RUNNING"
					: (profiles || []).some((item) => getStatusKind(item.status) === "error")
						? "FAILED"
						: "COMPLETE"
			}
			summary={`${formatNumber(HUBSOFT_PROFILES.length)} rotinas`}
			lastUpdate={formatDateTime(latestRun?.started_at)}
			nextUpdate={nextCheckpoint(config)}
			onLastUpdateClick={() => latestRun && onOpenRun(latestRun)}
			defaultOpen
		>
			<div className="grid gap-4 xl:grid-cols-3">
				{HUBSOFT_PROFILES.map((profile) => {
					const state = byProfile.get(profile.id) || {};
					const lastRun = state.lastRun || {};
					const ranking = lastRun.result_summary?.ranking || {};
					const progress = lastRun.result_summary || {};
					const running = profileRunning === profile.id || state.locked;
					const history = (profileRuns || [])
						.filter((run) => run.profile === profile.id)
						.slice(0, 3);
					return (
						<div
							key={profile.id}
							className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						>
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-black text-slate-950">
										{profile.label}
									</p>
									<p className="mt-1 text-xs font-semibold text-slate-500">
										{profile.helper}
									</p>
								</div>
								<span
									className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusTone(state.status)}`}
								>
									{state.status || "NEVER_RUN"}
								</span>
							</div>
							<dl className="mt-4 space-y-2 text-xs font-semibold text-slate-600">
								{running ? (
									<div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
										<div className="flex items-center justify-between gap-3 text-blue-900">
											<dt className="font-black">
												{progress.stage || "Processando HubSoft"}
											</dt>
											<dd className="font-black">
												{Number(progress.percent || 0)}%
											</dd>
										</div>
										<div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
											<div
												className="h-full rounded-full bg-blue-600 transition-all"
												style={{
													width: `${Math.min(
														Math.max(Number(progress.percent || 0), 0),
														100,
													)}%`,
												}}
											/>
										</div>
										<p className="mt-2 text-[11px] font-bold text-blue-700">
											Último sinal: {formatDateTime(progress.heartbeatAt)}
										</p>
									</div>
								) : null}
								<div className="flex justify-between gap-3">
									<dt>Última execução</dt>
									<dd>
										<button
											type="button"
											disabled={!lastRun.id}
											onClick={() => onOpenRun(lastRun)}
											className="font-black text-blue-700 disabled:text-slate-500"
										>
											{formatDateTime(lastRun.started_at)}
										</button>
									</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt>Próxima</dt>
									<dd>{getNextProfileRun(profile.id, state, config)}</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt>Total</dt>
									<dd>{formatNumber(lastRun.expected_total)}</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt>Únicos</dt>
									<dd>{formatNumber(lastRun.unique_rows)}</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt>Não classificados</dt>
									<dd>{formatNumber(lastRun.unclassified)}</dd>
								</div>
							</dl>
							{ranking.cidades?.length ? (
								<div className="mt-4 rounded-xl bg-slate-50 p-3">
									<p className="text-[10px] font-black uppercase text-slate-500">
										Ranking cidades
									</p>
									<div className="mt-2 space-y-1">
										{ranking.cidades.slice(0, 3).map((item) => (
											<div
												key={item.label}
												className="flex justify-between gap-3 text-xs font-bold text-slate-700"
											>
												<span className="truncate">{item.label}</span>
												<span>{formatNumber(item.total)}</span>
											</div>
										))}
									</div>
								</div>
							) : null}
							{history.length ? (
								<div className="mt-4">
									<p className="text-[10px] font-black uppercase text-slate-500">
										Histórico
									</p>
									<div className="mt-2 flex flex-wrap gap-2">
										{history.map((run) => (
											<ProfileHistoryButton
												key={run.id}
												run={run}
												onOpenRun={onOpenRun}
											/>
										))}
									</div>
								</div>
							) : null}
							<button
								type="button"
								disabled={Boolean(profileRunning) || running}
								onClick={() => onRunProfile(profile.id)}
								className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
							>
								{running ? (
									<Loader2 className="animate-spin" size={17} />
								) : (
									<PlayCircle size={17} />
								)}
								Sincronizar agora
							</button>
						</div>
					);
				})}
			</div>
		</CollapsibleSection>
	);
}

function resolveMetaAuditState(profiles = []) {
	return (profiles || []).find((item) => item.profile === "META_AUDIT") || null;
}

function HubsoftMetaAuditSection({
	form,
	setForm,
	running,
	progress,
	auditState,
	onRun,
	profileRunning,
}) {
	const dates = buildMetaAuditDates(form);
	const auditLastRun = auditState?.lastRun || {};
	const auditProgress = auditLastRun.result_summary || {};
	const backendRunning = auditState?.locked || auditState?.status === "RUNNING";
	const displayProgress = backendRunning || auditLastRun.id ? auditProgress : progress;
	const percent =
		Number(displayProgress?.percent) ||
		(displayProgress?.total > 0
			? Math.round(
					(Number(displayProgress.current || 0) /
						Number(displayProgress.total)) *
						100,
				)
			: 0);
	return (
		<CollapsibleSection
			title="Auditoria de metas"
			description="Releia dias específicos do HubSoft e aplique cada resultado no dia correto do painel de metas."
			icon={<CheckCircle2 size={21} />}
			iconClassName="bg-emerald-50 text-emerald-700"
			status={auditState?.status || "NEVER_RUN"}
			summary={`${dates.length} dia(s) selecionado(s)`}
			lastUpdate={formatDateTime(auditLastRun.started_at)}
			defaultOpen={false}
		>
			<div className="grid gap-4 lg:grid-cols-4">
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Período
					</span>
					<select
						value={form.mode}
						onChange={(event) =>
							setForm((current) => ({ ...current, mode: event.target.value }))
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-300"
					>
						<option value="daily">Diário</option>
						<option value="weekly">Semanal</option>
						<option value="monthly">Mensal</option>
						<option value="yearly">Anual</option>
					</select>
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Data final
					</span>
					<input
						type="date"
						value={form.endDate}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								endDate: event.target.value,
							}))
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-300"
					/>
				</label>
				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700 lg:col-span-1">
					<p className="text-xs font-black uppercase text-slate-500">
						Dias que serão validados
					</p>
					<p className="mt-2 text-lg font-black text-slate-950">
						{dates.length}
					</p>
					<p className="text-xs font-semibold text-slate-500">
						{dates[0]} até {dates[dates.length - 1]}
					</p>
				</div>
				<div className="flex items-end">
					<button
						type="button"
						disabled={running || backendRunning || Boolean(profileRunning)}
						onClick={onRun}
						className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
					>
						{running || backendRunning ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<CheckCircle2 size={17} />
						)}
						{backendRunning ? "Auditoria em execução" : "Validar metas"}
					</button>
				</div>
			</div>
			{displayProgress || auditLastRun.id ? (
				<div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-black text-emerald-950">
								{displayProgress?.status ||
									displayProgress?.stage ||
									auditState?.status ||
									"Auditoria de metas"}
							</p>
							<p className="text-xs font-bold text-emerald-700">
								Dia {displayProgress?.date || "-"} ·{" "}
								{displayProgress?.current || 0} de{" "}
								{displayProgress?.total || dates.length}
							</p>
							<p className="mt-1 text-[11px] font-bold text-emerald-700">
								Último sinal:{" "}
								{formatDateTime(
									displayProgress?.heartbeatAt || auditLastRun.started_at,
								)}
							</p>
						</div>
						<span className="text-lg font-black text-emerald-950">
							{percent}%
						</span>
					</div>
					<div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
						<div
							className="h-full rounded-full bg-emerald-600 transition-all"
							style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
						/>
					</div>
				</div>
			) : null}
		</CollapsibleSection>
	);
}

function HubsoftAutomationSection({ config, updateConfig }) {
	const checkpointText = Array.isArray(config.autoDailyCheckpointHours)
		? config.autoDailyCheckpointHours.join(", ")
		: config.autoDailyCheckpointHours || "";
	return (
		<CollapsibleSection
			title="Automação e Agendamentos"
			description="Configure a frequência das leituras automáticas do HubSoft em homologação."
			icon={<Clock3 size={21} />}
			iconClassName="bg-violet-50 text-violet-700"
			status={config.autoSyncEnabled === false ? "NEVER_RUN" : "COMPLETE"}
			summary={`Mapa/Match a cada ${config.autoMapMatchIntervalMinutes || 60} min`}
			lastUpdate={formatDateTime(config.autoMapMatchLastRunAt)}
			nextUpdate={nextCheckpoint(config)}
			defaultOpen={false}
		>
			<div className="grid gap-4 lg:grid-cols-3">
				<label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-black text-slate-800">
					<input
						type="checkbox"
						checked={config.autoSyncEnabled !== false}
						onChange={(event) =>
							updateConfig("autoSyncEnabled", event.target.checked)
						}
					/>
					Rotina automática ativa
				</label>
				<label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-black text-slate-800">
					<input
						type="checkbox"
						checked={config.autoDailyEnabled !== false}
						onChange={(event) =>
							updateConfig("autoDailyEnabled", event.target.checked)
						}
					/>
					Atualizar diário
				</label>
				<label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-black text-slate-800">
					<input
						type="checkbox"
						checked={config.autoMapMatchEnabled !== false}
						onChange={(event) =>
							updateConfig("autoMapMatchEnabled", event.target.checked)
						}
					/>
					Atualizar Mapa e Match
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Diário a cada quantos minutos
					</span>
					<input
						type="number"
						min="5"
						value={config.autoDailyIntervalMinutes || 30}
						onChange={(event) =>
							updateConfig("autoDailyIntervalMinutes", event.target.value)
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Checkpoints do diário
					</span>
					<input
						value={checkpointText}
						onChange={(event) =>
							updateConfig(
								"autoDailyCheckpointHours",
								event.target.value
									.split(/[,;\s]+/)
									.map((item) => Number(item))
									.filter((item) => Number.isInteger(item)),
							)
						}
						placeholder="11, 14, 16, 18, 23"
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Metas D-1 às
					</span>
					<input
						type="time"
						value={config.autoMetaTime || "03:00"}
						onChange={(event) => updateConfig("autoMetaTime", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
				<label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-black text-slate-800">
					<input
						type="checkbox"
						checked={config.autoMetaEnabled !== false}
						onChange={(event) =>
							updateConfig("autoMetaEnabled", event.target.checked)
						}
					/>
					Atualizar metas automaticamente
				</label>
				<label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-black text-slate-800">
					<input
						type="checkbox"
						checked={config.autoFinesEnabled !== false}
						onChange={(event) =>
							updateConfig("autoFinesEnabled", event.target.checked)
						}
					/>
					Atualizar multas automaticamente
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Multas às
					</span>
					<input
						type="time"
						value={config.autoFinesTime || "18:00"}
						onChange={(event) => updateConfig("autoFinesTime", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Mapa/Match a cada quantos minutos
					</span>
					<input
						type="number"
						min="15"
						value={config.autoMapMatchIntervalMinutes || 60}
						onChange={(event) =>
							updateConfig("autoMapMatchIntervalMinutes", event.target.value)
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-600 lg:col-span-3">
					<p className="font-black uppercase text-slate-500">Últimas rotinas</p>
					<div className="mt-3 grid gap-2 md:grid-cols-5">
						<p>Diário: {formatDateTime(config.autoDailyLastRunAt)}</p>
						<p>Checkpoint: {formatDateTime(config.autoDailyLastCheckpointAt)}</p>
						<p>Metas: {formatDateTime(config.autoMetaLastRunAt)}</p>
						<p>Multas: {formatDateTime(config.autoFinesLastRunAt)}</p>
						<p>Mapa/Match: {formatDateTime(config.autoMapMatchLastRunAt)}</p>
					</div>
				</div>
			</div>
		</CollapsibleSection>
	);
}

function HubsoftWithdrawalTechniciansSection({
	technicians,
	discovering,
	onDiscover,
}) {
	const [search, setSearch] = useState("");
	const filtered = (technicians || []).filter((item) =>
		[item.nome_hubsoft, item.nome_exibicao, item.hubsoft_technician_id]
			.join(" ")
			.toLowerCase()
			.includes(search.toLowerCase()),
	);
	return (
		<CollapsibleSection
			title="Técnicos de Retirada"
			description="Cadastro usado pela classificação. A descoberta inicial busca nomes HubSoft contendo “TÉCNICO RETIRADA” e grava o ID como chave."
			icon={<Users size={21} />}
			iconClassName="bg-emerald-50 text-emerald-700"
			status={(technicians || []).length ? "COMPLETE" : "NEVER_RUN"}
			summary={`${formatNumber((technicians || []).length)} técnico(s)`}
			defaultOpen={false}
		>
			<div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Buscar técnico"
					className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 lg:max-w-sm"
				/>
				<button
					type="button"
					disabled={discovering}
					onClick={onDiscover}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
				>
					{discovering ? (
						<Loader2 className="animate-spin" size={17} />
					) : (
						<RefreshCw size={17} />
					)}
					Descobrir técnicos
				</button>
			</div>
			<div className="overflow-x-auto rounded-2xl border border-slate-200">
				<table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
					<thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
						<tr>
							<th className="px-4 py-3">ID HubSoft</th>
							<th className="px-4 py-3">Nome HubSoft</th>
							<th className="px-4 py-3">Nome exibido</th>
							<th className="px-4 py-3">Status</th>
							<th className="px-4 py-3">Atualizado</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 bg-white">
						{filtered.length ? (
							filtered.map((item) => (
								<tr key={item.id || item.hubsoft_technician_id}>
									<td className="px-4 py-3 font-black text-slate-900">
										{item.hubsoft_technician_id}
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{item.nome_hubsoft}
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{item.nome_exibicao || item.nome_hubsoft}
									</td>
									<td className="px-4 py-3">
										<span
											className={`rounded-full px-2 py-1 text-xs font-black ${
												item.ativo
													? "bg-emerald-50 text-emerald-700"
													: "bg-slate-100 text-slate-500"
											}`}
										>
											{item.ativo ? "Ativo" : "Inativo"}
										</span>
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{formatDateTime(item.updated_at)}
									</td>
								</tr>
							))
						) : (
							<tr>
								<td
									colSpan={5}
									className="px-4 py-8 text-center text-sm font-semibold text-slate-500"
								>
									Nenhum técnico encontrado.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</CollapsibleSection>
	);
}

function HubsoftWebCredentialsSection({
	config,
	updateConfig,
	onSave,
	onTest,
	saving,
	testing,
}) {
	return (
		<CollapsibleSection
			title="Conexão com HubSoft"
			description="Use aqui o login normal do HubSoft. Essas credenciais ficam salvas no banco do Retiradas homolog e serão usadas para buscar os relatórios automaticamente."
			icon={<ShieldCheck size={21} />}
			iconClassName="bg-blue-50 text-blue-700"
			status={config.webPasswordConfigured ? "COMPLETE" : "NEVER_RUN"}
			summary={config.webUsername || "Login não configurado"}
			lastUpdate={formatDateTime(config.lastValidatedAt)}
			defaultOpen
		>
			<div className="grid gap-4 lg:grid-cols-3">
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						URL do HubSoft
					</span>
					<input
						value={config.webBaseUrl || ""}
						onChange={(event) => updateConfig("webBaseUrl", event.target.value)}
						placeholder="https://sempre.hubsoft.com.br"
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Login HubSoft
					</span>
					<input
						value={config.webUsername || ""}
						onChange={(event) => updateConfig("webUsername", event.target.value)}
						placeholder="usuario@empresa.com.br"
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
				<label className="block">
					<span className="text-xs font-black uppercase text-slate-500">
						Senha HubSoft{" "}
						{config.webPasswordConfigured ? "(já configurada)" : ""}
					</span>
					<input
						type="password"
						value={config.webPassword || ""}
						onChange={(event) => updateConfig("webPassword", event.target.value)}
						placeholder={
							config.webPasswordConfigured ? "Deixe em branco para manter" : ""
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
					/>
				</label>
			</div>
			<div className="mt-5 flex flex-wrap gap-3">
				<button
					type="button"
					onClick={onSave}
					disabled={saving || testing}
					className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
				>
					{saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
					Salvar conexão
				</button>
				<button
					type="button"
					onClick={onTest}
					disabled={saving || testing}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
				>
					{testing ? (
						<Loader2 className="animate-spin" size={17} />
					) : (
						<CheckCircle2 size={17} />
					)}
					Testar conexão
				</button>
			</div>
		</CollapsibleSection>
	);
}

function RunDetailModal({ run, records, loading, page, setPage, onClose }) {
	useEffect(() => {
		if (!run) return undefined;
		const onKeyDown = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [run, onClose]);

	if (!run) return null;
	const summary = run.result_summary || {};
	const ranking = summary.ranking || {};
	const rows = Array.isArray(records) ? records : [];
	const pageSize = 10;
	const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
	const safePage = Math.min(Math.max(page, 1), totalPages);
	const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-4">
			<div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
				<div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
							Execução HubSoft
						</p>
						<h2 className="mt-1 text-2xl font-black text-slate-950">
							{run.profile || "Rotina"} · {formatDateTime(run.started_at)}
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Snapshot salvo na execução. Não depende do estado atual do sistema.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-2xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
					>
						<X size={20} />
					</button>
				</div>
				<div className="max-h-[calc(90vh-98px)] overflow-y-auto p-5">
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
						<OverviewCard
							label="Status"
							value={run.status || "-"}
							helper={`Finalizado em ${formatDateTime(run.finished_at)}`}
							icon={<CheckCircle2 size={20} />}
							tone={getStatusKind(run.status) === "error" ? "red" : "emerald"}
						/>
						<OverviewCard
							label="Total"
							value={formatNumber(run.expected_total)}
							helper="Linhas esperadas"
							icon={<DatabaseZap size={20} />}
						/>
						<OverviewCard
							label="Únicos"
							value={formatNumber(run.unique_rows)}
							helper="Registros deduplicados"
							icon={<ShieldCheck size={20} />}
							tone="emerald"
						/>
						<OverviewCard
							label="Não classificados"
							value={formatNumber(run.unclassified)}
							helper="Itens sem regra final"
							icon={<AlertTriangle size={20} />}
							tone={Number(run.unclassified || 0) ? "orange" : "emerald"}
						/>
						<OverviewCard
							label="Duração"
							value={
								run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : "-"
							}
							helper="Tempo de processamento"
							icon={<Clock3 size={20} />}
							tone="slate"
						/>
					</div>
					{run.error_message ? (
						<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-800">
							{run.error_message}
						</div>
					) : null}
					<div className="mt-5 grid gap-4 lg:grid-cols-3">
						{["cidades", "canais", "responsaveis"].map((key) => {
							const items = ranking[key] || [];
							return (
								<div key={key} className="rounded-2xl border border-slate-200 p-4">
									<p className="text-xs font-black uppercase text-slate-500">
										Ranking {key}
									</p>
									<div className="mt-3 space-y-2">
										{items.slice(0, 10).map((item) => (
											<div
												key={`${key}-${item.label}`}
												className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700"
											>
												<span className="truncate">{item.label || "-"}</span>
												<span>{formatNumber(item.total)}</span>
											</div>
										))}
										{!items.length ? (
											<p className="rounded-xl bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
												Sem dados gravados nesta execução.
											</p>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
					<div className="mt-5 rounded-2xl border border-slate-200">
						<div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-sm font-black text-slate-950">
									Amostra de registros
								</p>
								<p className="text-xs font-semibold text-slate-500">
									Mostrando até 50 registros, paginados de 10 em 10.
								</p>
							</div>
							<div className="flex items-center gap-2 text-xs font-black text-slate-600">
								<button
									type="button"
									disabled={safePage <= 1}
									onClick={() => setPage((current) => Math.max(current - 1, 1))}
									className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50"
								>
									Anterior
								</button>
								<span>
									{safePage}/{totalPages}
								</span>
								<button
									type="button"
									disabled={safePage >= totalPages}
									onClick={() =>
										setPage((current) => Math.min(current + 1, totalPages))
									}
									className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50"
								>
									Próxima
								</button>
							</div>
						</div>
						{loading ? (
							<div className="flex items-center justify-center gap-2 p-8 text-sm font-black text-slate-600">
								<Loader2 className="animate-spin" size={18} />
								Carregando registros
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-[900px] w-full divide-y divide-slate-200 text-sm">
									<thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
										<tr>
											<th className="px-4 py-3">O.S.</th>
											<th className="px-4 py-3">Cliente</th>
											<th className="px-4 py-3">Cidade</th>
											<th className="px-4 py-3">Canal</th>
											<th className="px-4 py-3">Data origem</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{visibleRows.map((item) => (
											<tr key={item.id || item.hubsoft_number}>
												<td className="px-4 py-3 font-black text-blue-700">
													{item.hubsoft_number || "-"}
												</td>
												<td className="px-4 py-3 font-semibold text-slate-700">
													{item.customer_name || "-"}
												</td>
												<td className="px-4 py-3 font-semibold text-slate-700">
													{item.city || "-"}
												</td>
												<td className="px-4 py-3 font-semibold text-slate-700">
													{item.production_channel || "-"}
												</td>
												<td className="px-4 py-3 font-semibold text-slate-700">
													{formatDateTime(item.source_date)}
												</td>
											</tr>
										))}
										{!visibleRows.length ? (
											<tr>
												<td
													colSpan={5}
													className="px-4 py-8 text-center text-sm font-semibold text-slate-500"
												>
													Nenhum registro salvo para esta execução.
												</td>
											</tr>
										) : null}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export default function HubsoftSettingsPage() {
	const {
		config,
		loading,
		saving,
		testing,
		associating,
		searching,
		syncing,
		feedback,
		error,
		testResult,
		syncJob,
		syncRuns,
		profiles,
		profileRuns,
		profileRunning,
		metaAuditForm,
		setMetaAuditForm,
		metaAuditRunning,
		metaAuditProgress,
		technicians,
		discoveringTechnicians,
		query,
		setQuery,
		queryResult,
		loadConfig,
		updateConfig,
		handleSave,
		handleTest,
		handleAssociate,
		handleSearch,
		handleRunProfile,
		handleRunMetaAudit,
		handleDiscoverTechnicians,
		toggleArrayValue,
		handleSync,
	} = useHubsoftSettingsController();
	const [selectedRun, setSelectedRun] = useState(null);
	const [selectedRunRecords, setSelectedRunRecords] = useState([]);
	const [selectedRunLoading, setSelectedRunLoading] = useState(false);
	const [selectedRunPage, setSelectedRunPage] = useState(1);

	const openRunDetails = async (run) => {
		if (!run?.id) return;
		setSelectedRun(run);
		setSelectedRunRecords([]);
		setSelectedRunPage(1);
		setSelectedRunLoading(true);
		try {
			const result = await buscarRegistrosHubsoft({ runId: run.id, limit: 50 });
			setSelectedRunRecords(
				Array.isArray(result) ? result : result?.items || result?.rows || [],
			);
		} catch {
			setSelectedRunRecords([]);
		} finally {
			setSelectedRunLoading(false);
		}
	};

	if (loading) return <Spinner fullScreen={false} />;

	return (
		<div className="space-y-5">
			<HubsoftHeader
				onRefresh={loadConfig}
				onSave={handleSave}
				saving={saving}
				testing={testing}
				associating={associating}
				config={config}
				profiles={profiles}
			/>
			<HubsoftFeedback feedback={feedback} error={error} />
			<HubsoftStatusCards config={config} profiles={profiles} />
			<HubsoftWebCredentialsSection
				config={config}
				updateConfig={updateConfig}
				onSave={handleSave}
				onTest={handleTest}
				saving={saving}
				testing={testing}
			/>
			<HubsoftAutomationSection config={config} updateConfig={updateConfig} />
			<HubsoftProfilesSection
				profiles={profiles}
				profileRuns={profileRuns}
				profileRunning={profileRunning}
				onRunProfile={handleRunProfile}
				onOpenRun={openRunDetails}
				config={config}
			/>
			<HubsoftMetaAuditSection
				form={metaAuditForm}
				setForm={setMetaAuditForm}
				running={metaAuditRunning}
				progress={metaAuditProgress}
				auditState={resolveMetaAuditState(profiles)}
				onRun={handleRunMetaAudit}
				profileRunning={profileRunning}
			/>
			<HubsoftWithdrawalTechniciansSection
				technicians={technicians}
				discovering={discoveringTechnicians}
				onDiscover={handleDiscoverTechnicians}
			/>

			<CollapsibleSection
				title="Credenciais OAuth"
				description="Opcional. Use somente se o HubSoft liberar client_id/client_secret para autenticação oficial por API."
				icon={<ShieldCheck size={21} />}
				iconClassName="bg-blue-50 text-blue-700"
				defaultOpen={false}
			>
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Base URL
						</span>
						<input
							value={config.baseUrl || ""}
							onChange={(event) => updateConfig("baseUrl", event.target.value)}
							placeholder="https://seu-hubsoft.com.br"
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Grant type
						</span>
						<input
							value={config.grantType || "password"}
							onChange={(event) =>
								updateConfig("grantType", event.target.value)
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Client ID
						</span>
						<input
							value={config.clientId || ""}
							onChange={(event) => updateConfig("clientId", event.target.value)}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Client Secret{" "}
							{config.clientSecretConfigured ? "(já configurado)" : ""}
						</span>
						<input
							type="password"
							value={config.clientSecret || ""}
							onChange={(event) =>
								updateConfig("clientSecret", event.target.value)
							}
							placeholder={
								config.clientSecretConfigured
									? "Deixe em branco para manter"
									: ""
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Usuário API
						</span>
						<input
							value={config.username || ""}
							onChange={(event) => updateConfig("username", event.target.value)}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Senha API {config.passwordConfigured ? "(já configurada)" : ""}
						</span>
						<input
							type="password"
							value={config.password || ""}
							onChange={(event) => updateConfig("password", event.target.value)}
							placeholder={
								config.passwordConfigured ? "Deixe em branco para manter" : ""
							}
							className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
						/>
					</label>
				</div>

				<div className="mt-5 flex flex-wrap gap-3">
					<label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
						<input
							type="checkbox"
							checked={config.enabled === true}
							onChange={(event) =>
								updateConfig("enabled", event.target.checked)
							}
							className="h-4 w-4"
						/>
						Integração habilitada
					</label>
					<button
						type="button"
						onClick={handleTest}
						disabled={saving || testing || associating}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
					>
						{testing ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<CheckCircle2 size={17} />
						)}{" "}
						Validar endpoint
					</button>
					<button
						type="button"
						onClick={handleAssociate}
						disabled={saving || testing || associating}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60"
					>
						{associating ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<DatabaseZap size={17} />
						)}{" "}
						Associar Hubsoft
					</button>
				</div>

				{testResult ? (
					<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
						Token válido. Atualizado em{" "}
						{formatDateTime(testResult.tokenUpdatedAt)} e expira em{" "}
						{formatDateTime(testResult.tokenExpiresAt)}.
					</div>
				) : null}
			</CollapsibleSection>

			<CollapsibleSection
				title="Consulta teste de O.S."
				description="Uso auxiliar para consultar uma O.S. específica antes de substituir planilhas."
				icon={<Search size={21} />}
				iconClassName="bg-slate-100 text-slate-700"
				defaultOpen={false}
			>
				<div className="grid gap-3 lg:grid-cols-[220px_1fr_160px_140px]">
					<select
						value={query.busca}
						onChange={(event) =>
							setQuery((current) => ({ ...current, busca: event.target.value }))
						}
						className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-300"
					>
						{SEARCH_TYPES.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
					<input
						value={query.termo_busca}
						onChange={(event) =>
							setQuery((current) => ({
								...current,
								termo_busca: event.target.value,
							}))
						}
						placeholder="Digite código, CPF/CNPJ, ID serviço ou número da O.S."
						className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-300"
					/>
					<select
						value={query.status}
						onChange={(event) =>
							setQuery((current) => ({
								...current,
								status: event.target.value,
							}))
						}
						className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-300"
					>
						<option value="">Todos</option>
						<option value="pendente">Pendente</option>
						<option value="aguardando_agendamento">
							Aguardando agendamento
						</option>
						<option value="finalizado">Finalizado</option>
					</select>
					<button
						type="button"
						disabled={searching}
						onClick={handleSearch}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
					>
						{searching ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Search size={17} />
						)}{" "}
						Consultar
					</button>
				</div>
				{queryResult ? (
					<pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-slate-100">
						{safePreview(queryResult)}
					</pre>
				) : null}
			</CollapsibleSection>

			<HubsoftSyncSection
				syncing={syncing}
				handleSync={handleSync}
				config={config}
				updateConfig={updateConfig}
				toggleArrayValue={toggleArrayValue}
				syncJob={syncJob}
				syncRuns={syncRuns}
			/>
			<RunDetailModal
				run={selectedRun}
				records={selectedRunRecords}
				loading={selectedRunLoading}
				page={selectedRunPage}
				setPage={setSelectedRunPage}
				onClose={() => setSelectedRun(null)}
			/>
		</div>
	);
}
