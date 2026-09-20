import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, CalendarRange, ChevronDown, ChevronUp, ClipboardList, Download, FileText, RefreshCw, Search, ShieldCheck, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import {
	fetchSstReportsActionPlans, fetchSstReportsDetails, fetchSstReportsDistribution,
	fetchSstReportsOccurrences, fetchSstReportsSummary, fetchSstReportsTimeline, fetchSstReportsWorkload, fetchSstTeam,
} from "../../api/rotApi";
import Field from "../../components/ui/Field";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS, statusLabel, typeLabel } from "./SstProtocolsPage";
import { exportSstReports } from "../../utils/exportSstReports";

const OPERATION_OPTIONS = [{ id: "ROT", name: "ROT" }, { id: "FIELD", name: "FIELD" }, { id: "DELIVERY", name: "DELIVERY" }];
const CONSEQUENCE_LABELS = { queda: "Queda", choque_eletrico: "Choque elétrico", atropelamento: "Atropelamento", colisao: "Colisão", queda_objeto: "Queda de objeto", dano_material: "Dano material", exposicao: "Exposição", lesao_potencial: "Lesão potencial", outro: "Outro", nao_informado: "Não informado" };
const ACTION_STATUS_LABELS = { ABERTO: "Aberto", EM_ANDAMENTO: "Em andamento", AGUARDANDO_VALIDACAO: "Aguardando validação", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };

function toISODate(date) {
	return date.toISOString().slice(0, 10);
}

function startOfMonth(date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

const PERIOD_PRESETS = [
	{ id: "today", label: "Hoje", range: () => { const now = new Date(); return [toISODate(now), toISODate(now)]; } },
	{ id: "7d", label: "Últimos 7 dias", range: () => { const now = new Date(); return [toISODate(new Date(now.getTime() - 6 * 86400000)), toISODate(now)]; } },
	{ id: "30d", label: "Últimos 30 dias", range: () => { const now = new Date(); return [toISODate(new Date(now.getTime() - 29 * 86400000)), toISODate(now)]; } },
	{ id: "this_month", label: "Este mês", range: () => { const now = new Date(); return [toISODate(startOfMonth(now)), toISODate(now)]; } },
	{ id: "last_month", label: "Mês anterior", range: () => { const now = new Date(); const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1); return [toISODate(lastMonthStart), toISODate(lastMonthEnd)]; } },
	{ id: "3m", label: "Últimos 3 meses", range: () => { const now = new Date(); return [toISODate(new Date(now.getFullYear(), now.getMonth() - 2, 1)), toISODate(now)]; } },
	{ id: "6m", label: "Últimos 6 meses", range: () => { const now = new Date(); return [toISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1)), toISODate(now)]; } },
	{ id: "this_year", label: "Este ano", range: () => { const now = new Date(); return [toISODate(new Date(now.getFullYear(), 0, 1)), toISODate(now)]; } },
	{ id: "last_year", label: "Ano anterior", range: () => { const now = new Date(); return [toISODate(new Date(now.getFullYear() - 1, 0, 1)), toISODate(new Date(now.getFullYear() - 1, 11, 31))]; } },
];

const DEFAULT_PRESET = "30d";

function formatMinutes(minutes) {
	if (minutes === null || minutes === undefined) return "Sem dados";
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (h <= 0) return `${m}min`;
	return `${h}h ${String(m).padStart(2, "0")}min`;
}

function formatPct(value) {
	if (value === null || value === undefined) return "Sem dados";
	return `${String(value).replace(".", ",")}%`;
}

function formatBucketLabel(bucket, granularity) {
	const date = new Date(bucket);
	if (granularity === "day") return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
	if (granularity === "week") return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
	return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

// Reduz quantos labels de data aparecem no eixo X sem descartar nenhum
// ponto/barra do grafico — so os TEXTOS ficam esparsos. Evita o eixo
// virar uma sopa de datas sobrepostas em periodos longos (ex.: 30 dias
// de granularidade diaria = 30 labels, ilegivel).
function pickTickIndices(length, maxTicks = 8) {
	const indices = new Set();
	if (length <= 0) return indices;
	if (length <= maxTicks) {
		for (let i = 0; i < length; i += 1) indices.add(i);
		return indices;
	}
	const stride = Math.ceil(length / maxTicks);
	for (let i = 0; i < length; i += stride) indices.add(i);
	indices.add(length - 1);
	return indices;
}

function Delta({ deltaPct }) {
	if (deltaPct === null || deltaPct === undefined) return null;
	const Icon = deltaPct >= 0 ? TrendingUp : TrendingDown;
	return (
		<span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
			<Icon size={12} /> {deltaPct >= 0 ? "+" : ""}{String(deltaPct).replace(".", ",")}% vs período anterior
		</span>
	);
}

function KpiCard({ label, value, hint, deltaPct }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
			<p className="mt-2 text-4xl font-black leading-none text-slate-950">{value}</p>
			{hint ? <p className="mt-2 text-xs font-semibold text-slate-400">{hint}</p> : null}
			<Delta deltaPct={deltaPct} />
		</div>
	);
}

function SectionCard({ title, icon: Icon, action, children, error, onRetry }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					{Icon ? <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Icon size={18} /></span> : null}
					<h2 className="text-base font-black text-slate-950">{title}</h2>
				</div>
				{action}
			</div>
			{error ? (
				<div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
					<span className="flex items-center gap-1"><AlertTriangle size={13} /> {error}</span>
					{onRetry ? <button type="button" onClick={onRetry} className="rounded-lg border border-red-300 px-2 py-1 text-[11px] font-black hover:bg-red-100">Tentar novamente</button> : null}
				</div>
			) : children}
		</section>
	);
}

// Grafico de barras duplo (aberto x concluido) em SVG puro — o app nao
// tem lib de graficos instalada; construir um componente leve em vez de
// adicionar uma dependencia pesada so pra isso.
function DualBarChart({ opened, closed, granularity }) {
	const buckets = useMemo(() => {
		const map = new Map();
		for (const row of opened) map.set(row.bucket, { bucket: row.bucket, opened: row.count, closed: 0 });
		for (const row of closed) {
			const entry = map.get(row.bucket) || { bucket: row.bucket, opened: 0, closed: 0 };
			entry.closed = row.count;
			map.set(row.bucket, entry);
		}
		return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
	}, [opened, closed]);

	if (!buckets.length) return <p className="py-10 text-center text-sm font-bold text-slate-400">Nenhum protocolo encontrado para o período selecionado.</p>;

	const max = Math.max(1, ...buckets.map((b) => Math.max(b.opened, b.closed)));
	const barGroupWidth = 100 / buckets.length;
	const tickIndices = pickTickIndices(buckets.length, 9);

	return (
		<div>
			<div className="flex items-center gap-4 text-xs font-bold text-slate-500">
				<span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Abertos</span>
				<span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Concluídos</span>
			</div>
			<div className="mt-3 flex items-end gap-1" style={{ height: 300 }}>
				{buckets.map((b, i) => (
					<div key={b.bucket} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ maxWidth: `${barGroupWidth}%` }}>
						<div className="flex w-full items-end justify-center gap-0.5" style={{ height: 240 }}>
							<div className="w-3 rounded-t bg-orange-500" style={{ height: `${(b.opened / max) * 100}%` }} title={`Abertos: ${b.opened}`} />
							<div className="w-3 rounded-t bg-blue-500" style={{ height: `${(b.closed / max) * 100}%` }} title={`Concluídos: ${b.closed}`} />
						</div>
						<span className="whitespace-nowrap text-[10px] font-black text-slate-400">{tickIndices.has(i) ? formatBucketLabel(b.bucket, granularity) : ""}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function LineChart({ data, granularity, valueKey = "count", color = "#ea580c", formatValue = (v) => v, emptyMessage = "Nenhum dado encontrado para o período selecionado." }) {
	if (!data.length) return <p className="py-10 text-center text-sm font-bold text-slate-400">{emptyMessage}</p>;
	const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
	const width = 600;
	const height = 220;
	const stepX = data.length > 1 ? width / (data.length - 1) : 0;
	const points = data.map((d, i) => {
		const x = data.length > 1 ? i * stepX : width / 2;
		const y = height - (Number(d[valueKey]) / max) * (height - 30) - 16;
		return { x, y, raw: d };
	});
	const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
	const tickIndices = pickTickIndices(points.length, 8);

	return (
		<svg viewBox={`0 0 ${width} ${height + 26}`} className="w-full" preserveAspectRatio="none" style={{ height: 260 }}>
			<path d={path} fill="none" stroke={color} strokeWidth="2.5" />
			{points.map((p, i) => (
				<g key={i}>
					<circle cx={p.x} cy={p.y} r={tickIndices.has(i) ? 3.5 : 2} fill={color}>
						<title>{`${formatBucketLabel(p.raw.bucket, granularity)}: ${formatValue(p.raw[valueKey])}`}</title>
					</circle>
					{tickIndices.has(i) ? (
						<>
							<text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill="#475569">{formatValue(p.raw[valueKey])}</text>
							<text x={p.x} y={height + 20} textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8">{formatBucketLabel(p.raw.bucket, granularity)}</text>
						</>
					) : null}
				</g>
			))}
		</svg>
	);
}

function BarList({ items, labelFor = (k) => k, onSelect, activeKey }) {
	const filtered = (items || []).filter((item) => item.key !== null);
	if (!filtered.length) return <p className="py-4 text-center text-sm font-bold text-slate-400">Sem dados.</p>;
	const max = Math.max(1, ...filtered.map((i) => i.count));
	const total = filtered.reduce((sum, i) => sum + i.count, 0);
	return (
		<div className="space-y-2">
			{filtered.map((item) => {
				const pct = total ? Math.round((item.count / total) * 1000) / 10 : 0;
				const active = activeKey && String(activeKey) === String(item.key);
				return (
					<button
						type="button"
						key={String(item.key)}
						onClick={() => onSelect?.(item.key)}
						className={`block w-full rounded-lg px-1 py-1 text-left transition ${onSelect ? "hover:bg-slate-50" : "cursor-default"} ${active ? "bg-orange-50" : ""}`}
					>
						<div className="flex items-center justify-between text-xs font-bold text-slate-700">
							<span className="truncate">{labelFor(item.label ?? item.key)}</span>
							<span className="shrink-0 text-slate-400">{item.count} · {pct}%</span>
						</div>
						<div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
							<div className={`h-full rounded-full ${active ? "bg-orange-600" : "bg-orange-400"}`} style={{ width: `${(item.count / max) * 100}%` }} />
						</div>
					</button>
				);
			})}
		</div>
	);
}

const DISTRIBUTION_DIMENSIONS = [
	{ id: "type", label: "Tipo", dataKey: "byType", filterKey: "type", labelFor: typeLabel },
	{ id: "status", label: "Status", dataKey: "byStatus", filterKey: "status", labelFor: statusLabel },
	{ id: "priority", label: "Prioridade", dataKey: "byPriority", filterKey: "priority", labelFor: (k) => k },
	{ id: "operation", label: "Operação", dataKey: "byOperation", filterKey: "operationScope", labelFor: (k) => k },
	{ id: "regional", label: "Regional", dataKey: "byRegional", filterKey: "regionalId", labelFor: (k) => k },
	{ id: "base", label: "Base", dataKey: "byBase", filterKey: "baseId", labelFor: (k) => k },
	{ id: "company", label: "Empresa", dataKey: "byCompany", filterKey: "companyId", labelFor: (k) => k },
];

// Barras horizontais maiores pra Distribuicao (secao 23 do pedido de UX):
// uma dimensao por vez, mais legivel que 7 listas espremidas lado a lado.
function BigBarList({ items, labelFor = (k) => k, onSelect, activeKey, emptyMessage = "Sem dados." }) {
	const filtered = (items || []).filter((item) => item.key !== null && item.key !== undefined);
	if (!filtered.length) return <p className="py-10 text-center text-sm font-bold text-slate-400">{emptyMessage}</p>;
	const max = Math.max(1, ...filtered.map((i) => i.count));
	return (
		<div className="space-y-3">
			{filtered.map((item) => {
				const active = activeKey && String(activeKey) === String(item.key);
				return (
					<button
						type="button"
						key={String(item.key)}
						onClick={() => onSelect?.(item.key)}
						className={`block w-full rounded-xl px-2 py-1.5 text-left transition ${onSelect ? "hover:bg-slate-50" : "cursor-default"} ${active ? "bg-orange-50" : ""}`}
					>
						<div className="flex items-center justify-between text-sm font-bold text-slate-700">
							<span className="truncate">{labelFor(item.label ?? item.key)}</span>
							<span className="shrink-0 font-black text-slate-500">{item.count}</span>
						</div>
						<div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
							<div className={`h-full rounded-full ${active ? "bg-orange-600" : "bg-orange-400"}`} style={{ width: `${(item.count / max) * 100}%` }} />
						</div>
					</button>
				);
			})}
		</div>
	);
}

export default function SstReportsPage() {
	const { hasPermission, user } = useRotAuth();
	const navigate = useNavigate();
	const canExport = hasPermission("sst.relatorio.exportar");

	const [preset, setPreset] = useState(DEFAULT_PRESET);
	const [customFrom, setCustomFrom] = useState("");
	const [customTo, setCustomTo] = useState("");
	const [extraFilters, setExtraFilters] = useState({ operationScope: "", regionalId: "", baseId: "", companyId: "", type: "", status: "", priority: "", assignedTo: "" });
	const [team, setTeam] = useState([]);
	const [distDimension, setDistDimension] = useState("regional");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const activeDimension = DISTRIBUTION_DIMENSIONS.find((d) => d.id === distDimension) || DISTRIBUTION_DIMENSIONS[0];

	const [summary, setSummary] = useState({ data: null, loading: true, error: "" });
	const [timeline, setTimeline] = useState({ data: null, loading: true, error: "" });
	const [distribution, setDistribution] = useState({ data: null, loading: true, error: "" });
	const [occurrences, setOccurrences] = useState({ data: null, loading: true, error: "" });
	const [actionPlans, setActionPlans] = useState({ data: null, loading: true, error: "" });
	const [workload, setWorkload] = useState({ data: null, loading: true, error: "" });

	const [details, setDetails] = useState({ items: [], total: 0, totalPages: 1, loading: true, error: "" });
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [sort, setSort] = useState({ col: "createdAt", dir: "desc" });
	const [exporting, setExporting] = useState("");

	const [dateFrom, dateTo] = useMemo(() => {
		if (preset === "custom") return [customFrom, customTo];
		const found = PERIOD_PRESETS.find((p) => p.id === preset) || PERIOD_PRESETS.find((p) => p.id === DEFAULT_PRESET);
		return found.range();
	}, [preset, customFrom, customTo]);

	const baseFilters = useMemo(() => ({ dateFrom, dateTo, ...extraFilters }), [dateFrom, dateTo, extraFilters]);
	const filtersKey = JSON.stringify(baseFilters);

	const activeFilterCount = Object.values(extraFilters).filter(Boolean).length + (preset !== DEFAULT_PRESET ? 1 : 0);

	useEffect(() => {
		fetchSstTeam().then(setTeam).catch(() => setTeam([]));
	}, []);

	const loadSection = useCallback(async (setState, fetchFn) => {
		setState((s) => ({ ...s, loading: true, error: "" }));
		try {
			const data = await fetchFn(baseFilters);
			setState({ data, loading: false, error: "" });
		} catch (err) {
			setState((s) => ({ ...s, loading: false, error: err?.message || "Não foi possível carregar." }));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filtersKey]);

	const reloadAll = useCallback(() => {
		loadSection(setSummary, fetchSstReportsSummary);
		loadSection(setTimeline, fetchSstReportsTimeline);
		loadSection(setDistribution, fetchSstReportsDistribution);
		loadSection(setOccurrences, fetchSstReportsOccurrences);
		loadSection(setActionPlans, fetchSstReportsActionPlans);
		loadSection(setWorkload, fetchSstReportsWorkload);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadSection]);

	useEffect(() => { reloadAll(); }, [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => { setPage(1); }, [filtersKey, search]);

	useEffect(() => {
		let cancelled = false;
		setDetails((d) => ({ ...d, loading: true, error: "" }));
		fetchSstReportsDetails({ ...baseFilters, q: search, page, pageSize: 25, sort: sort.col, dir: sort.dir })
			.then((data) => { if (!cancelled) setDetails({ items: data.items, total: data.total, totalPages: data.totalPages, loading: false, error: "" }); })
			.catch((err) => { if (!cancelled) setDetails((d) => ({ ...d, loading: false, error: err?.message || "Não foi possível carregar a tabela." })); });
		return () => { cancelled = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filtersKey, search, page, sort]);

	const setFilter = (key, value) => setExtraFilters((f) => ({ ...f, [key]: value }));
	const clearFilters = () => { setPreset(DEFAULT_PRESET); setExtraFilters({ operationScope: "", regionalId: "", baseId: "", companyId: "", type: "", status: "", priority: "", assignedTo: "" }); };

	const doExport = async (format) => {
		if (exporting) return;
		setExporting(format);
		try {
			await exportSstReports(format, {
				period: { from: dateFrom, to: dateTo },
				filters: extraFilters,
				summary: summary.data, timeline: timeline.data, distribution: distribution.data,
				occurrences: occurrences.data, actionPlans: actionPlans.data, workload: workload.data,
				details: details.items,
			});
		} catch (err) {
			window.alert(err?.message || "Não foi possível gerar o relatório.");
		} finally {
			setExporting("");
		}
	};

	const regionalOptions = (distribution.data?.byRegional || []).filter((r) => r.key).map((r) => ({ id: r.key, name: `${r.label || r.key} (${r.count})` }));
	const baseOptions = (distribution.data?.byBase || []).filter((r) => r.key).map((r) => ({ id: r.key, name: `${r.label || r.key} (${r.count})` }));
	const companyOptions = (distribution.data?.byCompany || []).filter((r) => r.key).map((r) => ({ id: r.key, name: `${r.label || r.key} (${r.count})` }));
	const teamOptions = team.map((t) => ({ id: t.id, name: t.name }));

	if (!hasPermission("sst.relatorio.visualizar")) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
				<ShieldCheck size={32} className="text-slate-300" />
				<p className="text-sm font-bold text-slate-500">Você não tem acesso aos Relatórios de Segurança do Trabalho.</p>
			</div>
		);
	}

	const kpis = summary.data?.kpis;

	return (
		<div className="space-y-5 pb-10">
			<header className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><BarChart3 size={22} /></span>
					<div>
						<h1 className="text-xl font-black text-slate-950">Relatórios SST</h1>
						<p className="text-sm font-semibold text-slate-500">Indicadores, tendências e resultados das tratativas de Segurança do Trabalho.</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button type="button" onClick={reloadAll} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw size={15} /> Atualizar</button>
					{canExport ? (
						<>
							<button type="button" disabled={!!exporting} onClick={() => doExport("pdf")} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"><FileText size={15} /> {exporting === "pdf" ? "Gerando..." : "Exportar PDF"}</button>
							<button type="button" disabled={!!exporting} onClick={() => doExport("docx")} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Download size={15} /> {exporting === "docx" ? "Gerando..." : "Exportar DOCX"}</button>
						</>
					) : null}
				</div>
			</header>

			<section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
				<button type="button" onClick={() => setFiltersOpen((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-4 text-left">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs font-black uppercase tracking-wide text-slate-400">Filtros</span>
						<span className="flex items-center gap-1 text-xs font-black text-slate-500"><CalendarRange size={14} /> {new Date(`${dateFrom}T00:00:00`).toLocaleDateString("pt-BR")} → {new Date(`${dateTo}T00:00:00`).toLocaleDateString("pt-BR")}</span>
						{activeFilterCount > 0 ? <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-black text-orange-700">{activeFilterCount} filtro(s) ativo(s)</span> : null}
					</div>
					<span className="flex items-center gap-2">
						{activeFilterCount > 0 ? (
							<span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); clearFilters(); }} onKeyDown={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] font-black text-slate-500 hover:text-slate-700"><X size={12} /> Limpar filtros</span>
						) : null}
						{filtersOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
					</span>
				</button>
				{filtersOpen ? (
				<div className="border-t border-slate-100 px-5 pb-5 pt-4">
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					<Field label="Período"><Select value={preset} onChange={setPreset} items={[...PERIOD_PRESETS.map((p) => ({ id: p.id, name: p.label })), { id: "custom", name: "Personalizado" }]} /></Field>
					{preset === "custom" ? (
						<>
							<Field label="De"><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rot-input h-10" /></Field>
							<Field label="Até"><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rot-input h-10" /></Field>
						</>
					) : null}
					<Field label="Operação"><Select value={extraFilters.operationScope} onChange={(v) => setFilter("operationScope", v)} items={OPERATION_OPTIONS} empty="Todas" /></Field>
					<Field label="Regional"><Select value={extraFilters.regionalId} onChange={(v) => setFilter("regionalId", v)} items={regionalOptions} empty="Todas" /></Field>
					<Field label="Base"><Select value={extraFilters.baseId} onChange={(v) => setFilter("baseId", v)} items={baseOptions} empty="Todas" /></Field>
					<Field label="Empresa"><Select value={extraFilters.companyId} onChange={(v) => setFilter("companyId", v)} items={companyOptions} empty="Todas" /></Field>
				</div>
				<div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
					<Field label="Tipo"><Select value={extraFilters.type} onChange={(v) => setFilter("type", v)} items={TYPE_OPTIONS} empty="Todos" /></Field>
					<Field label="Status"><Select value={extraFilters.status} onChange={(v) => setFilter("status", v)} items={STATUS_OPTIONS} empty="Todos" /></Field>
					<Field label="Prioridade"><Select value={extraFilters.priority} onChange={(v) => setFilter("priority", v)} items={PRIORITY_OPTIONS} empty="Todas" /></Field>
					<Field label="Responsável SST"><Select value={extraFilters.assignedTo} onChange={(v) => setFilter("assignedTo", v)} items={teamOptions} empty="Todos" /></Field>
				</div>
				</div>
				) : null}
			</section>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{summary.loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />) : summary.error ? (
					<div className="sm:col-span-2 xl:col-span-3"><SectionCard title="Resumo executivo" error={summary.error} onRetry={() => loadSection(setSummary, fetchSstReportsSummary)} /></div>
				) : (
					<>
						<KpiCard label="Protocolos abertos" value={kpis.opened.value} hint="Criados no período selecionado" deltaPct={kpis.opened.deltaPct} />
						<KpiCard label="Concluídos" value={kpis.closed.value} hint="Concluídos dentro do período" deltaPct={kpis.closed.deltaPct} />
						<KpiCard label="Em tratativa" value={kpis.inProgress.value} hint="Protocolos ainda não concluídos (agora)" />
						<KpiCard label="SLA cumprido" value={formatPct(kpis.slaCompliancePct.value)} hint="Concluídos dentro do prazo por prioridade" deltaPct={kpis.slaCompliancePct.deltaPct} />
						<KpiCard label="Tempo médio de tratativa" value={formatMinutes(kpis.avgResolutionMinutes.value)} hint="Entre abertura e conclusão" deltaPct={kpis.avgResolutionMinutes.deltaPct} />
						<KpiCard label="Ações vencidas" value={kpis.overdueActions.value} hint="Planos de ação com prazo vencido (agora)" />
					</>
				)}
			</section>

			<div>
				<h2 className="mb-3 text-lg font-black text-slate-950">Evolução das tratativas</h2>
				<div className="grid gap-4 xl:grid-cols-2">
					<SectionCard title="Protocolos abertos x concluídos" icon={BarChart3} error={timeline.error} onRetry={() => loadSection(setTimeline, fetchSstReportsTimeline)}>
						<p className="mb-2 text-xs font-semibold text-slate-400">Comparação entre entradas e encerramentos no período.</p>
						{timeline.loading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : <DualBarChart opened={timeline.data?.opened || []} closed={timeline.data?.closed || []} granularity={timeline.data?.granularity} />}
					</SectionCard>
					<SectionCard title="Backlog SST" icon={ClipboardList} error={timeline.error} onRetry={() => loadSection(setTimeline, fetchSstReportsTimeline)}>
						<p className="mb-2 text-xs font-semibold text-slate-400">Protocolos ainda não concluídos no encerramento de cada período.</p>
						{timeline.loading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : <LineChart data={timeline.data?.backlog || []} granularity={timeline.data?.granularity} color="#7c3aed" emptyMessage="Nenhum protocolo em aberto no período selecionado." />}
					</SectionCard>
				</div>
			</div>

			<SectionCard title="Ocorrências no período" icon={AlertTriangle} error={occurrences.error} onRetry={() => loadSection(setOccurrences, fetchSstReportsOccurrences)}>
				{occurrences.loading ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" /> : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
							<div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black text-slate-950">{occurrences.data.nearMiss.total}</p><p className="text-[11px] font-bold text-slate-500">Quase acidentes</p></div>
							<div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black text-slate-950">{occurrences.data.accidentsIncidents.byType.find((i) => i.key === "acidente")?.count || 0}</p><p className="text-[11px] font-bold text-slate-500">Acidentes</p></div>
							<div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black text-slate-950">{occurrences.data.accidentsIncidents.byType.find((i) => i.key === "incidente")?.count || 0}</p><p className="text-[11px] font-bold text-slate-500">Incidentes</p></div>
							<div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black text-slate-950">{occurrences.data.deviations.total}</p><p className="text-[11px] font-bold text-slate-500">Desvios</p></div>
							<div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black text-slate-950">{occurrences.data.inspections.total}</p><p className="text-[11px] font-bold text-slate-500">Não conformidades</p></div>
						</div>
						<p className="mt-2 text-[11px] font-semibold text-slate-400">{occurrences.data.deviations.withActionPlan} desvio(s) geraram plano de ação.</p>
						{occurrences.data.nearMiss.total > 0 ? (
							<div className="mt-4 border-t border-slate-100 pt-4">
								<p className="mb-2 text-xs font-black uppercase text-slate-400">Quase acidentes por potencial de consequência</p>
								<BarList items={occurrences.data.nearMiss.byConsequence} labelFor={(k) => CONSEQUENCE_LABELS[k] || k} />
							</div>
						) : (
							<p className="mt-4 border-t border-slate-100 pt-4 text-sm font-bold text-slate-400">Nenhum quase acidente registrado no período.</p>
						)}
						{occurrences.data.inspections.total > 0 ? (
							<div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
								{occurrences.data.inspections.byStatus.map((s) => (
									<span key={s.key} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{statusLabel(s.key)}: {s.count}</span>
								))}
							</div>
						) : null}
					</>
				)}
			</SectionCard>

			<div className="grid gap-4 xl:grid-cols-2">
				<SectionCard title="Eficiência das tratativas" icon={ShieldCheck} error={summary.error}>
					{summary.loading ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" /> : (
						<div className="grid grid-cols-3 gap-3">
							<div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-950">{formatPct(kpis.slaCompliancePct.value)}</p><p className="mt-1 text-[11px] font-bold text-slate-500">SLA cumprido</p></div>
							<div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-950">{formatMinutes(kpis.avgFirstResponseMinutes.value)}</p><p className="mt-1 text-[11px] font-bold text-slate-500">1ª resposta (média)</p></div>
							<div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-950">{formatMinutes(kpis.avgResolutionMinutes.value)}</p><p className="mt-1 text-[11px] font-bold text-slate-500">Conclusão (média)</p></div>
						</div>
					)}
					<p className="mt-3 text-[11px] font-semibold text-slate-400">SLA cumprido: protocolos concluídos dentro do prazo definido por prioridade (crítica 4h · alta 24h · média 72h · baixa 120h).</p>
					{!timeline.loading && timeline.data?.sla?.length ? <div className="mt-3"><LineChart data={timeline.data.sla} granularity={timeline.data.granularity} valueKey="compliancePct" color="#0284c7" formatValue={(v) => `${v}%`} emptyMessage="Não há dados suficientes para calcular o SLA no período." /></div> : null}
				</SectionCard>

				<SectionCard title="Planos de ação" icon={ClipboardList} error={actionPlans.error} onRetry={() => loadSection(setActionPlans, fetchSstReportsActionPlans)}>
					{actionPlans.loading ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" /> : (
						<>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								<div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-950">{actionPlans.data.created}</p><p className="mt-1 text-[11px] font-bold text-slate-500">Criados</p></div>
								<div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-950">{actionPlans.data.completed}</p><p className="mt-1 text-[11px] font-bold text-slate-500">Concluídos</p></div>
								<div className="rounded-xl bg-red-50 p-4 text-center"><p className="text-2xl font-black text-red-700">{actionPlans.data.overdue}</p><p className="mt-1 text-[11px] font-bold text-red-500">Vencidos</p></div>
								<div className="rounded-xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-950">{formatPct(actionPlans.data.onTimeCompletionPct)}</p><p className="mt-1 text-[11px] font-bold text-slate-500">No prazo</p></div>
							</div>
							<div className="mt-3 flex flex-wrap gap-2">
								{actionPlans.data.byStatus.map((s) => (
									<span key={s.key} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{ACTION_STATUS_LABELS[s.key] || s.key}: {s.count}</span>
								))}
							</div>
						</>
					)}
				</SectionCard>
			</div>

			<SectionCard
				title="Distribuição dos protocolos"
				icon={BarChart3}
				error={distribution.error}
				onRetry={() => loadSection(setDistribution, fetchSstReportsDistribution)}
				action={
					<select value={distDimension} onChange={(e) => setDistDimension(e.target.value)} className="rot-input h-9 w-40 text-xs">
						{DISTRIBUTION_DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
					</select>
				}
			>
				{distribution.loading ? <div className="h-56 animate-pulse rounded-xl bg-slate-100" /> : (
					<BigBarList
						items={distribution.data[activeDimension.dataKey]}
						labelFor={activeDimension.labelFor}
						onSelect={(k) => setFilter(activeDimension.filterKey, k)}
						activeKey={extraFilters[activeDimension.filterKey]}
						emptyMessage={`Sem dados de distribuição por ${activeDimension.label.toLowerCase()} no período.`}
					/>
				)}
			</SectionCard>

			<SectionCard title="Carga operacional SST" icon={Users} error={workload.error} onRetry={() => loadSection(setWorkload, fetchSstReportsWorkload)}>
				<p className="mb-3 text-xs font-semibold text-slate-400">Distribuição das tratativas atualmente atribuídas.</p>
				{workload.loading ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" /> : !workload.data.items.length ? (
					<p className="py-6 text-center text-sm font-bold text-slate-400">Não existem protocolos atribuídos aos responsáveis SST nos filtros selecionados.</p>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{workload.data.items.map((item) => (
							<div key={item.user_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
								<p className="truncate text-sm font-black text-slate-900">{item.name || "—"}</p>
								<div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold text-slate-500">
									<span>Abertos: {item.open_count}</span>
									<span>Em análise: {item.in_analysis}</span>
									<span>Aguard. info: {item.awaiting_info}</span>
									<span>Concluídos: {item.completed}</span>
								</div>
							</div>
						))}
					</div>
				)}
			</SectionCard>

			<SectionCard
				title="Dados detalhados"
				icon={FileText}
				error={details.error}
				action={<div className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar protocolo, colaborador, base, empresa..." style={{ paddingLeft: "2rem" }} className="rot-input h-9 w-72 text-xs" /></div>}
			>
				<p className="mb-3 text-xs font-semibold text-slate-400">Protocolos considerados nesta análise.</p>
				{details.loading ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : !details.items.length ? (
					<div className="flex flex-col items-center gap-2 py-10 text-center">
						<FileText size={26} className="text-slate-300" />
						<p className="text-sm font-bold text-slate-500">Nenhum protocolo encontrado.</p>
						<p className="text-xs font-semibold text-slate-400">Altere os filtros ou o período para visualizar registros.</p>
						{activeFilterCount > 0 ? <button type="button" onClick={clearFilters} className="mt-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">Limpar filtros</button> : null}
					</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full min-w-[900px] text-left text-xs">
								<thead>
									<tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400">
										{[["protocolNumber", "Protocolo"], ["createdAt", "Abertura"], ["type", "Tipo"], ["status", "Status"], ["priority", "Prioridade"], [null, "Responsável"], [null, "Regional/Base"], [null, "1ª resposta"], [null, "Tratativa"], [null, "SLA"], ["closedAt", "Conclusão"]].map(([key, label]) => (
											<th key={label} className={`whitespace-nowrap px-2 py-2 ${key ? "cursor-pointer select-none hover:text-slate-600" : ""}`} onClick={key ? () => setSort((s) => ({ col: key, dir: s.col === key && s.dir === "desc" ? "asc" : "desc" })) : undefined}>
												{label}{sort.col === key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{details.items.map((row) => (
										<tr key={row.id} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50" onClick={() => navigate(`/seguranca-trabalho/protocolos/${row.id}`)}>
											<td className="whitespace-nowrap px-2 py-2 font-black text-orange-700">{row.protocolNumber}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-500">{new Date(row.createdAt).toLocaleDateString("pt-BR")}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-700">{typeLabel(row.type)}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-700">{statusLabel(row.status)}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-700">{row.priority}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-500">{row.assignedToName || "Não atribuído"}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-500">{[row.regionalName, row.baseName].filter(Boolean).join(" · ") || "—"}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-500">{formatMinutes(row.firstResponseMinutes)}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-500">{formatMinutes(row.resolutionMinutes)}</td>
											<td className="whitespace-nowrap px-2 py-2">{row.slaCompliant === null ? <span className="text-slate-400">—</span> : row.slaCompliant ? <span className="font-black text-emerald-600">Cumprido</span> : <span className="font-black text-red-600">Vencido</span>}</td>
											<td className="whitespace-nowrap px-2 py-2 text-slate-500">{row.closedAt ? new Date(row.closedAt).toLocaleDateString("pt-BR") : "—"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
							<span>{details.total} protocolo(s) · página {page} de {details.totalPages}</span>
							<div className="flex gap-2">
								<button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">Anterior</button>
								<button type="button" disabled={page >= details.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">Próxima</button>
							</div>
						</div>
					</>
				)}
			</SectionCard>
		</div>
	);
}
