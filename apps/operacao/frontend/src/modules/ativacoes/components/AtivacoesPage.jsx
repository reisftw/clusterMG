import {
	Activity,
	AlertTriangle,
	Building2,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock3,
	Download,
	Filter,
	MapPin,
	MoreHorizontal,
	RefreshCw,
	Rocket,
	Search,
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

const HEALTH_STATUS = {
	SAUDAVEL: { label: "Saudável", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
	ATENCAO: { label: "Atenção", className: "border-amber-200 bg-amber-50 text-amber-700" },
	CRITICO: { label: "Crítico", className: "border-red-200 bg-red-50 text-red-700" },
	SEM_DADOS: { label: "Sem dados", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const HEALTH_REASONS = {
	NO_CONNECTION: "Sem conexão",
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

const DATA_QUALITY_REASONS = {
	TECHNICIAN_UNMATCHED: "Técnico sem vínculo",
	COMPANY_UNMATCHED: "Empresa não identificada",
	CITY_MISSING: "Cidade não informada",
	BRAND_UNKNOWN: "Marca não identificada",
};

const QUALITY_DIMENSIONS = [
	{ id: "tecnicos", label: "Técnicos", api: "technician" },
	{ id: "empresas", label: "Empresas", api: "company" },
	{ id: "cidades", label: "Cidades", api: "city" },
	{ id: "tipos", label: "Tipos de OS", api: "type" },
];

const HUBSOFT_TIME_ZONE = "America/Sao_Paulo";

function todayIso() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: HUBSOFT_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${map.year}-${map.month}-${map.day}`;
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: HUBSOFT_TIME_ZONE });
}

function formatShortDate(value) {
	if (!value) return "-";
	const normalized = String(value).includes("T") ? value : `${value}T12:00:00-03:00`;
	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: HUBSOFT_TIME_ZONE });
}

function formatTime(value) {
	if (!value) return "--:--";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "--:--";
	return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: HUBSOFT_TIME_ZONE });
}

function formatNumber(value) {
	return Number(value || 0).toLocaleString("pt-BR");
}

function percentOf(value, total) {
	return total ? `${((Number(value || 0) / Number(total || 0)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%";
}

function relativeTime(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
	if (diffMinutes < 1) return "há poucos segundos";
	if (diffMinutes < 60) return `há ${diffMinutes} min`;
	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) return `há ${diffHours}h`;
	return formatDateTime(value);
}

function periodContext(period) {
	const labels = {
		today: "hoje",
		yesterday: "ontem",
		last7: "nos últimos 7 dias",
		month: "neste mês",
		previousMonth: "no mês anterior",
		custom: "no período selecionado",
	};
	return labels[period] || "no período selecionado";
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

function qualityIssueLabel(reason) {
	return DATA_QUALITY_REASONS[reason] || reason;
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
	saude: { breadcrumb: "Operação / Ativações / Saúde", title: "Saúde Pós-Ativação", description: "Acompanhe ativações recentes e priorize clientes com sinais de instabilidade." },
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
	const [filters, setFilters] = useState({ period: "last7", from: todayIso(), to: todayIso(), q: "", orderTypeId: "", status: "", technicianId: "", companyId: "", regionalId: "", cityId: "", brand: "", technicianIdentified: "", healthStatus: "", window: "", healthEvent: "", withRecall: "", repeatedSupport: "", noConnection: "", noTraffic: "", staleData: "", dataQuality: "", quality: "" });
	const [qualityDimension, setQualityDimension] = useState("tecnicos");
	const [qualityPage, setQualityPage] = useState(1);
	const [qualitySort, setQualitySort] = useState("volume");
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
	const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

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
				fetchAtivacoesSaude({ ...effectiveFilters, limit: 10000 }),
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
				fetchAtivacoesQualidade(qualityDimension, { ...effectiveFilters, page: qualityPage, limit: 25, sort: qualitySort }),
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
	}, [JSON.stringify(effectiveFilters), tab, qualityDimension, qualityPage, qualitySort]);

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
			const baseFilters = { ...effectiveFilters, dimension, id: group.id };
			const data = await fetchAtivacoesQualidadeDetail({ ...baseFilters, page: 1, limit: 25 });
			setQualityDetail({ loading: false, item: data, group, baseFilters });
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
	const hasLocalDashboardData = Number(dashboard?.summary?.created || dashboard?.summary?.createdToday || 0) > 0;

	return (
		<div className="space-y-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div className="min-w-0">
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">{pageCopy.breadcrumb}</p>
						<h1 className="mt-1 text-3xl font-black text-slate-950">{pageCopy.title}</h1>
						<p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
							{tab === "dashboard" ? "Acompanhe o fluxo e os principais indicadores da operação." : pageCopy.description}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<SyncStatusBadge latestSync={latestSync} syncJob={syncJob} compact />
						{canSync ? (
							<button type="button" onClick={triggerSync} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700">
								<RefreshCw size={17} className={syncJob?.status === "running" || syncJob?.status === "starting" ? "animate-spin" : ""} /> Atualizar
							</button>
						) : null}
						{canExport && (tab === "dashboard" || tab === "kanban") ? (
							<a href={ativacoesExportUrl(effectiveFilters)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50">
								<Download size={17} /> Exportar
							</a>
						) : null}
						{tab === "saude" && canExportHealth ? (
							<a href={ativacoesSaudeExportUrl(effectiveFilters)} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 transition hover:bg-emerald-100">
								<Download size={17} /> Exportar
							</a>
						) : null}
						{tab === "qualidade" && canExportQuality ? (
							<a href={ativacoesQualidadeExportUrl(QUALITY_DIMENSIONS.find((item) => item.id === qualityDimension)?.api || "technician", effectiveFilters)} className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-700 transition hover:bg-violet-100">
								<Download size={17} /> Exportar
							</a>
						) : null}
						<button type="button" title="Detalhes da sincronização" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
							<MoreHorizontal size={18} />
						</button>
					</div>
				</div>
				<div className="mt-5">
					<Filters filters={filters} setFilters={setFilters} options={filterOptions} tab={tab} advancedOpen={advancedFiltersOpen} setAdvancedOpen={setAdvancedFiltersOpen} />
				</div>
			</section>

			{error ? <ErrorState message={error} onRetry={tab === "saude" ? loadHealth : tab === "qualidade" ? loadQuality : load} compact={tab === "dashboard" && hasLocalDashboardData} /> : null}
			{loading && !currentData ? <Spinner fullScreen /> : null}

			{tab === "dashboard" ? <DashboardView data={dashboard} period={filters.period} /> : null}
			{tab === "kanban" ? <KanbanView data={kanban} query={filters.q} onOpen={openDetail} /> : null}
			{tab === "saude" ? <HealthView data={health} summary={healthSummary} onOpen={openHealthDetail} /> : null}
			{tab === "qualidade" ? <QualityView data={quality} summary={qualitySummary} dimension={qualityDimension} setDimension={setQualityDimension} page={qualityPage} setPage={setQualityPage} sort={qualitySort} setSort={setQualitySort} onOpen={openQualityDetail} /> : null}

			{detail ? <ActivationDetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
			{healthDetail ? <HealthDetailModal detail={healthDetail} onClose={() => setHealthDetail(null)} /> : null}
			{qualityDetail ? <QualityDetailModal detail={qualityDetail} onClose={() => setQualityDetail(null)} /> : null}
		</div>
	);
}

function Filters({ filters, setFilters, options, tab, advancedOpen, setAdvancedOpen }) {
	const setField = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
	const clearField = (key) => setField(key, "");
	const reset = () => setFilters((current) => ({ ...current, period: "last7", from: todayIso(), to: todayIso(), q: "", orderTypeId: "", status: "", technicianId: "", companyId: "", regionalId: "", cityId: "", brand: "", technicianIdentified: "", healthStatus: "", window: "", healthEvent: "", withRecall: "", repeatedSupport: "", noConnection: "", noTraffic: "", staleData: "", dataQuality: "", quality: "" }));
	const optionLabel = (items = [], id) => items.find((item) => String(item.id) === String(id))?.label || id;
	const chips = [
		filters.orderTypeId && { key: "orderTypeId", label: optionLabel((options?.orderTypes || []).map((item) => ({ id: item.id, label: item.name })), filters.orderTypeId) },
		filters.cityId && { key: "cityId", label: optionLabel((options?.cities || []).map((item) => ({ id: item.id, label: item.name })), filters.cityId) },
		filters.technicianId && { key: "technicianId", label: optionLabel((options?.technicians || []).map((item) => ({ id: item.id, label: item.name })), filters.technicianId) },
		filters.companyId && { key: "companyId", label: optionLabel((options?.companies || []).map((item) => ({ id: item.id, label: item.name })), filters.companyId) },
		filters.regionalId && { key: "regionalId", label: optionLabel((options?.regionals || []).map((item) => ({ id: item.id, label: item.name })), filters.regionalId) },
		filters.status && { key: "status", label: filters.status },
		filters.brand && { key: "brand", label: filters.brand },
		filters.healthStatus && { key: "healthStatus", label: filters.healthStatus },
		filters.window && { key: "window", label: filters.window },
		filters.quality && { key: "quality", label: optionLabel(options?.quality || [], filters.quality) },
	].filter(Boolean);
	const hasCriteria = chips.length > 0 || Boolean(filters.q);
	const visibleGrid = tab === "saude"
		? "md:grid-cols-[1fr_1fr_1fr_1.2fr_1.7fr_auto]"
		: tab === "kanban"
			? "md:grid-cols-[1fr_1.2fr_1.2fr_1.8fr_auto]"
			: "md:grid-cols-[1.1fr_1.2fr_1.2fr_auto]";
	return (
		<div className="space-y-3">
			<div className={`grid gap-2 ${visibleGrid}`}>
				<Select label="Período" value={filters.period} onChange={(v) => setField("period", v)} options={PERIODS} />
				{tab === "saude" ? <Select label="Saúde" value={filters.healthStatus} onChange={(v) => setField("healthStatus", v)} options={(options?.healthStatuses || []).map((item) => ({ id: item, label: HEALTH_STATUS[item]?.label || item }))} allowAll /> : null}
				{tab === "saude" ? <Select label="Janela" value={filters.window} onChange={(v) => setField("window", v)} options={[{ id: "D+1", label: "D+1" }, { id: "D+7", label: "D+7" }, { id: "D+15", label: "D+15" }, { id: "D+30", label: "D+30" }]} allowAll /> : null}
				<Select label="Tipo OS" value={filters.orderTypeId} onChange={(v) => setField("orderTypeId", v)} options={(options?.orderTypes || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
				{tab !== "saude" ? <Select label="Localidade" value={filters.cityId} onChange={(v) => setField("cityId", v)} options={(options?.cities || []).filter((item) => !filters.regionalId || item.regionalId === filters.regionalId).map((item) => ({ id: item.id, label: item.name }))} allowAll /> : null}
				{tab === "kanban" || tab === "saude" ? <Field label="Busca" value={filters.q} onChange={(v) => setField("q", v)} placeholder="Buscar OS, técnico ou cidade" /> : null}
				<button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 outline-none transition hover:bg-slate-50 focus:border-blue-500">
					<Filter size={16} /> Filtros
				</button>
			</div>
			{advancedOpen ? (
				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
					<div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
					{filters.period === "custom" ? <><Field label="De" type="date" value={filters.from} onChange={(v) => setField("from", v)} /><Field label="Até" type="date" value={filters.to} onChange={(v) => setField("to", v)} /></> : null}
					{tab !== "kanban" ? <Select label="Status" value={filters.status} onChange={(v) => setField("status", v)} options={[{ id: "pendente", label: "Pendente" }, { id: "aguardando_agendamento", label: "Aguardando agendamento" }, { id: "aguardando_aprovacao", label: "Aguardando aprovação" }, { id: "finalizado", label: "Finalizado" }]} allowAll /> : null}
					<Select label="Técnico" value={filters.technicianId} onChange={(v) => setField("technicianId", v)} options={(options?.technicians || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
					<Select label="Empresa" value={filters.companyId} onChange={(v) => setField("companyId", v)} options={(options?.companies || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
					<Select label="Regional" value={filters.regionalId} onChange={(v) => setField("regionalId", v)} options={(options?.regionals || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
					<Select label="Cidade específica" value={filters.cityId} onChange={(v) => setField("cityId", v)} options={(options?.cities || []).filter((item) => !filters.regionalId || item.regionalId === filters.regionalId).map((item) => ({ id: item.id, label: item.name }))} allowAll />
					<Select label="Marca" value={filters.brand} onChange={(v) => setField("brand", v)} options={(options?.brands || []).map((item) => ({ id: item, label: item }))} allowAll />
					<Select label="Técnico identificado" value={filters.technicianIdentified} onChange={(v) => setField("technicianIdentified", v)} options={[{ id: "yes", label: "Com técnico" }, { id: "no", label: "Sem técnico" }]} allowAll />
					{tab === "saude" ? <Select label="Eventos" value={filters.healthEvent} onChange={(v) => setFilters((current) => ({ ...current, healthEvent: v, withRecall: v === "withRecall" ? "yes" : "", repeatedSupport: v === "repeatedSupport" ? "yes" : "", noConnection: v === "noConnection" ? "yes" : "", noTraffic: v === "noTraffic" ? "yes" : "", staleData: v === "staleData" ? "yes" : "", dataQuality: v === "dataQuality" ? "yes" : "" }))} options={[{ id: "withRecall", label: "Com rechamado" }, { id: "repeatedSupport", label: "Com reincidência" }, { id: "noConnection", label: "Sem conexão" }, { id: "noTraffic", label: "Sem tráfego" }, { id: "staleData", label: "Dado desatualizado" }, { id: "dataQuality", label: "Cadastro incompleto" }]} allowAll /> : null}
					{tab === "qualidade" ? <Select label="Qualidade" value={filters.quality} onChange={(v) => setField("quality", v)} options={(options?.quality || []).map((item) => ({ id: item.id, label: item.label }))} allowAll /> : null}
					</div>
				</div>
			) : null}
			<div className="flex flex-wrap items-center gap-2">
				{chips.map((chip) => <button type="button" key={chip.key} onClick={() => clearField(chip.key)} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{chip.label} ×</button>)}
				{hasCriteria ? <button type="button" onClick={reset} className="text-xs font-black text-slate-500 hover:text-slate-900">Limpar filtros</button> : null}
			</div>
		</div>
	);
}

function Field({ label, type = "text", value, onChange, placeholder = "" }) {
	return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500" /></label>;
}

function Select({ label, value, onChange, options, allowAll = false }) {
	return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<select value={value || ""} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500">{allowAll ? <option value="">Todos</option> : null}{(options || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
}

function SyncStatusBadge({ latestSync, syncJob, compact = false }) {
	const rawStatus = syncJob?.status || latestSync?.status || "idle";
	const status = String(rawStatus).toLowerCase();
	const latestDate = latestSync?.finishedAt || latestSync?.finished_at || latestSync?.startedAt || latestSync?.started_at || latestSync?.created_at;
	const label = status === "running" || status === "starting" ? "Atualizando" : status === "failed" ? "Sincronização indisponível" : latestDate ? `Atualizado ${relativeTime(latestDate)}` : "Dados podem estar desatualizados";
	const detail = syncJob?.error || latestSync?.error_message || latestSync?.error || (latestDate ? formatDateTime(latestDate) : "Dados atualizados conforme filtros.");
	const className = status === "failed"
		? "border-red-200 bg-red-50 text-red-700"
		: status === "running" || status === "starting"
			? "border-blue-200 bg-blue-50 text-blue-700"
			: "border-emerald-200 bg-emerald-50 text-emerald-700";
	if (compact) {
		const Dot = status === "failed" ? AlertTriangle : RefreshCw;
		return (
			<div className={`inline-flex max-w-[320px] items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-black ${className}`} title={detail}>
				<Dot size={15} className={status === "running" || status === "starting" ? "animate-spin" : ""} />
				<span className="truncate">{label}</span>
			</div>
		);
	}
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

function ErrorState({ message, onRetry, compact = false }) {
	const friendly = message?.includes("Credenciais HubSoft") ? "A integração com o HubSoft precisa ser configurada." : message;
	return (
		<div className={`${compact ? "rounded-2xl px-4 py-3" : "rounded-3xl p-4"} border border-amber-200 bg-amber-50 shadow-sm`}>
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="flex min-w-0 items-start gap-2">
					<AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
					<div className="min-w-0">
						<p className="text-sm font-black text-amber-900">Sincronização HubSoft indisponível</p>
						<p className="mt-1 text-sm font-semibold text-amber-800">{friendly}{compact ? " Exibindo os últimos dados disponíveis." : ""}</p>
					</div>
				</div>
				<button type="button" onClick={onRetry} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-2 text-sm font-black text-white transition hover:bg-amber-700">
					<RefreshCw size={16} /> Tentar novamente
				</button>
			</div>
		</div>
	);
}

function DashboardView({ data, period }) {
	const summary = data?.summary || {};
	const distributions = data?.distributions || {};
	const total = Number(summary.created ?? summary.createdToday ?? 0);
	const completed = Number(summary.completed ?? summary.completedToday ?? 0);
	const backlog = Number(summary.backlog ?? 0);
	const operationalBase = Math.max(1, completed + backlog);
	const context = periodContext(period || data?.period?.preset || "last7");
	const kpis = [
		{ label: "Ativações abertas", value: total, sub: context, icon: Rocket, tone: "blue" },
		{ label: "Concluídas", value: completed, sub: `${percentOf(completed, operationalBase)} de concluídas + backlog`, icon: CheckCircle2, tone: "emerald" },
		{ label: "Backlog", value: backlog, sub: "Pendente ou aguardando agendamento", icon: Clock3, tone: "amber" },
		{ label: "Em atendimento", value: summary.inProgress ?? 0, sub: `${percentOf(summary.inProgress, operationalBase)} de concluídas + backlog`, icon: Activity, tone: "violet" },
	];
	const secondary = [
		["Aguardando agendamento", summary.awaitingSchedule ?? 0],
		["Aguardando aprovação", summary.awaitingApproval ?? 0],
		["Encerradas sem conclusão", summary.closedWithoutConclusion ?? 0],
		["Pendente de validação", summary.pendingValidation ?? 0],
		["Técnicos", summary.technicians ?? 0],
		["Empresas", summary.companies ?? 0],
		["Cidades", summary.cities ?? 0],
	];
	const hasData = total > 0 || completed > 0 || backlog > 0;
	return (
		<div className="space-y-7">
			<div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
				{kpis.map((item) => <ExecutiveKpi key={item.label} {...item} />)}
			</div>
			<div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
				{secondary.map(([label, value]) => (
					<div key={label} className="min-w-0 border-slate-100 md:border-r md:last:border-r-0">
						<p className="truncate text-xs font-black uppercase text-slate-500">{label}</p>
						<p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(value)}</p>
					</div>
				))}
			</div>
			{!hasData ? <DashboardEmptyState /> : (
				<>
					<DashboardSection title="Desempenho da operação">
						<div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
							<DailyEvolutionCard items={distributions.dailyEvolution || []} period={context} />
							<ChartCard title="Status das ativações" items={distributions.byStatus || []} />
						</div>
					</DashboardSection>
					<DashboardSection title="Composição das ativações">
						<div className="grid gap-4 xl:grid-cols-2">
							<ChartCard title="Tipo de OS" items={distributions.byType || []} showPercent />
							<ChartCard title="Volume por localidade" items={distributions.topCities || []} limit={10} />
						</div>
					</DashboardSection>
					<DashboardSection title="Execução operacional">
						<div className="grid gap-4 xl:grid-cols-2">
							<RankingTable title="Principais empresas" items={distributions.topCompanies || []} columns={["Empresa", "Ativações"]} />
							<RankingTable title="Principais técnicos" items={distributions.topTechnicians || []} columns={["Técnico", "Ativações"]} />
						</div>
					</DashboardSection>
				</>
			)}
		</div>
	);
}

function ExecutiveKpi({ label, value, sub, icon: Icon, tone }) {
	const tones = {
		blue: "bg-blue-50 text-blue-700 border-blue-100",
		emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
		amber: "bg-amber-50 text-amber-700 border-amber-100",
		violet: "bg-violet-50 text-violet-700 border-violet-100",
	};
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{label}</p>
					<p className="mt-3 text-4xl font-black text-slate-950">{formatNumber(value)}</p>
					<p className="mt-2 text-sm font-bold text-slate-500">{sub}</p>
				</div>
				<span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${tones[tone] || tones.blue}`}>
					<Icon size={20} />
				</span>
			</div>
		</section>
	);
}

function DashboardSection({ title, children }) {
	return (
		<section className="space-y-3">
			<h2 className="text-xl font-black text-slate-950">{title}</h2>
			{children}
		</section>
	);
}

function DashboardEmptyState() {
	return (
		<section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
			<Rocket size={34} className="mx-auto text-blue-600" />
			<h2 className="mt-4 text-xl font-black text-slate-950">Nenhuma ativação encontrada</h2>
			<p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">Não encontramos ativações no período selecionado. Altere o período ou revise os filtros aplicados.</p>
		</section>
	);
}

function ChartCard({ title, items, limit = 8, showPercent = false }) {
	const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
	const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="text-base font-black text-slate-950">{title}</h2>
			<div className="mt-4 space-y-3">
				{items.length ? items.slice(0, limit).map((item) => (
					<div key={item.label}>
						<div className="mb-1 flex items-center justify-between gap-3 text-sm font-bold">
							<span className="truncate text-slate-700">{item.label}</span>
							<span className="text-slate-950">{formatNumber(item.value)}{showPercent ? <span className="ml-2 text-xs text-slate-400">{percentOf(item.value, total)}</span> : null}</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(6, (Number(item.value) / max) * 100)}%` }} /></div>
					</div>
				)) : <p className="text-sm font-semibold text-slate-400">Sem dados para o filtro.</p>}
			</div>
		</section>
	);
}

function DailyEvolutionCard({ items, period }) {
	const max = Math.max(1, ...items.flatMap((item) => [Number(item.created) || Number(item.value) || 0, Number(item.completed) || 0]));
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-base font-black text-slate-950">Evolução diária</h2>
					<p className="text-sm font-semibold text-slate-500">Criadas e concluídas {period}.</p>
				</div>
				<div className="flex gap-4 text-xs font-black text-slate-500">
					<span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Criadas</span>
					<span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Concluídas</span>
				</div>
			</div>
			<div className="mt-5 grid min-h-[220px] items-end gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(28px, 1fr))` }}>
				{items.length ? items.map((item) => {
					const created = Number(item.created ?? item.value ?? 0);
					const completed = Number(item.completed ?? 0);
					return (
						<div key={item.label} className="flex min-w-0 flex-col items-center gap-2">
							<div className="flex h-36 w-full items-end justify-center gap-1 rounded-xl bg-slate-50 px-1 py-2">
								<div title={`${formatNumber(created)} criadas`} className="w-3 rounded-t bg-blue-600" style={{ height: `${Math.max(4, (created / max) * 100)}%` }} />
								<div title={`${formatNumber(completed)} concluídas`} className="w-3 rounded-t bg-emerald-500" style={{ height: `${Math.max(4, (completed / max) * 100)}%` }} />
							</div>
							<span className="text-[11px] font-black text-slate-500">{formatShortDate(item.label)}</span>
						</div>
					);
				}) : <p className="col-span-full self-center text-center text-sm font-semibold text-slate-400">Sem evolução no período.</p>}
			</div>
		</section>
	);
}

function RankingTable({ title, items, columns }) {
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="text-base font-black text-slate-950">{title}</h2>
				{items.length > 5 ? <span className="text-xs font-black text-blue-600">Top 5</span> : null}
			</div>
			<div className="overflow-hidden rounded-2xl border border-slate-100">
				<table className="w-full text-left text-sm">
					<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
						<tr><th className="px-4 py-3">{columns[0]}</th><th className="px-4 py-3 text-right">{columns[1]}</th></tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{items.slice(0, 5).map((item) => (
							<tr key={item.label}>
								<td className="max-w-[360px] truncate px-4 py-3 font-black text-slate-900">{item.label}</td>
								<td className="px-4 py-3 text-right font-black text-blue-700">{formatNumber(item.value)}</td>
							</tr>
						))}
						{!items.length ? <tr><td colSpan="2" className="px-4 py-8 text-center text-sm font-bold text-slate-400">Sem dados para o filtro.</td></tr> : null}
					</tbody>
				</table>
			</div>
		</section>
	);
}

const KANBAN_COLUMN_TONES = {
	to_schedule: {
		header: "border-amber-200 bg-amber-50 text-amber-900",
		count: "bg-amber-100 text-amber-800",
		accent: "bg-amber-500",
	},
	approval_pending: {
		header: "border-violet-200 bg-violet-50 text-violet-900",
		count: "bg-violet-100 text-violet-800",
		accent: "bg-violet-500",
	},
	in_progress: {
		header: "border-blue-200 bg-blue-50 text-blue-900",
		count: "bg-blue-100 text-blue-800",
		accent: "bg-blue-500",
	},
	to_validate: {
		header: "border-orange-200 bg-orange-50 text-orange-900",
		count: "bg-orange-100 text-orange-800",
		accent: "bg-orange-500",
	},
	completed: {
		header: "border-emerald-200 bg-emerald-50 text-emerald-900",
		count: "bg-emerald-100 text-emerald-800",
		accent: "bg-emerald-500",
	},
};

const INITIAL_COLUMN_LIMIT = 24;

function KanbanView({ data, query, onOpen }) {
	const [visibleLimits, setVisibleLimits] = useState({});
	const [completedCollapsed, setCompletedCollapsed] = useState(false);
	const normalizedQuery = normalizeQuery(query);
	const columns = data?.columns || [];
	const filteredColumns = columns.map((column) => {
		const items = (column.items || []).filter((item) => activationMatchesQuery(item, normalizedQuery));
		return { ...column, items };
	});
	const totalVisible = filteredColumns.reduce((sum, column) => sum + column.items.length, 0);
	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
				<div>
					<p className="text-sm font-black text-slate-950">Fluxo operacional</p>
					<p className="text-xs font-bold text-slate-500">
						{normalizedQuery ? `${formatNumber(totalVisible)} OS encontradas na busca` : `${formatNumber(data?.total || totalVisible)} OS no período filtrado`}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{filteredColumns.map((column) => (
						<span key={column.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
							{column.label}: {formatNumber(column.items.length)}
						</span>
					))}
				</div>
			</div>
			<div className="overflow-x-auto pb-3">
				<div className="grid min-h-[560px] min-w-[1600px] auto-cols-[320px] grid-flow-col gap-3 xl:min-h-[calc(100vh-330px)]">
					{filteredColumns.map((column) => {
						const collapsed = column.id === "completed" && completedCollapsed;
						return (
							<KanbanColumn
								key={column.id}
								column={column}
								collapsed={collapsed}
								visibleLimit={visibleLimits[column.id] || INITIAL_COLUMN_LIMIT}
								onLoadMore={() => setVisibleLimits((current) => ({ ...current, [column.id]: (current[column.id] || INITIAL_COLUMN_LIMIT) + INITIAL_COLUMN_LIMIT }))}
								onToggleCollapse={column.id === "completed" ? () => setCompletedCollapsed((current) => !current) : null}
								onOpen={onOpen}
							/>
						);
					})}
				</div>
			</div>
		</section>
	);
}

function KanbanColumn({ column, collapsed, visibleLimit, onLoadMore, onToggleCollapse, onOpen }) {
	const tone = KANBAN_COLUMN_TONES[column.id] || KANBAN_COLUMN_TONES.to_schedule;
	const items = column.items || [];
	const visible = collapsed ? [] : items.slice(0, visibleLimit);
	const hasMore = visible.length < items.length;
	const attentionCount = items.filter((item) => ["CRITICO", "ATENCAO"].includes(item.health?.status)).length;
	return (
		<section className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-slate-100/70 shadow-sm ${column.id === "completed" ? "opacity-90" : ""}`}>
			<div className={`sticky top-0 z-10 border-b px-3 py-3 ${tone.header}`}>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className={`h-2 w-2 shrink-0 rounded-full ${tone.accent}`} />
							<h2 className="truncate text-sm font-black uppercase tracking-[0.04em]">{column.label}</h2>
						</div>
						<p className="mt-1 text-xs font-bold opacity-75">{column.description}</p>
						{attentionCount ? <p className="mt-1 text-xs font-black text-amber-700">{attentionCount} com atenção</p> : null}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<span className={`rounded-full px-2.5 py-1 text-sm font-black ${tone.count}`}>{formatNumber(items.length)}</span>
						{onToggleCollapse ? (
							<button type="button" onClick={onToggleCollapse} className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/70 bg-white/70 text-slate-700 transition hover:bg-white" aria-label={collapsed ? "Expandir concluídas" : "Recolher concluídas"}>
								{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
							</button>
						) : null}
					</div>
				</div>
			</div>
			{collapsed ? (
				<div className="flex flex-1 items-center justify-center p-4">
					<button type="button" onClick={onToggleCollapse} className="w-full rounded-2xl border border-dashed border-emerald-200 bg-white px-4 py-8 text-center transition hover:border-emerald-300 hover:bg-emerald-50">
						<p className="text-3xl font-black text-emerald-700">{formatNumber(items.length)}</p>
						<p className="mt-1 text-sm font-black text-slate-700">OS concluídas</p>
						<p className="mt-2 text-xs font-bold text-slate-500">Expandir coluna</p>
					</button>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					<div className="space-y-2">
						{visible.map((item) => <ActivationCard key={item.id} item={item} onOpen={() => onOpen(item.id)} />)}
						{!visible.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs font-bold text-slate-400">Nenhuma OS nesta etapa</p> : null}
					</div>
					{hasMore ? (
						<button type="button" onClick={onLoadMore} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-blue-700 transition hover:border-blue-200 hover:bg-blue-50">
							Carregar mais · {formatNumber(visible.length)} de {formatNumber(items.length)}
						</button>
					) : null}
				</div>
			)}
		</section>
	);
}

function normalizeQuery(value = "") {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function activationMatchesQuery(item, query) {
	const q = normalizeQuery(query);
	if (!q) return true;
	return [
		item.orderNumber,
		item.hubsoftOrderId,
		item.orderTypeName,
		item.rawStatus,
		item.technician?.name,
		item.company?.name,
		item.city?.name,
		item.regional?.name,
		item.service?.brand,
	].some((value) => normalizeQuery(value).includes(q));
}

function SearchBox({ value, onChange, placeholder }) {
	return (
		<label className="relative block">
			<Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
			<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white" />
		</label>
	);
}

function Pagination({ page, total, pageSize, onPage }) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	if (total <= pageSize) return null;
	return (
		<div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs font-black text-slate-500">
			<span>{(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} de {total}</span>
			<div className="flex gap-1">
				<button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /></button>
				<button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={15} /></button>
			</div>
		</div>
	);
}

function friendlyTitle(value = "") {
	return String(value || "")
		.toLowerCase()
		.replace(/(^|\s|\/|-)([a-zá-ú])/g, (match) => match.toLocaleUpperCase("pt-BR"));
}

function compactDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: HUBSOFT_TIME_ZONE }) + " · " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: HUBSOFT_TIME_ZONE });
}

function contextualDate(item) {
	if (item.derivedStatus?.id === "completed") return { label: "Concluída", value: item.executedEndAt || item.scheduledEndAt || item.lastSeenAt };
	if (item.derivedStatus?.id === "in_progress") return { label: "Iniciada", value: item.executedStartAt || item.scheduledStartAt };
	if (item.derivedStatus?.id === "to_validate") return { label: "Finalizada", value: item.executedEndAt || item.scheduledEndAt };
	return { label: "Agendada", value: item.scheduledStartAt || item.createdAtHubsoft };
}

function ageFrom(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
	if (diffMinutes < 60) return `${diffMinutes}min`;
	const hours = Math.floor(diffMinutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}

function brandLabel(brand) {
	const value = String(brand || "").toUpperCase();
	if (value === "SEMPRE" || value === "ONNET") return value;
	return "—";
}

function connectionLabel(connection = {}) {
	if (connection.connected === true) return "Conectado";
	if (connection.connected === false) return "Sem conexão";
	return "Sem dados";
}

function ActivationCard({ item, onOpen }) {
	const date = contextualDate(item);
	const brand = brandLabel(item.service?.brand);
	const healthStatus = item.health?.status;
	const hasAttention = healthStatus === "CRITICO" || healthStatus === "ATENCAO";
	const age = item.derivedStatus?.id !== "completed" ? ageFrom(item.createdAtHubsoft || item.firstSeenAt) : "";
	return (
		<button type="button" onClick={onOpen} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200" aria-label={`Abrir detalhes da OS ${item.orderNumber || item.hubsoftOrderId}`}>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate font-mono text-sm font-black text-blue-700">#{item.orderNumber || item.hubsoftOrderId}</p>
					<p className="mt-1 line-clamp-1 text-xs font-black text-slate-800">{friendlyTitle(item.orderTypeName)}</p>
				</div>
				<span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${brand === "—" ? "bg-slate-100 text-slate-400" : "bg-blue-50 text-blue-700"}`}>{brand}</span>
			</div>
			<div className="mt-2 space-y-1 text-xs font-semibold text-slate-500">
				<p className="truncate"><UserRound size={12} className="mr-1 inline" />{item.technician?.name || "Não identificado"}</p>
				{item.city?.name ? <p className="truncate"><MapPin size={12} className="mr-1 inline" />{item.city.name}</p> : null}
				{item.company?.name ? <p className="truncate"><Building2 size={12} className="mr-1 inline" />{item.company.name}</p> : null}
			</div>
			<div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] font-black text-slate-500">
				<span className="truncate" title={formatDateTime(date.value)}>{date.label} {compactDateTime(date.value)}</span>
				{age ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">há {age}</span> : null}
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-1.5">
				<span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">
					<Wifi size={11} /> {connectionLabel(item.connection)}
				</span>
				{hasAttention ? (
					<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
						<AlertTriangle size={11} /> {healthStatus === "CRITICO" ? "Crítico" : "Atenção"}
					</span>
				) : null}
			</div>
		</button>
	);
}

function HealthBadge({ status }) {
	const config = HEALTH_STATUS[status] || HEALTH_STATUS.SEM_DADOS;
	return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${config.className}`}>{config.label}</span>;
}

function QualityView({ data, summary, dimension, setDimension, page, setPage, sort, setSort, onOpen }) {
	const metrics = summary?.metrics || {};
	const supportSource = summary?.supportSource;
	const completed = Number(metrics.production?.completed || 0);
	const late = Number(metrics.schedule?.LATE || 0);
	const cards = [
		["Ativações analisadas", completed, `${formatNumber(metrics.production?.analyzable)} elegíveis para análise`],
		["No horário", metrics.schedule?.ON_TIME ?? 0, percent(metrics.schedule?.onTimeRate)],
		["Atrasadas", late, percentOf(late, completed)],
		["Saúde crítica", metrics.health?.CRITICO ?? 0, percent(metrics.health?.criticalRate)],
	];
	const unidentified = Number(metrics.production?.unidentifiedTechnician || 0);
	const dimensionLabel = QUALITY_DIMENSIONS.find((item) => item.id === dimension)?.label || "Técnicos";
	return (
		<div className="space-y-4">
			{supportSource?.available === false ? (
				<div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800" title="D+7/D+15/D+30 não serão calculados até existir fonte confiável de eventos.">
					ⓘ Rechamados ainda não disponíveis · aguardando eventos comprovados
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
				<div className="grid gap-3 md:grid-cols-5">
					<SecondaryMetric label="No horário" value={metrics.schedule?.ON_TIME} />
					<SecondaryMetric label="Atrasadas" value={metrics.schedule?.LATE} />
					<SecondaryMetric label="Antecipadas" value={metrics.schedule?.EARLY} />
					<SecondaryMetric label="Sem dados" value={metrics.schedule?.NO_DATA} />
					<SecondaryMetric label="Técnico sem vínculo" value={metrics.production?.unidentifiedTechnician} />
				</div>
			</section>
			<section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Cumprimento da janela</h2>
					<ScheduleStackBar schedule={metrics.schedule || {}} total={completed} />
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Saúde pós-ativação</h2>
					<HealthMiniDistribution health={metrics.health || {}} total={completed} />
				</div>
			</section>
			{unidentified > 0 ? (
				<section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900 shadow-sm">
					⚠ {formatNumber(unidentified)} ativações ainda não possuem técnico vinculado ao cadastro do Operação.
				</section>
			) : null}
			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-lg font-black text-slate-950">Qualidade por dimensão</h2>
						<p className="text-sm font-semibold text-slate-500">Métricas objetivas por {dimensionLabel.toLowerCase()}, com dados cadastrais separados.</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{QUALITY_DIMENSIONS.map((item) => (
							<button key={item.id} type="button" onClick={() => { setDimension(item.id); setPage(1); }} className={`rounded-xl px-3 py-2 text-xs font-black ${dimension === item.id ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{item.label}</button>
						))}
						<Select label="Ordenar" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={[{ id: "volume", label: "Volume" }, { id: "onTime", label: "Janela OK" }, { id: "late", label: "Atrasadas" }, { id: "criticalHealth", label: "Saúde crítica" }]} />
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-[980px] w-full text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Grupo</th>
								<th className="px-4 py-3">OS</th>
								<th className="px-4 py-3">Janela OK</th>
								<th className="px-4 py-3">Atrasadas</th>
								{supportSource?.available ? <th className="px-4 py-3">D+7</th> : null}
								{supportSource?.available ? <th className="px-4 py-3">D+30</th> : null}
								{supportSource?.available ? <th className="px-4 py-3">Reincidência</th> : null}
								<th className="px-4 py-3">Saúde crítica</th>
								<th className="px-4 py-3">Amostra</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{(data?.items || []).map((item) => (
								<tr key={item.id} onClick={() => onOpen(item)} className="cursor-pointer transition hover:bg-blue-50/60">
									<td className="px-4 py-3"><p className="font-black text-slate-950">{item.label}</p><p className="text-xs font-semibold text-slate-500">{item.subtitle || (item.id === "unmatched" ? "Cadastro pendente" : "")}</p>{item.id === "unmatched" || item.id === "none" ? <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">Qualidade dos dados</span> : null}</td>
									<td className="px-4 py-3 font-black text-slate-900">{item.metrics.production.completed}</td>
									<td className="px-4 py-3 font-semibold text-slate-700">{ratio(item.metrics.schedule.ON_TIME, item.metrics.production.completed, item.metrics.schedule.onTimeRate)}</td>
									<td className="px-4 py-3 font-black text-amber-700">{item.metrics.schedule.LATE}</td>
									{supportSource?.available ? <td className="px-4 py-3 font-semibold text-slate-700">{ratio(item.metrics.rework.d7.count, item.metrics.rework.d7.denominator, item.metrics.rework.d7.rate)}</td> : null}
									{supportSource?.available ? <td className="px-4 py-3 font-semibold text-slate-700">{ratio(item.metrics.rework.d30.count, item.metrics.rework.d30.denominator, item.metrics.rework.d30.rate)}</td> : null}
									{supportSource?.available ? <td className="px-4 py-3 font-black text-slate-900">{item.metrics.rework.repeated}</td> : null}
									<td className="px-4 py-3 font-black text-red-700">{item.metrics.health.CRITICO}</td>
									<td className="px-4 py-3"><SampleBadge metrics={item.metrics} /></td>
								</tr>
							))}
							{!data?.items?.length ? <tr><td colSpan={supportSource?.available ? 9 : 6} className="px-4 py-10 text-center text-sm font-bold text-slate-400">Sem dados para os filtros.</td></tr> : null}
						</tbody>
					</table>
				</div>
				<Pagination page={page} total={data?.total || 0} pageSize={data?.limit || 25} onPage={setPage} />
			</section>
			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Qualidade dos dados</h2>
				<div className="mt-3 grid gap-3 md:grid-cols-4">
					<SecondaryMetric label="Técnico não vinculado" value={metrics.production?.unidentifiedTechnician} />
					<SecondaryMetric label="Sem dados de janela" value={metrics.schedule?.NO_DATA} />
					<SecondaryMetric label="Sem dados de conexão" value={metrics.operational?.noConnectionData} />
					<SecondaryMetric label="Sem conexão" value={metrics.operational?.noConnection} />
				</div>
			</section>
		</div>
	);
}

const SCHEDULE_STATUS_LABELS = {
	ON_TIME: { label: "No horário", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
	EARLY: { label: "Antecipada", className: "border-blue-200 bg-blue-50 text-blue-700" },
	LATE: { label: "Atrasada", className: "border-amber-200 bg-amber-50 text-amber-700" },
	NO_DATA: { label: "Sem dados", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

function ScheduleBadge({ status }) {
	const config = SCHEDULE_STATUS_LABELS[status] || SCHEDULE_STATUS_LABELS.NO_DATA;
	return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${config.className}`}>{config.label}</span>;
}

function SampleBadge({ metrics }) {
	const count = Number(metrics?.production?.completed || 0);
	if (metrics?.sample?.small) return <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">Amostra pequena · {formatNumber(count)} OS</span>;
	return <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">Amostra adequada · {formatNumber(count)} OS</span>;
}

function ScheduleStackBar({ schedule = {}, total }) {
	const segments = [
		{ key: "ON_TIME", label: "No horário", value: schedule.ON_TIME, className: "bg-emerald-500" },
		{ key: "EARLY", label: "Antecipada", value: schedule.EARLY, className: "bg-blue-500" },
		{ key: "LATE", label: "Atrasada", value: schedule.LATE, className: "bg-amber-500" },
		{ key: "NO_DATA", label: "Sem dados", value: schedule.NO_DATA, className: "bg-slate-300" },
	];
	return (
		<div className="mt-4">
			<div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
				{segments.map((segment) => <div key={segment.key} className={segment.className} style={{ width: `${Math.max(0, total ? (Number(segment.value || 0) / total) * 100 : 0)}%` }} title={`${segment.label}: ${percentOf(segment.value, total)}`} />)}
			</div>
			<div className="mt-3 grid gap-2 sm:grid-cols-2">
				{segments.map((segment) => (
					<div key={segment.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
						<span>{segment.label}</span>
						<span>{formatNumber(segment.value)} · {percentOf(segment.value, total)}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function HealthMiniDistribution({ health = {}, total }) {
	const items = [
		["CRITICO", "Crítico", "text-red-700"],
		["ATENCAO", "Atenção", "text-amber-700"],
		["SAUDAVEL", "Saudável", "text-emerald-700"],
		["SEM_DADOS", "Sem dados", "text-slate-600"],
	];
	return (
		<div className="mt-3 grid gap-2">
			{items.map(([key, label, className]) => (
				<div key={key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
					<span className="font-black text-slate-600">{label}</span>
					<span className={`font-black ${className}`}>{formatNumber(health[key])} · {percentOf(health[key], total)}</span>
				</div>
			))}
		</div>
	);
}

function QualityDetailModal({ detail, onClose }) {
	const [payload, setPayload] = useState(detail.item);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(detail.error || "");
	const [search, setSearch] = useState("");
	const [scheduleStatus, setScheduleStatus] = useState("");
	const [healthStatus, setHealthStatus] = useState("");
	useEffect(() => {
		if (detail.item) setPayload(detail.item);
		setError(detail.error || "");
	}, [detail.item, detail.error]);
	const group = payload?.group || detail.group;
	const pagination = payload?.pagination || { page: 1, limit: 25, total: payload?.items?.length || 0, totalPages: 1 };
	async function reload(overrides = {}) {
		setLoading(true);
		setError("");
		try {
			const next = {
				...(detail.baseFilters || {}),
				page: overrides.page ?? pagination.page,
				limit: overrides.limit ?? pagination.limit,
				search: overrides.search ?? search,
				scheduleStatus: overrides.scheduleStatus ?? scheduleStatus,
				healthStatus: overrides.healthStatus ?? healthStatus,
			};
			const data = await fetchAtivacoesQualidadeDetail(next);
			setPayload(data);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o detalhamento.");
		} finally {
			setLoading(false);
		}
	}
	return (
		<ModalShell open title="Detalhamento de qualidade" description={group ? `${group.label} · ${group.subtitle || "Qualidade da instalação"}` : "Carregando dados"} onClose={onClose} size="6xl">
			{detail.loading || loading ? <Spinner /> : null}
			{error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
			{payload ? (
				<div className="space-y-4">
					<div className="grid gap-3 md:grid-cols-5">
						<SecondaryMetric label="OS" value={group?.metrics?.production?.completed} />
						<SecondaryMetric label="Janela OK" value={group?.metrics?.schedule?.ON_TIME} />
						<SecondaryMetric label="Atrasadas" value={group?.metrics?.schedule?.LATE} />
						<SecondaryMetric label="Antecipadas" value={group?.metrics?.schedule?.EARLY} />
						<SecondaryMetric label="Saúde crítica" value={group?.metrics?.health?.CRITICO} />
					</div>
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
						<div className="grid gap-2 md:grid-cols-[1.5fr_1fr_1fr_auto]">
							<Field label="Buscar OS ou tipo" value={search} onChange={setSearch} placeholder="OS, tipo, cidade..." />
							<Select label="Janela" value={scheduleStatus} onChange={(value) => { setScheduleStatus(value); reload({ page: 1, scheduleStatus: value }); }} options={Object.entries(SCHEDULE_STATUS_LABELS).map(([id, item]) => ({ id, label: item.label }))} allowAll />
							<Select label="Saúde" value={healthStatus} onChange={(value) => { setHealthStatus(value); reload({ page: 1, healthStatus: value }); }} options={Object.entries(HEALTH_STATUS).map(([id, item]) => ({ id, label: item.label }))} allowAll />
							<button type="button" onClick={() => reload({ page: 1, search })} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">Buscar</button>
						</div>
					</div>
					<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
							<h3 className="text-base font-black text-slate-950">OS auditáveis</h3>
							<div className="w-36">
								<Select label="Por página" value={pagination.limit} onChange={(value) => reload({ page: 1, limit: value })} options={[25, 50, 100].map((value) => ({ id: value, label: `${value}` }))} />
							</div>
						</div>
						<div className="overflow-x-auto">
							<table className="min-w-[860px] w-full text-left text-sm">
								<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
									<tr><th className="px-4 py-3">OS</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Execução</th><th className="px-4 py-3">Janela</th><th className="px-4 py-3">Saúde</th><th className="px-4 py-3">Localidade</th></tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{(payload.items || []).map((item) => (
										<tr key={item.id}>
											<td className="px-4 py-3 font-black text-blue-700">{item.orderNumber || item.hubsoftOrderId}</td>
											<td className="px-4 py-3 font-semibold text-slate-700">{item.orderTypeName}</td>
											<td className="px-4 py-3 font-semibold text-slate-700"><p>{formatShortDate(item.executedEndAt || item.executedStartAt)}</p><p className="text-xs text-slate-500">{formatTime(item.executedStartAt)} → {formatTime(item.executedEndAt)}</p></td>
											<td className="px-4 py-3"><ScheduleBadge status={item.scheduleStatus} /></td>
											<td className="px-4 py-3"><HealthBadge status={item.healthStatus} /></td>
											<td className="px-4 py-3 font-semibold text-slate-700">{item.city?.name || "Não informada"}</td>
										</tr>
									))}
									{!payload.items?.length ? (
										<tr>
											<td colSpan={6} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
												Nenhuma O.S. encontrada para este grupo nos filtros atuais.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
						<div className="px-4 pb-4">
							<Pagination page={pagination.page} total={pagination.total} pageSize={pagination.limit} onPage={(nextPage) => reload({ page: nextPage })} />
						</div>
					</section>
				</div>
			) : null}
		</ModalShell>
	);
}

function HealthView({ data, summary, onOpen }) {
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [riskFilter, setRiskFilter] = useState("action");
	const pageSize = 50;
	const metrics = summary?.summary || {};
	const supportSource = summary?.supportSource || {};
	const monitored = Number(metrics.monitored || 0);
	const kpis = [
		{ id: "monitored", label: "Monitorados", value: metrics.monitored, sub: "ativações na janela de acompanhamento", tone: "blue" },
		{ id: "critical", label: "Críticos", value: metrics.critical, sub: `${percentOf(metrics.critical, monitored)} dos monitorados`, tone: "red" },
		{ id: "attention", label: "Atenção", value: metrics.attention, sub: `${percentOf(metrics.attention, monitored)} dos monitorados`, tone: "amber" },
		{ id: "healthy", label: "Saudáveis", value: metrics.healthy, sub: `${percentOf(metrics.healthy, monitored)} dos monitorados`, tone: "emerald" },
	];
	const filteredItems = (data?.items || [])
		.filter((item) => activationMatchesQuery(item, query))
		.filter((item) => {
			if (riskFilter === "action") return ["CRITICO", "ATENCAO"].includes(item.healthStatus);
			if (riskFilter === "all") return true;
			return item.healthStatus === riskFilter;
		});
	const safePage = Math.min(page, Math.max(1, Math.ceil(filteredItems.length / pageSize)));
	const visibleItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);
	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{kpis.map((item) => <HealthKpiCard key={item.id} {...item} />)}
			</div>
			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="grid gap-3 md:grid-cols-5">
					<SecondaryMetric label="Sem conexão" value={metrics.noConnection} />
					<SecondaryMetric label="Sem dados" value={metrics.noData} />
					<SecondaryMetric label="Rechamados" value={supportSource.available ? metrics.withRecall : "Fonte indisponível"} muted={!supportSource.available} />
					<SecondaryMetric label="Reincidência" value={supportSource.available ? metrics.withRepeatedSupport : "Fonte indisponível"} muted={!supportSource.available} />
					<SecondaryMetric label="Dados vencidos" value={metrics.staleData} />
				</div>
			</section>
			<section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Situação da base monitorada</h2>
					<p className="text-sm font-semibold text-slate-500">Composição da saúde técnica, separada de pendências cadastrais.</p>
					<HealthStackBar metrics={metrics} total={monitored} />
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Principais sinais de risco</h2>
					<ReasonList items={metrics.topTechnicalReasons || []} labelFor={reasonLabel} empty="Nenhum sinal técnico para os filtros." />
				</div>
			</section>
			<section className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h2 className="text-lg font-black text-slate-950">Qualidade dos dados</h2>
							<p className="text-sm font-semibold text-slate-500">{formatNumber(metrics.dataQuality)} ativações possuem pendências de cadastro.</p>
						</div>
						<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Não afeta saúde</span>
					</div>
					<ReasonList items={metrics.topDataQualityIssues || []} labelFor={qualityIssueLabel} empty="Sem pendências cadastrais relevantes." />
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Saúde por janela</h2>
					<div className="mt-3 overflow-x-auto">
						<table className="min-w-[520px] w-full text-left text-sm">
							<thead className="text-xs font-black uppercase text-slate-500">
								<tr><th className="py-2">Janela</th><th className="py-2 text-right">Monitorados</th><th className="py-2 text-right">Críticos</th><th className="py-2 text-right">Atenção</th><th className="py-2 text-right">Saudáveis</th></tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{(metrics.byWindow || []).map((item) => (
									<tr key={item.window}>
										<td className="py-2 font-black text-slate-800">{item.window}</td>
										<td className="py-2 text-right font-bold text-slate-700">{formatNumber(item.monitored)}</td>
										<td className="py-2 text-right font-bold text-red-700">{formatNumber(item.critical)}</td>
										<td className="py-2 text-right font-bold text-amber-700">{formatNumber(item.attention)}</td>
										<td className="py-2 text-right font-bold text-emerald-700">{formatNumber(item.healthy)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</section>
			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-100 px-4 py-3">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<h2 className="text-lg font-black text-slate-950">Ativações que exigem atenção</h2>
							<p className="text-sm font-semibold text-slate-500">Priorizadas pelo nível de risco e pelas evidências técnicas disponíveis.</p>
						</div>
						<div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[620px]">
							<SearchBox value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Buscar OS, técnico ou cidade" />
							<div className="flex flex-wrap gap-1.5">
								{[
									["action", "Críticos + Atenção"],
									["CRITICO", "Críticos"],
									["ATENCAO", "Atenção"],
									["SEM_DADOS", "Sem dados"],
									["SAUDAVEL", "Saudáveis"],
									["all", "Todos"],
								].map(([id, label]) => (
									<QuickFilterButton key={id} active={riskFilter === id} onClick={() => { setRiskFilter(id); setPage(1); }}>{label}</QuickFilterButton>
								))}
							</div>
						</div>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-[1080px] w-full text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Saúde</th>
								<th className="px-4 py-3">Ativação</th>
								<th className="px-4 py-3">Responsável</th>
								<th className="px-4 py-3">Conexão</th>
								<th className="px-4 py-3">Sinais</th>
								<th className="px-4 py-3">Tempo</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{visibleItems.map((item) => (
								<tr key={item.id} onClick={() => onOpen(item.id)} className="cursor-pointer transition hover:bg-blue-50/60">
									<td className="px-4 py-3"><HealthBadge status={item.healthStatus} /></td>
									<td className="px-4 py-3">
										<p className="font-mono text-sm font-black text-blue-700">#{item.orderNumber || item.hubsoftOrderId}</p>
										<p className="mt-1 max-w-[260px] truncate font-semibold text-slate-700">{friendlyTitle(item.orderTypeName)}</p>
									</td>
									<td className="px-4 py-3">
										<p className="max-w-[240px] truncate font-black text-slate-800">{item.technician.name || "Técnico não identificado"}</p>
										{item.company.name ? <p className="max-w-[240px] truncate text-xs font-semibold text-slate-500">{item.company.name}</p> : null}
										{item.city.name ? <p className="max-w-[240px] truncate text-xs font-semibold text-slate-500">{item.city.name}</p> : null}
										{item.dataQualityIssues?.length ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">Cadastro incompleto</span> : null}
									</td>
									<td className="px-4 py-3">
										<p className={`font-black ${item.connection.connected === true ? "text-emerald-700" : item.connection.connected === false ? "text-red-700" : "text-slate-500"}`}>{connectionLabel(item.connection)}</p>
										<p className="text-xs font-semibold text-slate-500">{trafficLabel(item.connection)}</p>
									</td>
									<td className="px-4 py-3"><SignalChips reasons={item.technicalReasons || item.reasons || []} labelFor={reasonLabel} tone="risk" /></td>
									<td className="px-4 py-3">
										<p className="font-black text-slate-800">{item.daysSinceActivation ?? "-"} dia(s)</p>
										<p className="text-xs font-bold text-slate-500">Janela: {item.healthWindow}</p>
									</td>
								</tr>
							))}
							{!visibleItems.length ? (
								<tr><td colSpan="6" className="px-4 py-10 text-center text-sm font-bold text-slate-400">Sem clientes monitorados para os filtros.</td></tr>
							) : null}
						</tbody>
					</table>
				</div>
				<div className="px-4 pb-4">
					<Pagination page={safePage} total={filteredItems.length} pageSize={pageSize} onPage={setPage} />
				</div>
			</section>
		</div>
	);
}

function HealthKpiCard({ label, value, sub, tone }) {
	const toneClass = {
		blue: "border-blue-100 bg-blue-50/50 text-blue-700",
		red: "border-red-100 bg-red-50/50 text-red-700",
		amber: "border-amber-100 bg-amber-50/50 text-amber-700",
		emerald: "border-emerald-100 bg-emerald-50/50 text-emerald-700",
	}[tone] || "border-slate-200 bg-white text-slate-700";
	return (
		<div className={`rounded-2xl border bg-white p-4 shadow-sm ${toneClass}`}>
			<p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
			<p className="mt-3 text-3xl font-black text-slate-950">{formatNumber(value)}</p>
			<p className="mt-1 text-sm font-bold text-slate-500">{sub}</p>
		</div>
	);
}

function SecondaryMetric({ label, value, muted = false }) {
	return (
		<div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
			<p className="text-xs font-black uppercase text-slate-500">{label}</p>
			<p className={`mt-1 text-lg font-black ${muted ? "text-slate-500" : "text-slate-950"}`}>{typeof value === "number" ? formatNumber(value) : value ?? 0}</p>
		</div>
	);
}

function HealthStackBar({ metrics, total }) {
	const segments = [
		{ key: "critical", label: "Crítico", value: metrics.critical, className: "bg-red-500" },
		{ key: "attention", label: "Atenção", value: metrics.attention, className: "bg-amber-400" },
		{ key: "healthy", label: "Saudável", value: metrics.healthy, className: "bg-emerald-500" },
		{ key: "noData", label: "Sem dados", value: metrics.noData, className: "bg-slate-300" },
	];
	return (
		<div className="mt-4">
			<div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
				{segments.map((segment) => (
					<div key={segment.key} className={segment.className} style={{ width: `${Math.max(0, total ? (Number(segment.value || 0) / total) * 100 : 0)}%` }} title={`${segment.label}: ${percentOf(segment.value, total)}`} />
				))}
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{segments.map((segment) => (
					<span key={segment.key} className="text-xs font-black text-slate-500">{segment.label}: {percentOf(segment.value, total)}</span>
				))}
			</div>
		</div>
	);
}

function ReasonList({ items, labelFor, empty }) {
	if (!items.length) return <p className="mt-3 text-sm font-bold text-slate-400">{empty}</p>;
	return (
		<div className="mt-3 space-y-2">
			{items.map((item) => (
				<div key={item.reason} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
					<span className="text-sm font-black text-slate-700">{labelFor(item.reason)}</span>
					<span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-600">{formatNumber(item.count)}</span>
				</div>
			))}
		</div>
	);
}

function QuickFilterButton({ active, onClick, children }) {
	return (
		<button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-black transition ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
			{children}
		</button>
	);
}

function trafficLabel(connection = {}) {
	const down = Number(connection.downloadGigabytes || 0);
	const up = Number(connection.uploadGigabytes || 0);
	const total = down + up;
	if (total <= 0) return "Sem tráfego observado";
	return `${down.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB acumulados`;
}

function SignalChips({ reasons = [], labelFor, tone = "risk", limit = 2 }) {
	if (!reasons.length) return <span className="text-xs font-bold text-slate-400">Sem sinais técnicos</span>;
	const visible = reasons.slice(0, limit);
	const rest = reasons.length - visible.length;
	const className = tone === "risk" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
	return (
		<div className="flex max-w-md flex-wrap gap-1">
			{visible.map((reason) => <span key={reason} className={`rounded-full px-2 py-1 text-[11px] font-black ${className}`}>{labelFor(reason)}</span>)}
			{rest > 0 ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">+{rest}</span> : null}
		</div>
	);
}

function HealthDetailModal({ detail, onClose }) {
	const item = detail.item;
	return (
		<ModalShell open title={item ? `OS #${item.orderNumber || item.hubsoftOrderId}` : "Saúde pós-ativação"} description={item ? `${HEALTH_STATUS[item.healthStatus]?.label || item.healthStatus} · ${friendlyTitle(item.orderTypeName)} · ativado há ${item.daysSinceActivation ?? "-"} dia(s)` : "Carregando evidências"} onClose={onClose} size="6xl">
			{detail.loading ? <Spinner /> : null}
			{detail.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{detail.error}</div> : null}
			{item ? (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<HealthBadge status={item.healthStatus} />
						<SignalChips reasons={item.technicalReasons || item.reasons || []} labelFor={reasonLabel} limit={6} />
						{item.dataQualityIssues?.length ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Cadastro incompleto</span> : null}
					</div>
					<div className="grid gap-4 lg:grid-cols-2">
						<InfoGroup title="Diagnóstico atual" rows={[["Saúde", HEALTH_STATUS[item.healthStatus]?.label || item.healthStatus], ["Razões técnicas", (item.technicalReasons || item.reasons || []).length ? (item.technicalReasons || item.reasons).map(reasonLabel).join(", ") : "Sem sinais técnicos"], ["Última avaliação", formatDateTime(item.evaluatedAt)], ["Modo", item.evidence?.monitoringMode || "-"]]} />
						<InfoGroup title="Ativação" rows={[["Número", item.orderNumber || item.hubsoftOrderId], ["Tipo", friendlyTitle(item.orderTypeName)], ["Conclusão", formatDateTime(item.activationDate)], ["Janela", item.healthWindow], ["Idade real", `${item.daysSinceActivation ?? "-"} dia(s)`]]} />
						<InfoGroup title="Serviço" rows={[["Plano", item.service.description || "-"], ["Velocidade", item.service.speedMbps ? `${item.service.speedMbps} Mbps` : "-"], ["Marca", item.service.brand], ["Status", item.service.status || "-"]]} />
						<InfoGroup title="Conexão" rows={[["Estado atual", connectionLabel(item.connection)], ["PPPoE", item.connection.pppoeUsername || "-"], ["IP", item.connection.ip || "-"], ["NAS", item.connection.nasIpAddress || "-"], ["Porta", item.connection.nasPortId || "-"], ["Tempo de sessão", durationLabel(item.connection.sessionTimeSeconds)], ["Tráfego", trafficLabel(item.connection)], ["Última captura", formatDateTime(item.connection.capturedAt)]]} />
						<InfoGroup title="Pós-atendimento" rows={[["Rechamados técnicos", item.support?.events?.length ? item.support.qualityCount : "Dados de suporte ainda não disponíveis"], ["Reincidência", item.support?.events?.length ? (item.support.repeated ? "Sim" : "Não") : "Fonte indisponível"]]} />
						<InfoGroup title="Responsável" rows={[["Técnico", item.technician.name || "Não identificado"], ["Empresa", item.company.name || "Não identificada"], ["Regional", item.regional.name || "Não informada"], ["Cidade", item.city.name || "Não informada"], ["Pendências cadastrais", item.dataQualityIssues?.length ? item.dataQualityIssues.map(qualityIssueLabel).join(", ") : "Sem pendências"]]} />
					</div>
					<section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<h3 className="text-base font-black text-slate-950">Timeline da ativação</h3>
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
									<div className="flex flex-wrap items-center gap-2"><HealthBadge status={entry.health_status} /><SignalChips reasons={(entry.reasons || []).filter((reason) => !DATA_QUALITY_REASONS[reason])} labelFor={reasonLabel} limit={4} /></div>
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
		<ModalShell open title="Detalhe da O.S" description={item ? `${item.orderNumber || item.hubsoftOrderId} · ${item.orderTypeName}` : "Carregando informações"} onClose={onClose} size="6xl">
			{detail.loading ? <Spinner /> : null}
			{detail.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{detail.error}</div> : null}
			{item ? (
				<div className="grid gap-4 lg:grid-cols-2">
					<InfoGroup title="O.S" rows={[["Número", item.orderNumber || item.hubsoftOrderId], ["Tipo", item.orderTypeName], ["Status HubSoft", item.rawStatus], ["Status Operacional", item.derivedStatus.label], ["Motivo", item.closureReasonName || "-"], ["Marca", item.service.brand || "-"]]} />
					<InfoGroup title="Planejamento" rows={[["Criada", formatDateTime(item.createdAtHubsoft)], ["Início programado", formatDateTime(item.scheduledStartAt)], ["Fim programado", formatDateTime(item.scheduledEndAt)], ["Início execução", formatDateTime(item.executedStartAt)], ["Fim execução", formatDateTime(item.executedEndAt)]]} />
					<InfoGroup title="Responsável" rows={[["Técnico", item.technician.name], ["Match", item.technician.matchStatus || "-"], ["Empresa", item.company.name || "Não identificada"]]} />
					<InfoGroup title="Localidade" rows={[["Cidade", item.city.name || "Não informada"], ["Regional", item.regional.name || "-"]]} />
					<InfoGroup title="Serviço" rows={[["Plano", item.service.description || "-"], ["Velocidade", item.service.speedMbps ? `${item.service.speedMbps} Mbps` : "-"], ["Marca", item.service.brand], ["Status serviço", item.service.status || "-"]]} />
					<InfoGroup title="Conexão" rows={[["Conectado", item.connection.connected === true ? "Sim" : item.connection.connected === false ? "Não" : "-"], ["PPPoE", item.connection.pppoeUsername || "-"], ["Sessão", durationLabel(item.connection.sessionTimeSeconds)], ["Download", item.connection.downloadGigabytes ? `${item.connection.downloadGigabytes} GB` : "-"], ["Upload", item.connection.uploadGigabytes ? `${item.connection.uploadGigabytes} GB` : "-"], ["NAS", item.connection.nasIpAddress || "-"], ["Porta NAS", item.connection.nasPortId || "-"], ["Captura", formatDateTime(item.connection.capturedAt)]]} />
					<InfoGroup title="Saúde" rows={[["Classificação", item.health?.status ? HEALTH_STATUS[item.health.status]?.label || item.health.status : "-"], ["Janela", item.health?.window || "-"], ["Dias desde ativação", item.health?.daysSinceActivation ?? "-"], ["Motivos", item.health?.reasons?.length ? item.health.reasons.map(reasonLabel).join(", ") : "-"], ["Avaliada em", formatDateTime(item.health?.evaluatedAt)]]} />
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
