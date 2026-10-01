import {
	Activity,
	Building2,
	CalendarDays,
	CheckCircle2,
	Clock3,
	Download,
	Eye,
	ListChecks,
	MapPin,
	RefreshCw,
	Rocket,
	UserRound,
	Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ModalShell from "../../../components/ui/ModalShell";
import Spinner from "../../../components/ui/Spinner";
import { useRotAuth } from "../../../state/useRotAuth";
import {
	ativacoesExportUrl,
	ativacoesQualidadeExportUrl,
	ativacoesSaudeExportUrl,
	fetchAtivacaoDetail,
	fetchAtivacoesDashboard,
	fetchAtivacoesFilters,
	fetchAtivacoesKanban,
	fetchAtivacoesQualidade,
	fetchAtivacoesQualidadeDetail,
	fetchAtivacoesQualidadeFilters,
	fetchAtivacoesQualidadeResumo,
	fetchAtivacoesSaude,
	fetchAtivacoesSaudeDetail,
	fetchAtivacoesSaudeFilters,
	fetchAtivacoesSaudeResumo,
	startAtivacoesSync,
} from "../services/ativacoesService";

const PERIODS = [
	{ id: "today", label: "Hoje" },
	{ id: "yesterday", label: "Ontem" },
	{ id: "last7", label: "Últimos 7 dias" },
	{ id: "month", label: "Este mês" },
	{ id: "previousMonth", label: "Mês anterior" },
	{ id: "custom", label: "Personalizado" },
];

const SUMMARY_CARDS = [
	["createdToday", "OS criadas hoje", CalendarDays],
	["completedToday", "OS concluídas hoje", CheckCircle2],
	["pending", "Pendentes", Clock3],
	["inProgress", "Em atendimento", Activity],
];

const SECONDARY_CARDS = [
	["awaitingSchedule", "Aguard. agendamento", CalendarDays],
	["awaitingApproval", "Aguard. aprovação", Eye],
	["pendingValidation", "Pend. validação", ListChecks],
	["technicians", "Técnicos envolvidos", UserRound],
	["companies", "Empresas envolvidas", Building2],
	["cities", "Cidades atendidas", MapPin],
];

const HEALTH_STATUS = {
	SAUDAVEL: { label: "Saudável", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
	ATENCAO: { label: "Atenção", className: "border-amber-200 bg-amber-50 text-amber-700" },
	CRITICO: { label: "Crítico", className: "border-red-200 bg-red-50 text-red-700" },
	SEM_DADOS: { label: "Sem dados", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const HEALTH_REASONS = {
	NO_CONNECTION: "Sem PPPoE",
	NO_TRAFFIC: "Sem tráfego",
	LOW_TRAFFIC: "Baixo tráfego",
	RECENT_SUPPORT: "Suporte recente",
	REPEATED_SUPPORT: "Reincidência",
	STALE_CONNECTION_DATA: "Dado desatualizado",
	SERVICE_INACTIVE: "Serviço inativo",
	TECHNICIAN_UNMATCHED: "Técnico sem vínculo",
	INSUFFICIENT_DATA: "Dados insuficientes",
	LIMITED_MONITORING: "Monitoramento parcial",
};

const QUALITY_DIMENSIONS = [
	{ id: "tecnicos", label: "Técnicos", api: "technician" },
	{ id: "empresas", label: "Empresas", api: "company" },
	{ id: "cidades", label: "Cidades", api: "city" },
	{ id: "tipos", label: "Tipos de OS", api: "type" },
];

function todayIso() {
	return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
	if (!value) return "-";
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatShortDate(value) {
	if (!value) return "-";
	return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function durationLabel(seconds) {
	if (!seconds && seconds !== 0) return "-";
	const h = Math.floor(Number(seconds) / 3600);
	const m = Math.floor((Number(seconds) % 3600) / 60);
	return h ? `${h}h ${m}m` : `${m}m`;
}

function percent(value) {
	return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function ratio(count, denominator, rate) {
	return `${Number(count || 0).toLocaleString("pt-BR")} / ${Number(denominator || 0).toLocaleString("pt-BR")}${rate === null || rate === undefined ? "" : ` (${percent(rate)})`}`;
}

function reasonLabel(reason) {
	return HEALTH_REASONS[reason] || reason;
}

function filterPayload(filters) {
	const payload = { ...filters };
	delete payload.healthEvent;
	if (filters.period !== "custom") {
		delete payload.from;
		delete payload.to;
	}
	return payload;
}

function pageFromPath(pathname) {
	if (pathname.endsWith("/kanban")) return "kanban";
	if (pathname.endsWith("/saude")) return "saude";
	if (pathname.endsWith("/qualidade")) return "qualidade";
	return "dashboard";
}

const PAGE_COPY = {
	dashboard: { breadcrumb: "Operação / Ativações", title: "Visão Geral", description: "Acompanhe volume, andamento e desempenho das ativações." },
	kanban: { breadcrumb: "Operação / Ativações / Kanban", title: "Kanban", description: "Acompanhe o fluxo das instalações por etapa operacional." },
	saude: { breadcrumb: "Operação / Ativações / Saúde", title: "Saúde", description: "Priorize ativações recentes com sinais de atenção ou risco." },
	qualidade: { breadcrumb: "Operação / Ativações / Qualidade", title: "Qualidade", description: "Compare métricas objetivas por técnico, empresa, cidade e tipo de OS." },
};

export default function AtivacoesPage() {
	const { hasPermission } = useRotAuth();
	const location = useLocation();
	const canSync = hasPermission("ativacoes.sincronizar");
	const canExport = hasPermission("ativacoes.exportar");
	const canExportHealth = hasPermission("ativacoes.saude.exportar");
	const canExportQuality = hasPermission("ativacoes.qualidade.exportar");
	const tab = pageFromPath(location.pathname);
	const pageCopy = PAGE_COPY[tab] || PAGE_COPY.dashboard;
	const [filters, setFilters] = useState({ period: "last7", from: todayIso(), to: todayIso(), orderTypeId: "", status: "", technicianId: "", companyId: "", regionalId: "", cityId: "", brand: "", technicianIdentified: "", healthStatus: "", window: "", healthEvent: "", withRecall: "", repeatedSupport: "", noConnection: "", noTraffic: "", staleData: "", quality: "" });
	const [qualityDimension, setQualityDimension] = useState("tecnicos");
	const [filterOptions, setFilterOptions] = useState(null);
	const [dashboard, setDashboard] = useState(null);
	const [kanban, setKanban] = useState(null);
	const [health, setHealth] = useState(null);
	const [healthSummary, setHealthSummary] = useState(null);
	const [quality, setQuality] = useState(null);
	const [qualitySummary, setQualitySummary] = useState(null);
	const [detail, setDetail] = useState(null);
	const [healthDetail, setHealthDetail] = useState(null);
	const [qualityDetail, setQualityDetail] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [syncJob, setSyncJob] = useState(null);

	const effectiveFilters = useMemo(() => filterPayload(filters), [filters]);

	async function load() {
		setLoading(true);
		setError("");
		try {
			const requests = [
				filterOptions ? Promise.resolve({ filters: filterOptions }) : fetchAtivacoesFilters(),
				tab === "kanban" ? fetchAtivacoesKanban({ ...effectiveFilters, limit: 500 }) : fetchAtivacoesDashboard(effectiveFilters),
			];
			const [filtersData, mainData] = await Promise.all(requests);
			setFilterOptions(filtersData.filters);
			if (tab === "kanban") setKanban(mainData);
			else setDashboard(mainData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar ativações.");
		} finally {
			setLoading(false);
		}
	}

	async function loadHealth() {
		setLoading(true);
		setError("");
		try {
			const [filtersData, summaryData, listData] = await Promise.all([
				filterOptions ? Promise.resolve({ filters: filterOptions }) : fetchAtivacoesSaudeFilters(),
				fetchAtivacoesSaudeResumo(effectiveFilters),
				fetchAtivacoesSaude({ ...effectiveFilters, limit: 50 }),
			]);
			setFilterOptions(filtersData.filters);
			setHealthSummary(summaryData);
			setHealth(listData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar saúde pós-ativação.");
		} finally {
			setLoading(false);
		}
	}

	async function loadQuality() {
		setLoading(true);
		setError("");
		try {
			const [filtersData, summaryData, listData] = await Promise.all([
				filterOptions ? Promise.resolve({ filters: filterOptions }) : fetchAtivacoesQualidadeFilters(),
				fetchAtivacoesQualidadeResumo(effectiveFilters),
				fetchAtivacoesQualidade(qualityDimension, { ...effectiveFilters, limit: 50 }),
			]);
			setFilterOptions(filtersData.filters);
			setQualitySummary(summaryData);
			setQuality(listData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar qualidade da instalação.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		if (tab === "saude") loadHealth();
		else if (tab === "qualidade") loadQuality();
		else load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [JSON.stringify(effectiveFilters), tab, qualityDimension]);

	async function openDetail(id) {
		setDetail({ loading: true });
		try {
			const data = await fetchAtivacaoDetail(id);
			setDetail({ loading: false, item: data.item });
		} catch (err) {
			setDetail({ loading: false, error: err?.message || "Não foi possível abrir a O.S." });
		}
	}

	async function openHealthDetail(id) {
		setHealthDetail({ loading: true });
		try {
			const data = await fetchAtivacoesSaudeDetail(id);
			setHealthDetail({ loading: false, item: data.item });
		} catch (err) {
			setHealthDetail({ loading: false, error: err?.message || "Não foi possível abrir a saúde da ativação." });
		}
	}

	async function openQualityDetail(group) {
		setQualityDetail({ loading: true, group });
		try {
			const dimension = QUALITY_DIMENSIONS.find((item) => item.id === qualityDimension)?.api || "technician";
			const data = await fetchAtivacoesQualidadeDetail({ ...effectiveFilters, dimension, id: group.id });
			setQualityDetail({ loading: false, item: data });
		} catch (err) {
			setQualityDetail({ loading: false, error: err?.message || "Não foi possível abrir o detalhamento." });
		}
	}

	async function triggerSync() {
		setSyncJob({ status: "starting" });
		try {
			const data = await startAtivacoesSync({ ...effectiveFilters, triggerType: "manual-ui" });
			setSyncJob(data.job);
		} catch (err) {
			setSyncJob({ status: "failed", error: err?.message || "Não foi possível iniciar a sincronização." });
		}
	}

	const latestSync = dashboard?.latestSync || kanban?.latestSync;
	const currentData = tab === "kanban" ? kanban : tab === "saude" ? health : tab === "qualidade" ? quality : dashboard;

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div className="flex min-w-0 items-start gap-4">
						<span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<Rocket size={26} />
						</span>
						<div className="min-w-0">
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">{pageCopy.breadcrumb}</p>
							<h1 className="mt-1 text-3xl font-black text-slate-950">{pageCopy.title}</h1>
							<p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
								{pageCopy.description}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						{canExport && (tab === "dashboard" || tab === "kanban") ? (
							<a href={ativacoesExportUrl(effectiveFilters)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
								<Download size={17} /> Exportar CSV
							</a>
						) : null}
						{tab === "saude" && canExportHealth ? (
							<a href={ativacoesSaudeExportUrl(effectiveFilters)} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 shadow-sm transition hover:bg-emerald-100">
								<Download size={17} /> Exportar Saúde
							</a>
						) : null}
						{tab === "qualidade" && canExportQuality ? (
							<a href={ativacoesQualidadeExportUrl(QUALITY_DIMENSIONS.find((item) => item.id === qualityDimension)?.api || "technician", effectiveFilters)} className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-100">
								<Download size={17} /> Exportar Qualidade
							</a>
						) : null}
						{canSync ? (
							<button type="button" onClick={triggerSync} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">
								<RefreshCw size={17} /> Atualizar agora
							</button>
						) : null}
					</div>
				</div>
				<div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 xl:grid-cols-[1fr_auto]">
					<Filters filters={filters} setFilters={setFilters} options={filterOptions} tab={tab} />
					<SyncStatusBadge latestSync={latestSync} syncJob={syncJob} />
				</div>
			</section>

			{error ? <ErrorState message={error} onRetry={tab === "saude" ? loadHealth : tab === "qualidade" ? loadQuality : load} /> : null}
			{loading && !currentData ? <Spinner fullScreen /> : null}

			{tab === "dashboard" ? <DashboardView data={dashboard} /> : null}
			{tab === "kanban" ? <KanbanView data={kanban} onOpen={openDetail} /> : null}
			{tab === "saude" ? <HealthView data={health} summary={healthSummary} onOpen={openHealthDetail} /> : null}
			{tab === "qualidade" ? <QualityView data={quality} summary={qualitySummary} dimension={qualityDimension} setDimension={setQualityDimension} onOpen={openQualityDetail} /> : null}

			{detail ? <ActivationDetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
			{healthDetail ? <HealthDetailModal detail={healthDetail} onClose={() => setHealthDetail(null)} /> : null}
			{qualityDetail ? <QualityDetailModal detail={qualityDetail} onClose={() => setQualityDetail(null)} /> : null}
		</div>
	);
}

function Filters({ filters, setFilters, options, tab }) {
	const setField = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
	const clearField = (key) => setField(key, "");
	const reset = () => setFilters((current) => ({ ...current, period: "last7", from: todayIso(), to: todayIso(), orderTypeId: "", status: "", technicianId: "", companyId: "", regionalId: "", cityId: "", brand: "", technicianIdentified: "", healthStatus: "", window: "", healthEvent: "", withRecall: "", repeatedSupport: "", noConnection: "", noTraffic: "", staleData: "", quality: "" }));
	const optionLabel = (items = [], id) => items.find((item) => String(item.id) === String(id))?.label || id;
	const chips = [
		filters.period && { key: "period", label: optionLabel(PERIODS, filters.period) },
		filters.orderTypeId && { key: "orderTypeId", label: optionLabel((options?.orderTypes || []).map((item) => ({ id: item.id, label: item.name })), filters.orderTypeId) },
		filters.cityId && { key: "cityId", label: optionLabel((options?.cities || []).map((item) => ({ id: item.id, label: item.name })), filters.cityId) },
		filters.technicianId && { key: "technicianId", label: optionLabel((options?.technicians || []).map((item) => ({ id: item.id, label: item.name })), filters.technicianId) },
		filters.companyId && { key: "companyId", label: optionLabel((options?.companies || []).map((item) => ({ id: item.id, label: item.name })), filters.companyId) },
		filters.healthStatus && { key: "healthStatus", label: filters.healthStatus },
		filters.window && { key: "window", label: filters.window },
		filters.quality && { key: "quality", label: optionLabel(options?.quality || [], filters.quality) },
	].filter(Boolean);
	return (
		<div className="space-y-3">
			<div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
				<Select label="Período" value={filters.period} onChange={(v) => setField("period", v)} options={PERIODS} />
				<Select label="Tipo OS" value={filters.orderTypeId} onChange={(v) => setField("orderTypeId", v)} options={(options?.orderTypes || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
				<Select label="Cidade" value={filters.cityId} onChange={(v) => setField("cityId", v)} options={(options?.cities || []).filter((item) => !filters.regionalId || item.regionalId === filters.regionalId).map((item) => ({ id: item.id, label: item.name }))} allowAll />
				<Select label="Técnico" value={filters.technicianId} onChange={(v) => setField("technicianId", v)} options={(options?.technicians || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
				{tab === "saude" ? <Select label="Saúde" value={filters.healthStatus} onChange={(v) => setField("healthStatus", v)} options={[{ id: "CRITICO", label: "Crítico" }, { id: "ATENCAO", label: "Atenção" }, { id: "SEM_DADOS", label: "Sem dados" }, { id: "SAUDAVEL", label: "Saudável" }]} allowAll /> : <Select label="Empresa" value={filters.companyId} onChange={(v) => setField("companyId", v)} options={(options?.companies || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />}
			</div>
			<details className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
				<summary className="cursor-pointer text-sm font-black text-slate-700">Mais filtros</summary>
				<div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
					{filters.period === "custom" ? <><Field label="De" type="date" value={filters.from} onChange={(v) => setField("from", v)} /><Field label="Até" type="date" value={filters.to} onChange={(v) => setField("to", v)} /></> : null}
					{tab !== "kanban" ? <Select label="Status" value={filters.status} onChange={(v) => setField("status", v)} options={[{ id: "pendente", label: "Pendente" }, { id: "aguardando_agendamento", label: "Aguard. agendamento" }, { id: "aguardando_aprovacao", label: "Aguard. aprovação" }, { id: "finalizado", label: "Finalizado" }]} allowAll /> : null}
					<Select label="Empresa" value={filters.companyId} onChange={(v) => setField("companyId", v)} options={(options?.companies || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
					<Select label="Regional" value={filters.regionalId} onChange={(v) => setField("regionalId", v)} options={(options?.regionals || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
					<Select label="Marca" value={filters.brand} onChange={(v) => setField("brand", v)} options={(options?.brands || []).map((item) => ({ id: item, label: item }))} allowAll />
					<Select label="Técnico identificado" value={filters.technicianIdentified} onChange={(v) => setField("technicianIdentified", v)} options={[{ id: "yes", label: "Com técnico" }, { id: "no", label: "Sem técnico" }]} allowAll />
					{tab === "saude" ? <><Select label="Janela" value={filters.window} onChange={(v) => setField("window", v)} options={[{ id: "D+1", label: "D+1" }, { id: "D+7", label: "D+7" }, { id: "D+15", label: "D+15" }, { id: "D+30", label: "D+30" }]} allowAll /><Select label="Eventos" value={filters.healthEvent} onChange={(v) => setFilters((current) => ({ ...current, healthEvent: v, withRecall: v === "withRecall" ? "yes" : "", repeatedSupport: v === "repeatedSupport" ? "yes" : "", noConnection: v === "noConnection" ? "yes" : "", noTraffic: v === "noTraffic" ? "yes" : "", staleData: v === "staleData" ? "yes" : "" }))} options={[{ id: "withRecall", label: "Com rechamado" }, { id: "repeatedSupport", label: "Com reincidência" }, { id: "noConnection", label: "Sem conexão" }, { id: "noTraffic", label: "Sem tráfego" }, { id: "staleData", label: "Dado desatualizado" }]} allowAll /></> : null}
					{tab === "qualidade" ? <Select label="Qualidade" value={filters.quality} onChange={(v) => setField("quality", v)} options={(options?.quality || []).map((item) => ({ id: item.id, label: item.label }))} allowAll /> : null}
				</div>
			</details>
			<div className="flex flex-wrap items-center gap-2">
				{chips.map((chip) => <button type="button" key={chip.key} onClick={() => clearField(chip.key)} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{chip.label} ×</button>)}
				{chips.length ? <button type="button" onClick={reset} className="text-xs font-black text-slate-500 hover:text-slate-900">Limpar filtros</button> : null}
			</div>
		</div>
	);
}

function Field({ label, type = "text", value, onChange }) {
	return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500" /></label>;
}

function Select({ label, value, onChange, options, allowAll = false }) {
	return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<select value={value || ""} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500">{allowAll ? <option value="">Todos</option> : null}{(options || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
}

function SyncStatusBadge({ latestSync, syncJob }) {
	const rawStatus = syncJob?.status || latestSync?.status || "idle";
	const status = String(rawStatus).toLowerCase();
	const latestDate = latestSync?.finishedAt || latestSync?.finished_at || latestSync?.startedAt || latestSync?.started_at || latestSync?.created_at;
	const label = status === "running" || status === "starting" ? "Sincronizando" : status === "failed" ? "Falha na sincronização" : latestDate ? "Última sincronização" : "Sem execução recente";
	const detail = syncJob?.error || latestSync?.error_message || latestSync?.error || (latestDate ? formatDateTime(latestDate) : "Dados atualizados conforme filtros.");
	const className = status === "failed"
		? "border-red-200 bg-red-50 text-red-700"
		: status === "running" || status === "starting"
			? "border-blue-200 bg-blue-50 text-blue-700"
			: "border-emerald-200 bg-emerald-50 text-emerald-700";
	return (
		<div className={`flex min-w-[260px] items-center gap-3 rounded-2xl border px-3 py-2 ${className}`}>
			<RefreshCw size={18} className={status === "running" || status === "starting" ? "animate-spin" : ""} />
			<div className="min-w-0">
				<p className="text-xs font-black uppercase">{label}</p>
				<p className="truncate text-xs font-bold opacity-80">{detail}</p>
			</div>
		</div>
	);
}

function ErrorState({ message, onRetry }) {
	return (
		<div className="rounded-3xl border border-red-200 bg-red-50 p-4 shadow-sm">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-sm font-black text-red-800">Não foi possível carregar esta visão.</p>
					<p className="mt-1 text-sm font-semibold text-red-700">{message}</p>
				</div>
				<button type="button" onClick={onRetry} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-700">
					<RefreshCw size={16} /> Tentar novamente
				</button>
			</div>
		</div>
	);
}

function DashboardView({ data }) {
	const summary = data?.summary || {};
	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{SUMMARY_CARDS.map(([key, label, Icon]) => (
					<div key={key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="mb-3 flex items-start justify-between gap-3">
							<p className="text-xs font-black uppercase text-slate-500">{label}</p>
							<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={18} /></span>
						</div>
						<p className="text-3xl font-black text-slate-950">{summary[key] ?? 0}</p>
					</div>
				))}
			</div>
			<div className="grid gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-3 xl:grid-cols-6">
				{SECONDARY_CARDS.map(([key, label, Icon]) => (
					<div key={key} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
						<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><Icon size={16} /></span>
						<div className="min-w-0">
							<p className="truncate text-[11px] font-black uppercase text-slate-500">{label}</p>
							<p className="text-xl font-black text-slate-950">{summary[key] ?? 0}</p>
						</div>
					</div>
				))}
			</div>
			<div className="grid gap-4 xl:grid-cols-3">
				<ChartCard title="Distribuição por tipo" items={data?.distributions?.byType || []} />
				<ChartCard title="Distribuição por status" items={data?.distributions?.byStatus || []} />
				<ChartCard title="Principais cidades" items={data?.distributions?.topCities || []} />
				<ChartCard title="Principais empresas" items={data?.distributions?.topCompanies || []} />
				<ChartCard title="Principais técnicos" items={data?.distributions?.topTechnicians || []} />
				<ChartCard title="Evolução diária" items={(data?.distributions?.dailyEvolution || []).map((item) => ({ ...item, label: formatShortDate(item.label) }))} />
			</div>
		</div>
	);
}

function ChartCard({ title, items }) {
	const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 className="text-base font-black text-slate-950">{title}</h2>
			<div className="mt-4 space-y-3">
				{items.length ? items.slice(0, 8).map((item) => (
					<div key={item.label}>
						<div className="mb-1 flex items-center justify-between gap-3 text-sm font-bold">
							<span className="truncate text-slate-700">{item.label}</span>
							<span className="text-slate-950">{item.value}</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(6, (Number(item.value) / max) * 100)}%` }} /></div>
					</div>
				)) : <p className="text-sm font-semibold text-slate-400">Sem dados para o filtro.</p>}
			</div>
		</section>
	);
}

function KanbanView({ data, onOpen }) {
	return (
		<div className="overflow-x-auto pb-3">
			<div className="grid min-w-[1180px] grid-cols-5 gap-3">
				{(data?.columns || []).map((column) => (
					<section key={column.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
						<div className="mb-3 flex items-start justify-between gap-2">
							<div>
								<h2 className="text-sm font-black text-slate-950">{column.label}</h2>
								<p className="text-xs font-semibold text-slate-400">{column.items.length} O.S</p>
							</div>
						</div>
						<div className="space-y-2">
							{column.items.map((item) => <ActivationCard key={item.id} item={item} onOpen={() => onOpen(item.id)} />)}
							{!column.items.length ? <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-400">Sem itens</p> : null}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}

function ActivationCard({ item, onOpen }) {
	return (
		<button type="button" onClick={onOpen} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate text-sm font-black text-blue-700">{item.orderNumber || item.hubsoftOrderId}</p>
					<p className="mt-1 line-clamp-2 text-xs font-bold text-slate-700">{item.orderTypeName}</p>
				</div>
				<span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">{item.service.brand}</span>
			</div>
			<div className="mt-3 space-y-1 text-xs font-semibold text-slate-500">
				<p className="truncate"><MapPin size={12} className="mr-1 inline" />{item.city.name || "Cidade não informada"}</p>
				<p className="truncate"><UserRound size={12} className="mr-1 inline" />{item.technician.name}</p>
				<p className="truncate"><Building2 size={12} className="mr-1 inline" />{item.company.name || "Empresa não identificada"}</p>
				<p><Clock3 size={12} className="mr-1 inline" />{formatDateTime(item.scheduledStartAt)}</p>
				<p><Wifi size={12} className="mr-1 inline" />{item.connection.connected === true ? "Conectado" : item.connection.connected === false ? "Sem conexão" : "Sem captura"}</p>
			</div>
		</button>
	);
}

function HealthBadge({ status }) {
	const config = HEALTH_STATUS[status] || HEALTH_STATUS.SEM_DADOS;
	return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${config.className}`}>{config.label}</span>;
}

function QualityView({ data, summary, dimension, setDimension, onOpen }) {
	const metrics = summary?.metrics || {};
	const supportSource = summary?.supportSource;
	const cards = [
		["Ativações analisadas", metrics.production?.completed ?? 0, `${metrics.production?.analyzable ?? 0} analisáveis`],
		["Técnicos analisados", data?.items?.filter((item) => item.dimension === "technician").length || "-", "por filtro aplicado"],
		["Empresas analisadas", summary ? "-" : "-", "use a visão Empresas"],
		["Dentro da janela", metrics.schedule?.ON_TIME ?? 0, percent(metrics.schedule?.onTimeRate)],
		["Rechamado D+7", metrics.rework?.d7?.count ?? 0, ratio(metrics.rework?.d7?.count, metrics.rework?.d7?.denominator, metrics.rework?.d7?.rate)],
		["Rechamado D+30", metrics.rework?.d30?.count ?? 0, ratio(metrics.rework?.d30?.count, metrics.rework?.d30?.denominator, metrics.rework?.d30?.rate)],
		["Reincidência", metrics.rework?.repeated ?? 0, `${metrics.rework?.totalEvents ?? 0} evento(s)`],
		["Saúde crítica", metrics.health?.CRITICO ?? 0, percent(metrics.health?.criticalRate)],
	];
	return (
		<div className="space-y-4">
			{supportSource?.available === false ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Fonte de rechamados ainda sem eventos comprovados. D+7/D+15/D+30 mostram 0 evento real, não qualidade perfeita.
				</div>
			) : null}
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{cards.map(([label, value, sub]) => (
					<div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<p className="text-xs font-black uppercase text-slate-500">{label}</p>
						<p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
						<p className="mt-1 text-xs font-bold text-slate-500">{sub}</p>
					</div>
				))}
			</div>
			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-lg font-black text-slate-950">Qualidade por dimensão</h2>
						<p className="text-sm font-semibold text-slate-500">Produção e qualidade ficam separadas, com denominadores visíveis.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{QUALITY_DIMENSIONS.map((item) => (
							<button key={item.id} type="button" onClick={() => setDimension(item.id)} className={`rounded-xl px-3 py-2 text-xs font-black ${dimension === item.id ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{item.label}</button>
						))}
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-[1120px] w-full text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Grupo</th>
								<th className="px-4 py-3">OS</th>
								<th className="px-4 py-3">Janela OK</th>
								<th className="px-4 py-3">D+7</th>
								<th className="px-4 py-3">D+15</th>
								<th className="px-4 py-3">D+30</th>
								<th className="px-4 py-3">Reincidência</th>
								<th className="px-4 py-3">Saúde crítica</th>
								<th className="px-4 py-3">Amostra</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{(data?.items || []).map((item) => (
								<tr key={item.id} onClick={() => onOpen(item)} className="cursor-pointer transition hover:bg-blue-50/60">
									<td className="px-4 py-3"><p className="font-black text-slate-950">{item.label}</p><p className="text-xs font-semibold text-slate-500">{item.subtitle || "-"}</p></td>
									<td className="px-4 py-3 font-black text-slate-900">{item.metrics.production.completed}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{ratio(item.metrics.schedule.ON_TIME, item.metrics.production.completed, item.metrics.schedule.onTimeRate)}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{ratio(item.metrics.rework.d7.count, item.metrics.rework.d7.denominator, item.metrics.rework.d7.rate)}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{ratio(item.metrics.rework.d15.count, item.metrics.rework.d15.denominator, item.metrics.rework.d15.rate)}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{ratio(item.metrics.rework.d30.count, item.metrics.rework.d30.denominator, item.metrics.rework.d30.rate)}</td>
									<td className="px-4 py-3 font-black text-slate-900">{item.metrics.rework.repeated}</td>
									<td className="px-4 py-3 font-black text-red-700">{item.metrics.health.CRITICO}</td>
									<td className="px-4 py-3">{item.metrics.sample.small ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">Amostra pequena</span> : <span className="text-xs font-bold text-slate-400">OK</span>}</td>
								</tr>
							))}
							{!data?.items?.length ? <tr><td colSpan="9" className="px-4 py-10 text-center text-sm font-bold text-slate-400">Sem dados para os filtros.</td></tr> : null}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}

function QualityDetailModal({ detail, onClose }) {
	const payload = detail.item;
	const group = payload?.group || detail.group;
	return (
		<ModalShell open title="Detalhamento de qualidade" description={group ? `${group.label} · ${group.subtitle || "Qualidade da instalação"}` : "Carregando dados"} onClose={onClose} size="6xl">
			{detail.loading ? <Spinner /> : null}
			{detail.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{detail.error}</div> : null}
			{payload ? (
				<div className="space-y-4">
					<div className="grid gap-4 lg:grid-cols-2">
						<InfoGroup title="Produção" rows={[["OS", group?.metrics?.production?.completed], ["Analisáveis", group?.metrics?.production?.analyzable], ["Sem técnico", group?.metrics?.production?.unidentifiedTechnician], ["Amostra", group?.metrics?.sample?.small ? "Pequena" : "Adequada"]]} />
						<InfoGroup title="Rechamados" rows={[["D+7", ratio(group?.metrics?.rework?.d7?.count, group?.metrics?.rework?.d7?.denominator, group?.metrics?.rework?.d7?.rate)], ["D+15", ratio(group?.metrics?.rework?.d15?.count, group?.metrics?.rework?.d15?.denominator, group?.metrics?.rework?.d15?.rate)], ["D+30", ratio(group?.metrics?.rework?.d30?.count, group?.metrics?.rework?.d30?.denominator, group?.metrics?.rework?.d30?.rate)], ["Reincidência", group?.metrics?.rework?.repeated]]} />
					</div>
					<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
						<div className="border-b border-slate-100 px-4 py-3">
							<h3 className="text-base font-black text-slate-950">OS auditáveis</h3>
						</div>
						<div className="max-h-[430px] overflow-auto">
							<table className="min-w-[980px] w-full text-left text-sm">
								<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
									<tr><th className="px-4 py-3">OS</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Início</th><th className="px-4 py-3">Fim</th><th className="px-4 py-3">Janela</th><th className="px-4 py-3">Saúde</th><th className="px-4 py-3">Rechamados</th><th className="px-4 py-3">Cidade</th></tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{(payload.items || []).map((item) => (
										<tr key={item.id}>
											<td className="px-4 py-3 font-black text-blue-700">{item.orderNumber || item.hubsoftOrderId}</td>
											<td className="px-4 py-3 font-semibold text-slate-700">{item.orderTypeName}</td>
											<td className="px-4 py-3 font-semibold text-slate-700">{formatDateTime(item.executedStartAt)}</td>
											<td className="px-4 py-3 font-semibold text-slate-700">{formatDateTime(item.executedEndAt)}</td>
											<td className="px-4 py-3 font-black text-slate-800">{item.scheduleStatus}</td>
											<td className="px-4 py-3"><HealthBadge status={item.healthStatus} /></td>
											<td className="px-4 py-3 font-black text-slate-900">{item.supportEvents?.length || 0}</td>
											<td className="px-4 py-3 font-semibold text-slate-700">{item.city?.name || "-"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				</div>
			) : null}
		</ModalShell>
	);
}

function HealthView({ data, summary, onOpen }) {
	const cards = [
		["monitored", "Monitorados", summary?.summary?.monitored ?? 0, ""],
		["healthy", "Saudáveis", summary?.summary?.healthy ?? 0, percent(summary?.summary?.percentages?.healthy)],
		["attention", "Atenção", summary?.summary?.attention ?? 0, percent(summary?.summary?.percentages?.attention)],
		["critical", "Críticos", summary?.summary?.critical ?? 0, percent(summary?.summary?.percentages?.critical)],
		["noData", "Sem dados", summary?.summary?.noData ?? 0, percent(summary?.summary?.percentages?.noData)],
		["withRecall", "Com rechamado", summary?.summary?.withRecall ?? 0, ""],
		["withRepeatedSupport", "Reincidência", summary?.summary?.withRepeatedSupport ?? 0, ""],
		["noConnection", "Sem conexão", summary?.summary?.noConnection ?? 0, ""],
	];
	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{cards.map(([key, label, value, sub]) => (
					<div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<p className="text-xs font-black uppercase text-slate-500">{label}</p>
						<div className="mt-3 flex items-end justify-between gap-3">
							<p className="text-3xl font-black text-slate-950">{value}</p>
							{sub ? <p className="text-sm font-black text-blue-600">{sub}</p> : null}
						</div>
					</div>
				))}
			</div>
			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-100 px-4 py-3">
					<h2 className="text-lg font-black text-slate-950">Fila de Saúde Pós-Ativação</h2>
					<p className="text-sm font-semibold text-slate-500">Priorizada por crítico, atenção, sem dados e saudável, sempre com motivos rastreáveis.</p>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-[1180px] w-full text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Saúde</th>
								<th className="px-4 py-3">OS</th>
								<th className="px-4 py-3">D+n</th>
								<th className="px-4 py-3">Tipo</th>
								<th className="px-4 py-3">Técnico</th>
								<th className="px-4 py-3">Empresa</th>
								<th className="px-4 py-3">Cidade</th>
								<th className="px-4 py-3">Conexão</th>
								<th className="px-4 py-3">Tráfego</th>
								<th className="px-4 py-3">Rechamados</th>
								<th className="px-4 py-3">Motivos</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{(data?.items || []).map((item) => (
								<tr key={item.id} onClick={() => onOpen(item.id)} className="cursor-pointer transition hover:bg-blue-50/60">
									<td className="px-4 py-3"><HealthBadge status={item.healthStatus} /></td>
									<td className="px-4 py-3 font-black text-blue-700">{item.orderNumber || item.hubsoftOrderId}</td>
									<td className="px-4 py-3 font-bold text-slate-700">{item.healthWindow} <span className="text-slate-400">({item.daysSinceActivation ?? "-"}d)</span></td>
									<td className="px-4 py-3 font-semibold text-slate-700">{item.orderTypeName}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{item.technician.name}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{item.company.name || "-"}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{item.city.name || "-"}</td>
									<td className="px-4 py-3 font-bold text-slate-700">{item.connection.connected === true ? "Conectado" : item.connection.connected === false ? "Sem conexão" : "Sem captura"}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{Number(item.connection.downloadGigabytes || 0).toLocaleString("pt-BR")} GB down</td>
									<td className="px-4 py-3 font-black text-slate-900">{item.support.qualityCount}</td>
									<td className="px-4 py-3">
										<div className="flex max-w-md flex-wrap gap-1">
											{item.reasons.slice(0, 3).map((reason) => <span key={reason} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{reasonLabel(reason)}</span>)}
										</div>
									</td>
								</tr>
							))}
							{!data?.items?.length ? (
								<tr><td colSpan="11" className="px-4 py-10 text-center text-sm font-bold text-slate-400">Sem clientes monitorados para os filtros.</td></tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}

function HealthDetailModal({ detail, onClose }) {
	const item = detail.item;
	return (
		<ModalShell open title="Saúde pós-ativação" description={item ? `${item.orderNumber || item.hubsoftOrderId} · ${item.orderTypeName}` : "Carregando evidências"} onClose={onClose} size="6xl">
			{detail.loading ? <Spinner /> : null}
			{detail.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{detail.error}</div> : null}
			{item ? (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<HealthBadge status={item.healthStatus} />
						{item.reasons.map((reason) => <span key={reason} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{reasonLabel(reason)}</span>)}
					</div>
					<div className="grid gap-4 lg:grid-cols-2">
						<InfoGroup title="Ativação" rows={[["Número", item.orderNumber || item.hubsoftOrderId], ["Tipo", item.orderTypeName], ["Conclusão", formatDateTime(item.activationDate)], ["Janela", `${item.healthWindow} (${item.daysSinceActivation ?? "-"} dia(s))`]]} />
						<InfoGroup title="Responsável" rows={[["Técnico", item.technician.name], ["Empresa", item.company.name || "-"], ["Regional", item.regional.name || "-"], ["Cidade", item.city.name || "-"]]} />
						<InfoGroup title="Serviço" rows={[["Plano", item.service.description || "-"], ["Velocidade", item.service.speedMbps ? `${item.service.speedMbps} Mbps` : "-"], ["Marca", item.service.brand], ["Status", item.service.status || "-"]]} />
						<InfoGroup title="Conexão" rows={[["Conectado", item.connection.connected === true ? "Sim" : item.connection.connected === false ? "Não" : "-"], ["PPPoE", item.connection.pppoeUsername || "-"], ["IP", item.connection.ip || "-"], ["NAS", item.connection.nasIpAddress || "-"], ["Sessão", durationLabel(item.connection.sessionTimeSeconds)], ["Download", `${Number(item.connection.downloadGigabytes || 0).toLocaleString("pt-BR")} GB`], ["Upload", `${Number(item.connection.uploadGigabytes || 0).toLocaleString("pt-BR")} GB`], ["Última captura", formatDateTime(item.connection.capturedAt)]]} />
					</div>
					<section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<h3 className="text-base font-black text-slate-950">Histórico observado</h3>
						<div className="mt-3 space-y-2">
							{(item.evidence?.timeline || []).map((event, index) => (
								<div key={`${event.at}-${index}`} className="grid gap-2 rounded-xl bg-white px-3 py-2 text-sm md:grid-cols-[150px_1fr]">
									<span className="font-black text-slate-500">{formatDateTime(event.at)}</span>
									<span className="font-semibold text-slate-800">{event.label}</span>
								</div>
							))}
						</div>
					</section>
					<section className="rounded-2xl border border-slate-200 bg-white p-4">
						<h3 className="text-base font-black text-slate-950">Histórico da classificação</h3>
						<div className="mt-3 grid gap-2">
							{(item.healthHistory || []).map((entry) => (
								<div key={entry.evaluated_at} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
									<div className="flex flex-wrap items-center gap-2"><HealthBadge status={entry.health_status} />{(entry.reasons || []).map((reason) => <span key={reason} className="text-xs font-bold text-slate-500">{reasonLabel(reason)}</span>)}</div>
									<span className="text-xs font-black text-slate-400">{formatDateTime(entry.evaluated_at)}</span>
								</div>
							))}
						</div>
					</section>
				</div>
			) : null}
		</ModalShell>
	);
}

function ActivationDetailModal({ detail, onClose }) {
	const item = detail.item;
	return (
		<ModalShell open title="Detalhe da O.S" description={item ? `${item.orderNumber || item.hubsoftOrderId} · ${item.orderTypeName}` : "Carregando informações"} onClose={onClose} size="5xl">
			{detail.loading ? <Spinner /> : null}
			{detail.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{detail.error}</div> : null}
			{item ? (
				<div className="grid gap-4 lg:grid-cols-2">
					<InfoGroup title="O.S" rows={[["Número", item.orderNumber || item.hubsoftOrderId], ["Tipo", item.orderTypeName], ["Status HubSoft", item.rawStatus], ["Status Operacional", item.derivedStatus.label], ["Motivo", item.closureReasonName || "-"], ["Criada", formatDateTime(item.createdAtHubsoft)], ["Programada", formatDateTime(item.scheduledStartAt)], ["Executada", formatDateTime(item.executedEndAt)]]} />
					<InfoGroup title="Técnico" rows={[["Técnico", item.technician.name], ["Match", item.technician.matchStatus], ["Empresa", item.company.name || "-"], ["Regional", item.regional.name || "-"], ["Cidade", item.city.name || "-"]]} />
					<InfoGroup title="Serviço" rows={[["Plano", item.service.description || "-"], ["Velocidade", item.service.speedMbps ? `${item.service.speedMbps} Mbps` : "-"], ["Marca", item.service.brand], ["Status serviço", item.service.status || "-"]]} />
					<InfoGroup title="Conexão" rows={[["Conectado", item.connection.connected === true ? "Sim" : item.connection.connected === false ? "Não" : "-"], ["PPPoE", item.connection.pppoeUsername || "-"], ["Sessão", durationLabel(item.connection.sessionTimeSeconds)], ["Download", item.connection.downloadGigabytes ? `${item.connection.downloadGigabytes} GB` : "-"], ["Upload", item.connection.uploadGigabytes ? `${item.connection.uploadGigabytes} GB` : "-"], ["NAS", item.connection.nasIpAddress || "-"], ["Porta NAS", item.connection.nasPortId || "-"], ["Captura", formatDateTime(item.connection.capturedAt)]]} />
					<InfoGroup title="Auditoria" rows={[["Primeira sincronização", formatDateTime(item.firstSeenAt)], ["Última sincronização", formatDateTime(item.lastSeenAt)], ["Versão snapshot", item.version], ["Motivo status", item.derivedStatus.reason]]} />
				</div>
			) : null}
		</ModalShell>
	);
}

function InfoGroup({ title, rows }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
			<h3 className="text-base font-black text-slate-950">{title}</h3>
			<div className="mt-3 divide-y divide-slate-200">
				{rows.map(([label, value]) => (
					<div key={label} className="grid grid-cols-[150px_1fr] gap-3 py-2 text-sm">
						<span className="font-black uppercase text-slate-500">{label}</span>
						<span className="break-words font-semibold text-slate-900">{value ?? "-"}</span>
					</div>
				))}
			</div>
		</section>
	);
}
