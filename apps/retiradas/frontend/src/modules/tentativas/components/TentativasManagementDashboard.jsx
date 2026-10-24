import {
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js";
import {
	AlertTriangle,
	CalendarClock,
	ChevronDown,
	ChevronRight,
	CircleAlert,
	Download,
	Filter,
	MapPin,
	RefreshCw,
	Search,
	ShieldCheck,
	Target,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import Spinner from "../../../components/ui/Spinner";
import {
	baixarAnalyticsTentativasCsv,
	buscarAnalyticsTentativas,
	recalcularPrioridadesTentativas,
} from "../services/tentativasService";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const STORAGE_KEY = "tentativas-management-filters-v2";
const dateValue = (date) => date.toISOString().slice(0, 10);
const today = () => dateValue(new Date());
const minusDays = (days) => {
	const value = new Date();
	value.setDate(value.getDate() - days);
	return dateValue(value);
};
const initialFilters = { preset: "30d", startDate: minusDays(29), endDate: today(), empresa: "", regional: "", cidade: "", bairro: "", tecnicoId: "", statusOs: "", resultado: "", modalidade: "", tipoEquipamento: "", rankSearch: "", rankSort: "worked", rankDirection: "desc", rankPage: 1, rankLimit: 10 };
const number = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
const percent = (value) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const dateTime = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Não informado";

function filtersFromStorage() {
	try { return { ...initialFilters, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") }; } catch { return initialFilters; }
}

function applyPreset(current, preset) {
	const endDate = today();
	if (preset === "today") return { ...current, preset, startDate: endDate, endDate, rankPage: 1 };
	if (preset === "yesterday") { const day = minusDays(1); return { ...current, preset, startDate: day, endDate: day, rankPage: 1 }; }
	if (preset === "7d") return { ...current, preset, startDate: minusDays(6), endDate, rankPage: 1 };
	if (preset === "15d") return { ...current, preset, startDate: minusDays(14), endDate, rankPage: 1 };
	if (preset === "month") return { ...current, preset, startDate: `${endDate.slice(0, 8)}01`, endDate, rankPage: 1 };
	if (preset === "30d") return { ...current, preset, startDate: minusDays(29), endDate, rankPage: 1 };
	return { ...current, preset: "custom", rankPage: 1 };
}

function Skeleton() {
	return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />)}</div>;
}

function Empty({ children }) {
	return <div className="rounded-lg border border-dashed border-slate-300 px-5 py-10 text-center text-sm font-semibold text-slate-500">{children}</div>;
}

function Kpi({ label, value, detail, tone = "blue", progress, title }) {
	const tones = { blue: "text-blue-700 bg-blue-50", green: "text-emerald-700 bg-emerald-50", amber: "text-amber-700 bg-amber-50", red: "text-red-700 bg-red-50", neutral: "text-slate-700 bg-slate-100" };
	return (
		<article title={title} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-start justify-between gap-2"><span className="text-xs font-black uppercase text-slate-500">{label}</span><span className={`h-2 w-2 rounded-full ${tones[tone]}`} /></div>
			<strong className={`mt-3 inline-flex rounded-md px-2 py-1 text-2xl font-black ${tones[tone]}`}>{value}</strong>
			<p className="mt-2 min-h-5 text-xs font-semibold text-slate-500">{detail}</p>
			{progress != null ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(Math.max(Number(progress || 0), 0), 100)}%` }} /></div> : null}
		</article>
	);
}

function SectionHeader({ eyebrow, title, description, action }) {
	return <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase text-blue-700">{eyebrow}</p><h3 className="text-xl font-black text-slate-950">{title}</h3>{description ? <p className="text-sm font-semibold text-slate-500">{description}</p> : null}</div>{action}</div>;
}

function FilterSelect({ label, value, options, onChange, children }) {
	return <label className="grid gap-1 text-xs font-black text-slate-600"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500">{children || <><option value="">Todos</option>{(options || []).map((option) => <option key={option.id || option} value={option.id || option}>{option.technician_name || option}</option>)}</>}</select></label>;
}

function ActionList({ title, icon: Icon, items, empty, tone = "blue" }) {
	const toneClass = tone === "red" ? "text-red-600 bg-red-50" : tone === "amber" ? "text-amber-700 bg-amber-50" : "text-blue-700 bg-blue-50";
	return <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><span className={`rounded-md p-2 ${toneClass}`}><Icon className="h-4 w-4" /></span><strong className="text-sm text-slate-950">{title}</strong><span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">{items.length}</span></div><div className="mt-3 space-y-2">{items.map((item) => <div key={item.id || item.opportunity_id} className="rounded-md bg-slate-50 p-3 text-xs"><strong className="block text-slate-800">({item.codigo_cliente || "-"}) {item.cliente || "Cliente"}</strong><span className="text-slate-500">OS {item.os || "-"} · {item.cidade || "Cidade não informada"}</span>{item.technician_name ? <span className="mt-1 block font-bold text-slate-600">{item.technician_name}</span> : null}</div>)}{!items.length ? <p className="py-4 text-center text-xs font-semibold text-slate-400">{empty}</p> : null}</div></div>;
}

export default function TentativasManagementDashboard() {
	const [filters, setFilters] = useState(filtersFromStorage);
	const [applied, setApplied] = useState(filtersFromStorage);
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [chartMode, setChartMode] = useState("activity");
	const [selectedTechnician, setSelectedTechnician] = useState(null);
	const [expandedRegions, setExpandedRegions] = useState({});

	const load = useCallback(async (background = false) => {
		background ? setRefreshing(true) : setLoading(true);
		setError("");
		try { setData(await buscarAnalyticsTentativas(applied)); }
		catch (err) { setError(err.message || "Não foi possível carregar a Gestão de Tentativas."); }
		finally { setLoading(false); setRefreshing(false); }
	}, [applied]);
	useEffect(() => { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(applied)); void load(); }, [applied, load]);

	const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, rankPage: key.startsWith("rank") ? current.rankPage : 1 }));
	const apply = () => setApplied({ ...filters, rankPage: 1 });
	const clear = () => { setFilters(initialFilters); setApplied(initialFilters); };
	const changeRanking = (patch) => { const next = { ...applied, ...patch }; setFilters(next); setApplied(next); };
	const indicators = data?.indicators || {};
	const stale = data?.updatedAt && Date.now() - new Date(data.updatedAt).getTime() > 5 * 60_000;
	const daily = useMemo(() => data?.daily || [], [data?.daily]);
	const chartSeries = useMemo(() => chartMode === "activity"
		? [{ key: "attempts", label: "Tentativas", color: "#2563eb" }, { key: "worked", label: "Trabalhadas", color: "#0ea5e9" }]
		: chartMode === "conversion"
			? [{ key: "effectiveContacts", label: "Contatos efetivos", color: "#8b5cf6" }, { key: "scheduled", label: "Agendamentos", color: "#f59e0b" }]
			: [{ key: "completed", label: "Retiradas", color: "#059669" }], [chartMode]);
	const chartData = useMemo(() => ({ labels: daily.map((item) => new Date(`${item.day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })), datasets: chartSeries.map((serie) => ({ label: serie.label, data: daily.map((item) => item[serie.key]), borderColor: serie.color, backgroundColor: `${serie.color}33`, tension: 0.3, borderWidth: 2 })) }), [daily, chartSeries]);
	const territoryGroups = useMemo(() => Object.values((data?.territory || []).reduce((acc, item) => { const regional = item.regional || "Não informado"; acc[regional] ||= { regional, opportunities: 0, worked: 0, effectiveContacts: 0, scheduled: 0, recoveries: 0, overdueCallbacks: 0, cities: [] }; const target = acc[regional]; target.opportunities += item.opportunities; target.worked += item.worked; target.effectiveContacts += item.effectiveContacts; target.scheduled += item.scheduled; target.recoveries += item.recoveries; target.overdueCallbacks += item.overdueCallbacks; target.cities.push(item); return acc; }, {})).sort((a, b) => b.opportunities - a.opportunities), [data?.territory]);

	return (
		<section className="space-y-6">
			<header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
					<div><p className="text-xs font-black uppercase text-blue-700">Inteligência operacional</p><h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Gestão de Tentativas</h2><p className="mt-1 text-sm font-semibold text-slate-500">Monitore contatos, agendamentos, recuperações e desempenho da operação.</p></div>
					<div className="flex flex-wrap items-center gap-2"><div className="mr-2 text-xs font-semibold text-slate-500"><span className="block font-black text-slate-700">Última atualização</span>{dateTime(data?.updatedAt)}</div><button type="button" onClick={() => void load(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar</button><button type="button" onClick={() => baixarAnalyticsTentativasCsv(applied)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white"><Download className="h-4 w-4" /> Exportar CSV</button></div>
				</div>
				<button type="button" onClick={() => setFiltersOpen((value) => !value)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 font-black text-slate-700 lg:hidden"><Filter className="h-4 w-4" /> Filtros <ChevronDown className={`h-4 w-4 transition ${filtersOpen ? "rotate-180" : ""}`} /></button>
				<div className={`${filtersOpen ? "grid" : "hidden"} mt-4 gap-3 lg:grid lg:grid-cols-4 xl:grid-cols-6`}>
					<FilterSelect label="Período" value={filters.preset} onChange={(value) => setFilters((current) => applyPreset(current, value))}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7d">7 dias</option><option value="15d">15 dias</option><option value="30d">30 dias</option><option value="month">Mês atual</option><option value="custom">Personalizado</option></FilterSelect>
					<label className="grid gap-1 text-xs font-black text-slate-600"><span>Início</span><input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, preset: "custom", startDate: event.target.value }))} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" /></label>
					<label className="grid gap-1 text-xs font-black text-slate-600"><span>Fim</span><input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, preset: "custom", endDate: event.target.value }))} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" /></label>
					<FilterSelect label="Empresa" value={filters.empresa} options={data?.options?.companies} onChange={(value) => updateFilter("empresa", value)} />
					<FilterSelect label="Regional" value={filters.regional} options={data?.options?.regionals} onChange={(value) => updateFilter("regional", value)} />
					<FilterSelect label="Cidade" value={filters.cidade} options={data?.options?.cities} onChange={(value) => updateFilter("cidade", value)} />
					<FilterSelect label="Bairro" value={filters.bairro} options={data?.options?.neighborhoods} onChange={(value) => updateFilter("bairro", value)} />
					<FilterSelect label="Técnico" value={filters.tecnicoId} options={data?.options?.technicians} onChange={(value) => updateFilter("tecnicoId", value)} />
					<FilterSelect label="Status da OS" value={filters.statusOs} onChange={(value) => updateFilter("statusOs", value)}><option value="">Todos</option><option value="PENDING">Pendente</option><option value="CONTACT_STARTED">Contato iniciado</option><option value="SCHEDULED">Agendada</option><option value="COMPLETED">Concluída</option></FilterSelect>
					<FilterSelect label="Resultado" value={filters.resultado} onChange={(value) => updateFilter("resultado", value)}><option value="">Todos</option><option value="NO_RESPONSE">Sem resposta</option><option value="RESPONDED">Respondeu</option><option value="RESPONDED_SCHEDULE">Deseja agendar</option><option value="STORE_DELIVERY">Entrega em loja</option><option value="CALLBACK_REQUESTED">Pediu retorno</option><option value="REFUSED">Recusou</option><option value="INVALID_PHONE">Número inválido</option></FilterSelect>
					<FilterSelect label="Modalidade" value={filters.modalidade} onChange={(value) => updateFilter("modalidade", value)}><option value="">Todas</option><option value="TECHNICIAN_COLLECTION">Coleta por técnico</option><option value="STORE_DELIVERY">Entrega em loja</option></FilterSelect>
					<label className="grid gap-1 text-xs font-black text-slate-600"><span>Equipamento</span><input value={filters.tipoEquipamento} onChange={(event) => updateFilter("tipoEquipamento", event.target.value)} placeholder="Tipo de equipamento" className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold" /></label>
					<div className="flex items-end gap-2"><button type="button" onClick={apply} className="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 text-sm font-black text-white">Aplicar</button><button type="button" onClick={clear} title="Limpar filtros" className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-200 text-slate-600"><X className="h-4 w-4" /></button></div>
				</div>
			</header>

			{error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><CircleAlert className="mr-2 inline h-4 w-4" />{error}<button type="button" onClick={() => void load()} className="ml-3 underline">Tentar novamente</button></div> : null}
			{stale ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">Os dados exibidos podem estar desatualizados. Atualize o painel para obter a leitura mais recente.</div> : null}
			{loading && !data ? <Skeleton /> : null}

			{data ? <>
				<section className="space-y-3"><SectionHeader eyebrow="Visão da operação" title="Indicadores executivos" description="Estoque atual e produção do período aparecem identificados separadamente." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Kpi label="Oportunidades elegíveis" value={number(indicators.eligible)} detail={`${number(indicators.without_attempt)} sem tentativa no estoque atual`} tone="blue" /><Kpi label="Cobertura operacional" value={percent(indicators.coverageRate)} detail={`${number(indicators.worked)} de ${number(indicators.funnel_population)} OS da população`} progress={indicators.coverageRate} title="OS distintas trabalhadas ÷ população analisada" /><Kpi label="Tentativas realizadas" value={number(indicators.attempts)} detail={`${indicators.attemptsPerWorked || 0} por oportunidade trabalhada`} tone="blue" /><Kpi label="Contatos efetivos" value={number(indicators.effective_contacts)} detail={`${percent(indicators.effectiveContactRate)} das OS trabalhadas`} tone="green" title="OS distintas com resposta confirmada ÷ OS trabalhadas" /><Kpi label="Agendamentos" value={number(indicators.scheduled)} detail={`${percent(indicators.scheduleRate)} dos contatos efetivos`} tone="amber" title="OS distintas agendadas ÷ contatos efetivos" /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Kpi label="Retiradas concluídas" value={number(indicators.completed_total)} detail={`${number(indicators.completed_external)} por outros fluxos`} tone="green" /><Kpi label="Equipamentos recuperados" value={number(indicators.recovered_equipment)} detail="Unidades confirmadas no período" tone="green" /><Kpi label="Retornos vencidos" value={number(indicators.overdue_callbacks)} detail="Pendências que exigem atuação" tone="red" /><Kpi label="Sem primeira tentativa" value={number(indicators.without_attempt)} detail="Estoque atual distribuído ou disponível" tone="amber" /><Kpi label="Agendamentos futuros" value={number(indicators.future_appointments)} detail="Compromissos já programados" tone="neutral" /></div></section>

				<section className="space-y-3"><SectionHeader eyebrow="Conversão" title="Funil operacional" description="Todas as etapas usam OS distintas da mesma população; conclusões externas ficam separadas." /><div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="space-y-4">{data.funnel.map((stage, index) => <div key={stage.key} className="grid gap-2 md:grid-cols-[190px_1fr_170px]"><div><strong className="text-sm text-slate-900">{stage.label}</strong><span className="ml-2 text-lg font-black text-slate-950">{number(stage.value)}</span></div><div className="h-7 overflow-hidden rounded-md bg-slate-100"><div className="flex h-full min-w-8 items-center justify-end rounded-md bg-blue-600 px-2 text-xs font-black text-white" style={{ width: `${Math.max(stage.fromPopulationRate, 2)}%` }}>{percent(stage.fromPopulationRate)}</div></div><span className="text-xs font-bold text-slate-500">{index ? `${percent(stage.fromPreviousRate)} da etapa anterior` : "População analisada"}</span></div>)}</div><div className="mt-5 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-5">{[["Cobertura",indicators.coverageRate],["Contato",indicators.effectiveContactRate],["Contato → agenda",indicators.scheduleRate],["Agenda → retirada",data.funnel[3]?.value ? (data.funnel[4].value/data.funnel[3].value)*100 : 0],["Recuperação",indicators.recoveryRate]].map(([label,value]) => <div key={label} title={`Fórmula: ${label} calculada com OS distintas`}><span className="text-xs font-bold text-slate-500">{label}</span><strong className="block text-lg text-slate-900">{percent(value)}</strong></div>)}</div>{indicators.completed_external ? <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-600">{number(indicators.completed_external)} retirada(s) foram concluídas por outros fluxos e não foram forçadas nas etapas anteriores.</p> : null}</div></section>

				<section className="space-y-3"><SectionHeader eyebrow="Evolução" title="Produção diária" description="Séries reais para o período selecionado." action={<div className="flex rounded-lg border border-slate-200 bg-white p-1">{[["activity","Atividade"],["conversion","Conversão"],["result","Resultado"]].map(([value,label]) => <button key={value} type="button" onClick={() => setChartMode(value)} className={`min-h-9 rounded-md px-3 text-xs font-black ${chartMode === value ? "bg-blue-600 text-white" : "text-slate-600"}`}>{label}</button>)}</div>} /><div className="h-80 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">{daily.some((item) => chartSeries.some((serie) => Number(item[serie.key]))) ? (chartMode === "activity" ? <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false }} /> : <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />) : <Empty>Não houve movimentação para esta visualização no período.</Empty>}</div></section>

				<section className="space-y-3"><SectionHeader eyebrow="Produtividade" title="Ranking de técnicos" description="Volume e conversão são exibidos juntos para evitar comparações injustas." /><div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search className="h-4 w-4 text-slate-400" /><input value={filters.rankSearch} onChange={(event) => setFilters((current) => ({ ...current, rankSearch: event.target.value }))} onKeyDown={(event) => event.key === "Enter" && changeRanking({ rankSearch: filters.rankSearch, rankPage: 1 })} placeholder="Pesquisar técnico" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" /></label><FilterSelect label="Ordenar por" value={applied.rankSort} onChange={(value) => changeRanking({ rankSort: value, rankPage: 1 })}><option value="worked">Trabalhadas</option><option value="opportunities">Oportunidades</option><option value="coverage">Cobertura</option><option value="attempts">Tentativas</option><option value="contacts">Contatos</option><option value="scheduled">Agendamentos</option><option value="recoveries">Recuperações</option><option value="conversion">Conversão</option></FilterSelect><button type="button" onClick={() => changeRanking({ rankSearch: filters.rankSearch, rankPage: 1 })} className="min-h-11 self-end rounded-lg bg-slate-900 px-4 text-sm font-black text-white">Buscar</button></div><div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"><table className="min-w-[980px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Técnico","Oportunidades","Trabalhadas","Cobertura","Tentativas","Contatos","Agendamentos","Recuperações","Conversão"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{data.ranking.items.map((item) => <tr key={item.technician_user_id} onClick={() => setSelectedTechnician(item)} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/40"><td className="px-4 py-3 font-black text-slate-900">{item.technician_name}</td><td className="px-4">{number(item.opportunities)}</td><td className="px-4">{number(item.worked)}</td><td className="min-w-32 px-4"><span className="font-black">{percent(item.coverage)}</span><div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(item.coverage,100)}%` }} /></div></td><td className="px-4">{number(item.attempts)}</td><td className="px-4">{number(item.effectiveContacts)}</td><td className="px-4">{number(item.scheduled)}</td><td className="px-4">{number(item.recoveries)}</td><td className="px-4 font-black text-emerald-700">{percent(item.conversion)}</td></tr>)}</tbody></table>{!data.ranking.items.length ? <Empty>Nenhum técnico encontrado para os filtros aplicados.</Empty> : null}</div><div className="flex items-center justify-between text-sm font-semibold text-slate-500"><span>{number(data.ranking.total)} técnico(s)</span><div className="flex gap-2"><button type="button" disabled={data.ranking.page <= 1} onClick={() => changeRanking({ rankPage: data.ranking.page - 1 })} className="min-h-10 rounded-lg border border-slate-200 px-3 disabled:opacity-40">Anterior</button><button type="button" disabled={data.ranking.page * data.ranking.limit >= data.ranking.total} onClick={() => changeRanking({ rankPage: data.ranking.page + 1 })} className="min-h-10 rounded-lg border border-slate-200 px-3 disabled:opacity-40">Próxima</button></div></div></section>

				<section className="space-y-3"><SectionHeader eyebrow="Ação imediata" title="Oportunidades e alertas" description="Registros que merecem atuação da supervisão agora." action={<button type="button" onClick={async () => { await recalcularPrioridadesTentativas(); await load(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"><RefreshCw className="h-4 w-4" /> Recalcular prioridades</button>} /><div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4"><ActionList title="Sem primeira tentativa" icon={Users} items={data.actions.unattempted || []} empty="Todas as carteiras distribuídas já foram iniciadas." /><ActionList title="Retornos vencidos" icon={CalendarClock} items={data.actions.overdue || []} empty="Nenhum retorno vencido." tone="red" /><ActionList title="Agendamentos próximos" icon={CalendarClock} items={data.actions.upcoming || []} empty="Nenhum agendamento próximo." /><ActionList title="Prioridade elevada" icon={Target} items={data.actions.priority || []} empty="Nenhuma prioridade elevada sem tentativa." tone="amber" /></div><div className="grid gap-2 md:grid-cols-3">{data.alerts.map((alert) => <div key={alert.type} className={`rounded-lg border p-4 text-sm font-bold ${alert.severity === "critical" ? "border-red-200 bg-red-50 text-red-800" : alert.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}><AlertTriangle className="mr-2 inline h-4 w-4" /><strong>{number(alert.value)}</strong> · {alert.message}</div>)}{!data.alerts.length ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><ShieldCheck className="mr-2 inline h-4 w-4" />Operação sem alertas gerenciais no recorte atual.</div> : null}</div></section>

				<section className="space-y-3"><SectionHeader eyebrow="Território" title="Regional, cidade e bairro" description="Expanda uma regional para identificar concentração e cobertura por localidade." /><div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">{territoryGroups.map((group) => <div key={group.regional} className="border-b border-slate-100 last:border-0"><button type="button" onClick={() => setExpandedRegions((current) => ({ ...current, [group.regional]: !current[group.regional] }))} className="grid min-h-14 w-full grid-cols-[1fr_repeat(3,90px)_24px] items-center gap-2 px-4 text-left hover:bg-slate-50"><span className="flex items-center gap-2 font-black text-slate-900"><MapPin className="h-4 w-4 text-blue-600" />{group.regional}</span><span className="text-right text-xs"><strong className="block text-slate-900">{number(group.opportunities)}</strong> oportunidades</span><span className="text-right text-xs"><strong className="block text-slate-900">{percent(group.opportunities ? group.worked*100/group.opportunities : 0)}</strong> cobertura</span><span className="text-right text-xs"><strong className="block text-red-700">{number(group.overdueCallbacks)}</strong> vencidos</span><ChevronRight className={`h-4 w-4 transition ${expandedRegions[group.regional] ? "rotate-90" : ""}`} /></button>{expandedRegions[group.regional] ? <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/60"><table className="min-w-[760px] w-full text-xs"><thead><tr className="text-slate-500">{["Cidade / bairro","Oportunidades","Trabalhadas","Cobertura","Contatos","Agendamentos","Recuperações"].map((label) => <th key={label} className="px-4 py-2 text-left">{label}</th>)}</tr></thead><tbody>{group.cities.map((item) => <tr key={`${item.cidade}-${item.bairro}`} className="border-t border-white"><td className="px-4 py-2 font-bold text-slate-800">{item.cidade} · {item.bairro}</td><td className="px-4">{number(item.opportunities)}</td><td className="px-4">{number(item.worked)}</td><td className="px-4 font-bold">{percent(item.coverage)}</td><td className="px-4">{number(item.effectiveContacts)}</td><td className="px-4">{number(item.scheduled)}</td><td className="px-4">{number(item.recoveries)}</td></tr>)}</tbody></table></div> : null}</div>)}{!territoryGroups.length ? <Empty>Nenhum dado territorial para o período.</Empty> : null}</div></section>

				<section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className={`rounded-md p-2 ${data.health.status === "normal" ? "bg-emerald-50 text-emerald-700" : data.health.status === "attention" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}><ShieldCheck className="h-5 w-5" /></span><div><strong className="block text-slate-950">Saúde da integração e reconciliação</strong><span className="text-xs font-semibold text-slate-500">Última sincronização: {dateTime(data.health.lastSyncAt)}</span></div></div><div className="flex flex-wrap gap-4 text-xs"><span><strong className="block text-slate-900">{number(data.health.activeRecords)}</strong> registros ativos</span><span><strong className="block text-amber-700">{number(data.health.divergences)}</strong> divergências</span><span><strong className="block text-red-700">{number(data.health.staleRecords)}</strong> desatualizados</span><span className="rounded-full bg-slate-100 px-3 py-1 font-black uppercase text-slate-600">{data.health.status === "normal" ? "Normal" : data.health.status === "attention" ? "Atenção" : "Falha"}</span></div></div></section>
			</> : null}

			{selectedTechnician ? <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTechnician(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase text-blue-700">Detalhamento do técnico</p><h3 className="text-xl font-black text-slate-950">{selectedTechnician.technician_name}</h3><p className="text-sm font-semibold text-slate-500">Identidade: {selectedTechnician.technician_user_id}</p></div><button type="button" onClick={() => setSelectedTechnician(null)} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-200"><X className="h-4 w-4" /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Kpi label="Carteira" value={number(selectedTechnician.opportunities)} detail={`${selectedTechnician.cities} cidades · ${selectedTechnician.neighborhoods} bairros`} /><Kpi label="Cobertura" value={percent(selectedTechnician.coverage)} detail={`${number(selectedTechnician.worked)} trabalhadas`} progress={selectedTechnician.coverage} /><Kpi label="Conversão" value={percent(selectedTechnician.conversion)} detail={`${number(selectedTechnician.recoveries)} recuperações`} tone="green" /><Kpi label="Tentativas" value={number(selectedTechnician.attempts)} detail="No período" /><Kpi label="Contatos" value={number(selectedTechnician.effectiveContacts)} detail="Efetivos" tone="green" /><Kpi label="Agendamentos" value={number(selectedTechnician.scheduled)} detail="Gerados" tone="amber" /></div></div></div> : null}
		</section>
	);
}
