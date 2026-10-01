import {
	Activity,
	Building2,
	CalendarDays,
	CheckCircle2,
	Clock3,
	Download,
	Eye,
	Filter,
	ListChecks,
	MapPin,
	RefreshCw,
	Rocket,
	Search,
	Signal,
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
	fetchAtivacaoDetail,
	fetchAtivacoesDashboard,
	fetchAtivacoesFilters,
	fetchAtivacoesKanban,
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
	["awaitingSchedule", "Aguard. agendamento", CalendarDays],
	["awaitingApproval", "Aguard. aprovação", Eye],
	["pendingValidation", "Pend. validação", ListChecks],
	["technicians", "Técnicos envolvidos", UserRound],
	["companies", "Empresas envolvidas", Building2],
	["cities", "Cidades atendidas", MapPin],
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

function filterPayload(filters) {
	const payload = { ...filters };
	if (filters.period !== "custom") {
		delete payload.from;
		delete payload.to;
	}
	return payload;
}

export default function AtivacoesPage() {
	const { hasPermission } = useRotAuth();
	const location = useLocation();
	const canSync = hasPermission("ativacoes.sincronizar");
	const canExport = hasPermission("ativacoes.exportar");
	const [tab, setTab] = useState("dashboard");
	const [filters, setFilters] = useState({ period: "last7", from: todayIso(), to: todayIso(), orderTypeId: "", status: "", technicianId: "", companyId: "", regionalId: "", cityId: "", brand: "", technicianIdentified: "" });
	const [filterOptions, setFilterOptions] = useState(null);
	const [dashboard, setDashboard] = useState(null);
	const [kanban, setKanban] = useState(null);
	const [detail, setDetail] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [syncJob, setSyncJob] = useState(null);

	const effectiveFilters = useMemo(() => filterPayload(filters), [filters]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.get("tab") === "kanban") setTab("kanban");
	}, [location.search]);

	async function load() {
		setLoading(true);
		setError("");
		try {
			const [filtersData, dashboardData, kanbanData] = await Promise.all([
				filterOptions ? Promise.resolve({ filters: filterOptions }) : fetchAtivacoesFilters(),
				fetchAtivacoesDashboard(effectiveFilters),
				fetchAtivacoesKanban({ ...effectiveFilters, limit: 500 }),
			]);
			setFilterOptions(filtersData.filters);
			setDashboard(dashboardData);
			setKanban(kanbanData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar ativações.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [JSON.stringify(effectiveFilters)]);

	async function openDetail(id) {
		setDetail({ loading: true });
		try {
			const data = await fetchAtivacaoDetail(id);
			setDetail({ loading: false, item: data.item });
		} catch (err) {
			setDetail({ loading: false, error: err?.message || "Não foi possível abrir a O.S." });
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

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div className="flex min-w-0 items-start gap-4">
						<span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<Rocket size={26} />
						</span>
						<div className="min-w-0">
							<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Operação &gt; Ativações</p>
							<h1 className="mt-1 text-3xl font-black text-slate-950">Ativações</h1>
							<p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
								Kanban e indicadores baseados nos snapshots HubSoft já sincronizados no banco da Operação.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						{canExport ? (
							<a href={ativacoesExportUrl(effectiveFilters)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
								<Download size={17} /> Exportar CSV
							</a>
						) : null}
						{canSync ? (
							<button type="button" onClick={triggerSync} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">
								<RefreshCw size={17} /> Atualizar agora
							</button>
						) : null}
					</div>
				</div>
				<div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[1.3fr_0.7fr]">
					<Filters filters={filters} setFilters={setFilters} options={filterOptions} />
					<div className="rounded-2xl border border-slate-200 bg-white p-4">
						<p className="text-xs font-black uppercase text-slate-500">Estado da sincronização</p>
						<p className="mt-2 text-sm font-bold text-slate-900">{latestSync?.status || "Sem execução registrada"}</p>
						<p className="mt-1 text-xs font-semibold text-slate-500">
							Última: {formatDateTime(latestSync?.finished_at || latestSync?.started_at || latestSync?.created_at)}
						</p>
						<p className="mt-2 text-xs font-semibold text-slate-500">
							Registros: {latestSync?.records_found ?? "-"} · Novos {latestSync?.records_inserted ?? "-"} · Atualizados {latestSync?.records_updated ?? "-"}
						</p>
						{syncJob ? <p className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Job: {syncJob.status}{syncJob.error ? ` · ${syncJob.error}` : ""}</p> : null}
					</div>
				</div>
			</section>

			{error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			{loading && !dashboard ? <Spinner fullScreen /> : null}

			<div className="flex gap-2">
				<button type="button" onClick={() => setTab("dashboard")} className={`rounded-2xl px-4 py-2 text-sm font-black ${tab === "dashboard" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>Visão Geral</button>
				<button type="button" onClick={() => setTab("kanban")} className={`rounded-2xl px-4 py-2 text-sm font-black ${tab === "kanban" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>Kanban</button>
			</div>

			{tab === "dashboard" ? <DashboardView data={dashboard} /> : <KanbanView data={kanban} onOpen={openDetail} />}

			{detail ? <ActivationDetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
		</div>
	);
}

function Filters({ filters, setFilters, options }) {
	const setField = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
	return (
		<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
			<Select label="Período" value={filters.period} onChange={(v) => setField("period", v)} options={PERIODS} />
			{filters.period === "custom" ? (
				<>
					<Field label="De" type="date" value={filters.from} onChange={(v) => setField("from", v)} />
					<Field label="Até" type="date" value={filters.to} onChange={(v) => setField("to", v)} />
				</>
			) : null}
			<Select label="Tipo OS" value={filters.orderTypeId} onChange={(v) => setField("orderTypeId", v)} options={(options?.orderTypes || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
			<Select label="Status" value={filters.status} onChange={(v) => setField("status", v)} options={[{ id: "pendente", label: "Pendente" }, { id: "aguardando_agendamento", label: "Aguard. agendamento" }, { id: "aguardando_aprovacao", label: "Aguard. aprovação" }, { id: "finalizado", label: "Finalizado" }]} allowAll />
			<Select label="Técnico" value={filters.technicianId} onChange={(v) => setField("technicianId", v)} options={(options?.technicians || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
			<Select label="Empresa" value={filters.companyId} onChange={(v) => setField("companyId", v)} options={(options?.companies || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
			<Select label="Regional" value={filters.regionalId} onChange={(v) => setField("regionalId", v)} options={(options?.regionals || []).map((item) => ({ id: item.id, label: item.name }))} allowAll />
			<Select label="Cidade" value={filters.cityId} onChange={(v) => setField("cityId", v)} options={(options?.cities || []).filter((item) => !filters.regionalId || item.regionalId === filters.regionalId).map((item) => ({ id: item.id, label: item.name }))} allowAll />
			<Select label="Marca" value={filters.brand} onChange={(v) => setField("brand", v)} options={(options?.brands || []).map((item) => ({ id: item, label: item }))} allowAll />
			<Select label="Técnico identificado" value={filters.technicianIdentified} onChange={(v) => setField("technicianIdentified", v)} options={[{ id: "yes", label: "Com técnico" }, { id: "no", label: "Sem técnico" }]} allowAll />
		</div>
	);
}

function Field({ label, type = "text", value, onChange }) {
	return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500" /></label>;
}

function Select({ label, value, onChange, options, allowAll = false }) {
	return <label className="grid gap-1 text-xs font-black uppercase text-slate-500">{label}<select value={value || ""} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500">{allowAll ? <option value="">Todos</option> : null}{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
}

function DashboardView({ data }) {
	const summary = data?.summary || {};
	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				{SUMMARY_CARDS.map(([key, label, Icon]) => (
					<div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="mb-3 flex items-start justify-between gap-3">
							<p className="text-xs font-black uppercase text-slate-500">{label}</p>
							<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={18} /></span>
						</div>
						<p className="text-3xl font-black text-slate-950">{summary[key] ?? 0}</p>
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
