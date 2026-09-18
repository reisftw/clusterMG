import { Activity, BarChart3, CalendarDays, DatabaseZap, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	fetchOperationalCockpit,
	fetchOperationalControlTower,
	fetchOperationalEvents,
	fetchOperationalHealthScore,
	fetchOperationalJourney,
	fetchOperationalMetricCatalog,
	fetchOperationalMetricDrilldown,
	fetchOperationalPending,
	fetchOperationalProviderStatus,
	fetchOperationalSummary,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { PageHeader } from "./TechniciansPage";

const DOMAINS = [
	{ id: "ROT", label: "ROT", description: "Tickets internos da Operação" },
	{ id: "FIELD", label: "Field Service", description: "O.S Hubsoft, aguardando integração" },
	{ id: "DELIVERY", label: "Delivery", description: "O.S Hubsoft, aguardando integração" },
];
const COMMAND_LIST_PAGE_SIZE = 5;

function pad2(value) {
	return String(value).padStart(2, "0");
}

function currentMonthPeriod() {
	const now = new Date();
	const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
	const to = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
	return { from, to };
}

function availabilityLabel(value) {
	const labels = {
		AVAILABLE: "Disponível",
		PARTIAL: "Parcial",
		WAITING_INTEGRATION: "Aguardando integração",
		UNAVAILABLE: "Indisponível",
	};
	return labels[value] || value || "Indefinido";
}

function availabilityTone(value) {
	if (value === "AVAILABLE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
	if (value === "PARTIAL") return "border-amber-200 bg-amber-50 text-amber-700";
	if (value === "WAITING_INTEGRATION") return "border-blue-200 bg-blue-50 text-blue-700";
	return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function CommandCenterPage() {
	const [domain, setDomain] = useState("ROT");
	const [period, setPeriod] = useState(currentMonthPeriod);
	const [summary, setSummary] = useState(null);
	const [events, setEvents] = useState(null);
	const [journey, setJourney] = useState(null);
	const [pending, setPending] = useState(null);
	const [cockpit, setCockpit] = useState(null);
	const [tower, setTower] = useState(null);
	const [health, setHealth] = useState(null);
	const [catalog, setCatalog] = useState([]);
	const [providers, setProviders] = useState([]);
	const [drilldown, setDrilldown] = useState(null);
	const [listModal, setListModal] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [summaryData, eventsData, journeyData, pendingData, cockpitData, towerData, healthData, catalogData, providerData] = await Promise.all([
				fetchOperationalSummary({ domain, ...period }),
				fetchOperationalEvents({ domain, ...period, limit: 20 }),
				fetchOperationalJourney({ domain, ...period }),
				fetchOperationalPending({ domain, ...period }),
				fetchOperationalCockpit({ domain, ...period }),
				fetchOperationalControlTower({ domain, ...period }),
				fetchOperationalHealthScore({ domain, ...period }),
				fetchOperationalMetricCatalog(),
				fetchOperationalProviderStatus(),
			]);
			setSummary(summaryData);
			setEvents(eventsData);
			setJourney(journeyData);
			setPending(pendingData);
			setCockpit(cockpitData);
			setTower(towerData);
			setHealth(healthData);
			setCatalog(catalogData);
			setProviders(providerData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o centro de comando.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [domain, period.from, period.to]);

	const activeCatalog = useMemo(() => catalog.filter((item) => !item.domain || item.domain === domain), [catalog, domain]);

	const openDrilldown = async (metric) => {
		setDrilldown({ loading: true, metric, items: [], error: "" });
		try {
			const data = await fetchOperationalMetricDrilldown({ domain, code: metric.code, ...period });
			setDrilldown({ loading: false, metric, items: data.items || [], availability: data.availability, reason: data.reason || "", error: "" });
		} catch (err) {
			setDrilldown({ loading: false, metric, items: [], error: err?.message || "Não foi possível abrir o detalhamento." });
		}
	};

	if (loading && !summary) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<PageHeader
				title="Centro de Comando Operacional"
				description="Indicadores reais da Operação, separando fontes disponíveis das integrações pendentes."
				icon={Activity}
				onRefresh={load}
				createLabel=""
			/>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-wrap gap-2">
						{DOMAINS.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => setDomain(item.id)}
								className={`rounded-xl border px-4 py-2 text-left transition ${domain === item.id ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
							>
								<p className="text-sm font-black">{item.label}</p>
								<p className={`text-[11px] font-semibold ${domain === item.id ? "text-blue-100" : "text-slate-400"}`}>{item.description}</p>
							</button>
						))}
					</div>
					<div className="flex flex-wrap items-end gap-2">
						<label className="grid gap-1 text-xs font-bold uppercase text-slate-500">
							Início
							<input type="date" value={period.from} onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500" />
						</label>
						<label className="grid gap-1 text-xs font-bold uppercase text-slate-500">
							Fim
							<input type="date" value={period.to} onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500" />
						</label>
					</div>
				</div>
			</section>

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{(summary?.metrics || []).map((metric) => (
					<button
						key={metric.code}
						type="button"
						onClick={() => openDrilldown(metric)}
						className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${metric.availability === "AVAILABLE" ? "border-slate-200" : "border-blue-100"}`}
					>
						<div className="mb-3 flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="text-xs font-black uppercase text-slate-500">{metric.name}</p>
								<p className="mt-1 text-3xl font-black text-slate-950">{metric.value ?? "—"}</p>
							</div>
							<span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase ${availabilityTone(metric.availability)}`}>
								{availabilityLabel(metric.availability)}
							</span>
						</div>
						<p className="text-xs font-semibold text-slate-400">Fonte: {metric.source}</p>
						{metric.reason ? <p className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{metric.reason}</p> : null}
					</button>
				))}
			</div>

			<div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Activity size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Cockpit do Supervisor</h2>
							<p className="text-sm font-semibold text-slate-500">Agora, hoje e período, usando somente fontes válidas.</p>
						</div>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<CockpitColumn title="Agora" items={cockpit?.now || []} />
						<CockpitColumn title="Hoje" items={cockpit?.today || []} />
						<CockpitColumn title="Período" items={cockpit?.month || []} />
					</div>
					{cockpit?.availability === "PARTIAL" ? (
						<div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
							O.S Hubsoft segue aguardando integração; exibindo somente dados internos reais.
						</div>
					) : null}
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldAlert size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Saúde Operacional</h2>
							<p className="text-sm font-semibold text-slate-500">Score explicável por componente.</p>
						</div>
					</div>
					<div className="flex items-center gap-4">
						<div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-8 ${healthTone(health?.score)}`}>
							<span className="text-2xl font-black">{health?.score ?? "—"}</span>
						</div>
						<div className="min-w-0 flex-1 space-y-2">
							{(health?.components || []).map((item) => (
								<div key={item.component}>
									<div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold">
										<span className="truncate text-slate-700">{item.label}</span>
										<span className="text-slate-500">{item.score ?? "—"}</span>
									</div>
									<div className="h-2 overflow-hidden rounded-full bg-slate-100">
										<div className={`h-full ${barTone(item.score)}`} style={{ width: `${Math.max(0, Math.min(100, Number(item.score || 0)))}%` }} />
									</div>
									<p className="mt-1 text-[10px] font-semibold text-slate-400">{item.fact}</p>
								</div>
							))}
						</div>
					</div>
					<p className="mt-3 text-xs font-semibold text-slate-400">{health?.explanation}</p>
				</section>
			</div>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-700"><ShieldAlert size={22} /></span>
					<div>
						<h2 className="text-lg font-black text-slate-950">Torre de Controle</h2>
						<p className="text-sm font-semibold text-slate-500">Alertas explicáveis, com fato e recomendação separados.</p>
					</div>
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{(tower?.alerts || []).slice(0, COMMAND_LIST_PAGE_SIZE).map((alert) => (
						<a key={alert.id} href={alert.deepLink || "#"} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${alertTone(alert.severity)}`}>
							<div className="mb-3 flex items-start justify-between gap-3">
								<h3 className="text-sm font-black text-slate-950">{alert.title}</h3>
								<span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase">{alert.severity}</span>
							</div>
							<p className="text-xs font-black uppercase text-slate-500">Fato</p>
							<p className="mt-1 text-sm font-semibold text-slate-700">{alert.fact}</p>
							<p className="mt-3 text-xs font-black uppercase text-slate-500">Recomendação</p>
							<p className="mt-1 text-sm font-semibold text-slate-700">{alert.recommendation}</p>
							<p className="mt-3 text-[11px] font-bold text-slate-400">Fonte: {alert.source}</p>
						</a>
					))}
					{!(tower?.alerts || []).length ? (
						<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400 md:col-span-2 xl:col-span-3">Nenhum alerta gerado pelas regras atuais.</div>
					) : null}
				</div>
				<PreviewMoreButton count={(tower?.alerts || []).length} onClick={() => setListModal({ type: "alerts", title: "Torre de Controle", items: tower?.alerts || [] })} />
			</section>

			<div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><BarChart3 size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Distribuição do período</h2>
							<p className="text-sm font-semibold text-slate-500">Quebras calculadas somente quando a fonte existe.</p>
						</div>
					</div>
					<div className="grid gap-3 lg:grid-cols-2">
						<BreakdownList title="Por regional" items={summary?.breakdowns?.byRegional || []} />
						<BreakdownList title="Por técnico/equipe" items={summary?.breakdowns?.byTechnician || []} />
					</div>
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-700"><DatabaseZap size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Fontes e catálogo</h2>
							<p className="text-sm font-semibold text-slate-500">Nada aqui é marcado como pronto só por existir biblioteca.</p>
						</div>
					</div>
					<div className="space-y-3">
						{providers.slice(0, COMMAND_LIST_PAGE_SIZE).map((provider) => (
							<div key={provider.provider} className="rounded-xl border border-slate-200 p-3">
								<div className="flex items-center justify-between gap-2">
									<p className="text-sm font-black text-slate-800">{provider.provider}</p>
									<span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${availabilityTone(provider.status)}`}>{availabilityLabel(provider.status)}</span>
								</div>
								<p className="mt-1 text-xs font-semibold text-slate-500">{provider.source} · {provider.domains.join(", ")}</p>
							</div>
						))}
					</div>
					<PreviewMoreButton count={providers.length} onClick={() => setListModal({ type: "providers", title: "Fontes e catálogo", items: providers })} />
				</section>
			</div>

			<div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-700"><ShieldAlert size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Central de Pendências</h2>
							<p className="text-sm font-semibold text-slate-500">Itens acionáveis calculados por regra.</p>
						</div>
					</div>
					<div className="max-h-96 space-y-2 overflow-y-auto pr-1">
						{(pending?.items || []).slice(0, COMMAND_LIST_PAGE_SIZE).map((item) => (
							<a key={item.id} href={item.deepLink} className="block rounded-xl border border-red-100 bg-red-50/60 p-3 transition hover:bg-red-50">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate text-sm font-black text-slate-900">{item.title}</p>
										<p className="mt-1 text-xs font-semibold text-slate-600">{item.description}</p>
										<p className="mt-2 text-[11px] font-bold text-red-700">{item.recommendedAction}</p>
									</div>
									<span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-red-700">{item.priority}</span>
								</div>
							</a>
						))}
						{pending?.availability === "WAITING_INTEGRATION" ? (
							<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-700">{pending.reason}</div>
						) : null}
						{pending?.availability !== "WAITING_INTEGRATION" && !(pending?.items || []).length ? (
							<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Nenhuma pendência gerada no período.</div>
						) : null}
					</div>
					<PreviewMoreButton count={(pending?.items || []).length} onClick={() => setListModal({ type: "pending", title: "Central de Pendências", items: pending?.items || [] })} />
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Activity size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Jornada operacional</h2>
							<p className="text-sm font-semibold text-slate-500">Timeline normalizada dos eventos reais disponíveis.</p>
						</div>
					</div>
					<Timeline items={journey?.items || []} waiting={journey?.availability === "WAITING_INTEGRATION" ? journey.reason : ""} />
				</section>
			</div>

			<div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><ShieldAlert size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Indicadores configurados</h2>
							<p className="text-sm font-semibold text-slate-500">{activeCatalog.length} indicador(es) aplicáveis.</p>
						</div>
					</div>
					<div className="max-h-96 space-y-2 overflow-y-auto pr-1">
						{activeCatalog.slice(0, COMMAND_LIST_PAGE_SIZE).map((item) => (
							<div key={item.code} className="rounded-xl border border-slate-200 p-3">
								<p className="text-sm font-black text-slate-800">{item.name}</p>
								<p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>
								<p className="mt-2 text-[11px] font-bold text-slate-400">{item.code} · {item.source}</p>
							</div>
						))}
					</div>
					<PreviewMoreButton count={activeCatalog.length} onClick={() => setListModal({ type: "catalog", title: "Indicadores configurados", items: activeCatalog })} />
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center gap-3">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CalendarDays size={22} /></span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Eventos recentes</h2>
							<p className="text-sm font-semibold text-slate-500">Linha do tempo da fonte selecionada.</p>
						</div>
						<button type="button" onClick={load} className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" title="Atualizar">
							<RefreshCw size={16} />
						</button>
					</div>
					<div className="max-h-96 space-y-2 overflow-y-auto pr-1">
						{(events?.items || []).slice(0, COMMAND_LIST_PAGE_SIZE).map((event) => (
							<div key={event.id} className="rounded-xl border border-slate-200 p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate text-sm font-black text-slate-800">{event.title}</p>
										<p className="mt-1 text-xs font-semibold text-slate-500">{event.description}</p>
									</div>
									<span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{event.status}</span>
								</div>
							</div>
						))}
						{events?.availability === "WAITING_INTEGRATION" ? (
							<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-700">{events.reason}</div>
						) : null}
						{events?.availability !== "WAITING_INTEGRATION" && !(events?.items || []).length ? (
							<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Nenhum evento encontrado no período.</div>
						) : null}
					</div>
					<PreviewMoreButton count={(events?.items || []).length} onClick={() => setListModal({ type: "events", title: "Eventos recentes", items: events?.items || [] })} />
				</section>
			</div>

			{drilldown ? (
				<ModalShell
					open
					title={drilldown.metric?.name || "Detalhamento"}
					description={`Fonte: ${drilldown.metric?.source || "-"} · Unidade: ${drilldown.metric?.unit || "-"}`}
					icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><BarChart3 size={22} /></span>}
					onClose={() => setDrilldown(null)}
					size="lg"
				>
					{drilldown.loading ? <Spinner /> : null}
					{drilldown.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{drilldown.error}</div> : null}
					{drilldown.reason ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{drilldown.reason}</div> : null}
					{!drilldown.loading && !drilldown.error ? (
						<PaginatedCommandList items={drilldown.items || []}>
							{(pageItems) => (
								<div className="space-y-2">
									{pageItems.map((item) => (
								<a key={item.id} href={item.deepLink} className="block rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate text-sm font-black text-slate-900">Ticket {item.ticketNumber}</p>
											<p className="mt-1 text-xs font-semibold text-slate-500">{item.serviceTypeName} · {item.regionalName} · {item.cityName}</p>
											<p className="mt-1 text-[11px] font-bold text-slate-400">{(item.teamNames || []).join(", ") || "Equipe não informada"}</p>
										</div>
										<span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{item.status}</span>
									</div>
								</a>
									))}
									{!(drilldown.items || []).length ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Nenhum registro para detalhar.</div> : null}
								</div>
							)}
						</PaginatedCommandList>
					) : null}
				</ModalShell>
			) : null}
			{listModal ? <CommandListModal modal={listModal} onClose={() => setListModal(null)} /> : null}
		</div>
	);
}

function BreakdownList({ title, items }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h3 className="text-xs font-black uppercase text-slate-500">{title}</h3>
				<PreviewMoreButton count={items.length} onClick={() => setOpen(true)} compact />
			</div>
			<div className="space-y-2">
				{items.slice(0, COMMAND_LIST_PAGE_SIZE).map((item) => (
					<div key={item.label} className="rounded-xl bg-white p-3 shadow-sm">
						<div className="flex items-center justify-between gap-3">
							<p className="min-w-0 truncate text-sm font-black text-slate-800">{item.label}</p>
							<p className="text-sm font-black text-blue-700">{item.total}</p>
						</div>
						<p className="mt-1 text-[11px] font-bold text-slate-400">{item.open} aberto(s) · {item.completed} concluído(s)</p>
					</div>
				))}
				{!items.length ? <p className="py-6 text-center text-sm font-bold text-slate-400">Sem dados disponíveis para esta fonte.</p> : null}
			</div>
			{open ? (
				<CommandSimpleListModal
					title={title}
					items={items}
					onClose={() => setOpen(false)}
					renderItem={(item) => (
						<div key={item.label} className="rounded-xl bg-slate-50 p-3">
							<div className="flex items-center justify-between gap-3">
								<p className="min-w-0 truncate text-sm font-black text-slate-800">{item.label}</p>
								<p className="text-sm font-black text-blue-700">{item.total}</p>
							</div>
							<p className="mt-1 text-[11px] font-bold text-slate-400">{item.open} aberto(s) · {item.completed} concluído(s)</p>
						</div>
					)}
				/>
			) : null}
		</div>
	);
}

function CockpitColumn({ title, items }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h3 className="text-xs font-black uppercase text-slate-500">{title}</h3>
				<PreviewMoreButton count={items.length} onClick={() => setOpen(true)} compact />
			</div>
			<div className="space-y-2">
				{items.slice(0, COMMAND_LIST_PAGE_SIZE).map((item) => (
					<div key={item.label} className="rounded-xl bg-white p-3 shadow-sm">
						<div className="flex items-center justify-between gap-3">
							<p className="min-w-0 truncate text-sm font-black text-slate-800">{item.label}</p>
							<p className="text-sm font-black text-indigo-700">{item.value ?? "—"}</p>
						</div>
						<p className="mt-1 text-[11px] font-bold text-slate-400">Fonte: {item.source}</p>
					</div>
				))}
				{!items.length ? <p className="py-6 text-center text-sm font-bold text-slate-400">Sem dados para este bloco.</p> : null}
			</div>
			{open ? (
				<CommandSimpleListModal
					title={title}
					items={items}
					onClose={() => setOpen(false)}
					renderItem={(item) => (
						<div key={item.label} className="rounded-xl bg-slate-50 p-3">
							<div className="flex items-center justify-between gap-3">
								<p className="min-w-0 truncate text-sm font-black text-slate-800">{item.label}</p>
								<p className="text-sm font-black text-indigo-700">{item.value ?? "—"}</p>
							</div>
							<p className="mt-1 text-[11px] font-bold text-slate-400">Fonte: {item.source}</p>
						</div>
					)}
				/>
			) : null}
		</div>
	);
}

function alertTone(severity) {
	if (severity === "critical") return "border-red-200 bg-red-50";
	if (severity === "high") return "border-orange-200 bg-orange-50";
	if (severity === "medium") return "border-amber-200 bg-amber-50";
	return "border-blue-200 bg-blue-50";
}

function healthTone(score) {
	const value = Number(score || 0);
	if (value >= 80) return "border-emerald-100 bg-emerald-50 text-emerald-700";
	if (value >= 60) return "border-amber-100 bg-amber-50 text-amber-700";
	return "border-red-100 bg-red-50 text-red-700";
}

function barTone(score) {
	const value = Number(score || 0);
	if (value >= 80) return "bg-emerald-500";
	if (value >= 60) return "bg-amber-500";
	return "bg-red-500";
}

function Timeline({ items, waiting }) {
	const [open, setOpen] = useState(false);
	if (waiting) return <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-700">{waiting}</div>;
	if (!items.length) return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Nenhum evento encontrado.</div>;
	return (
		<div>
			<div className="space-y-0 pr-1">
				{items.slice(0, COMMAND_LIST_PAGE_SIZE).map((item) => (
					<TimelineItem key={`${item.type}-${item.id}`} item={item} />
				))}
			</div>
			<PreviewMoreButton count={items.length} onClick={() => setOpen(true)} />
			{open ? (
				<CommandSimpleListModal
					title="Jornada operacional"
					items={items}
					onClose={() => setOpen(false)}
					renderItem={(item) => <TimelineItem key={`${item.type}-${item.id}`} item={item} boxed />}
				/>
			) : null}
		</div>
	);
}

function TimelineItem({ item, boxed = false }) {
	return (
		<a key={`${item.type}-${item.id}`} href={item.deepLink} className={`${boxed ? "block" : "relative block border-l-2 border-blue-100 pb-4 pl-4 last:pb-0"}`}>
			{boxed ? null : <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />}
			<div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:bg-slate-50">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate text-sm font-black text-slate-900">{item.title}</p>
						<p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>
						<p className="mt-1 text-[11px] font-bold text-slate-400">{(item.teamNames || []).join(", ") || item.source}</p>
					</div>
					<span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{item.status}</span>
				</div>
			</div>
		</a>
	);
}

function PreviewMoreButton({ count, onClick, compact = false }) {
	if (count <= COMMAND_LIST_PAGE_SIZE) return null;
	return (
		<button type="button" onClick={onClick} className={`rot-btn-tactile ${compact ? "" : "mt-3"} rounded-lg px-2 py-1 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50`}>
			Ver tudo ({count})
		</button>
	);
}

function CommandSimpleListModal({ title, items, renderItem, onClose }) {
	return (
		<ModalShell
			open
			title={title}
			description={`${items.length} registro(s)`}
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><BarChart3 size={22} /></span>}
			onClose={onClose}
			size="lg"
		>
			<PaginatedCommandList items={items}>
				{(pageItems) => <div className="space-y-2">{pageItems.map(renderItem)}</div>}
			</PaginatedCommandList>
		</ModalShell>
	);
}

function CommandListModal({ modal, onClose }) {
	const renderItem = (item) => {
		if (modal.type === "alerts") {
			return (
				<a key={item.id} href={item.deepLink || "#"} className={`block rounded-2xl border p-4 transition hover:bg-slate-50 ${alertTone(item.severity)}`}>
					<div className="mb-3 flex items-start justify-between gap-3">
						<h3 className="text-sm font-black text-slate-950">{item.title}</h3>
						<span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase">{item.severity}</span>
					</div>
					<p className="text-xs font-black uppercase text-slate-500">Fato</p>
					<p className="mt-1 text-sm font-semibold text-slate-700">{item.fact}</p>
					<p className="mt-3 text-xs font-black uppercase text-slate-500">Recomendação</p>
					<p className="mt-1 text-sm font-semibold text-slate-700">{item.recommendation}</p>
					<p className="mt-3 text-[11px] font-bold text-slate-400">Fonte: {item.source}</p>
				</a>
			);
		}
		if (modal.type === "providers") {
			return (
				<div key={item.provider} className="rounded-xl border border-slate-200 p-3">
					<div className="flex items-center justify-between gap-2">
						<p className="text-sm font-black text-slate-800">{item.provider}</p>
						<span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${availabilityTone(item.status)}`}>{availabilityLabel(item.status)}</span>
					</div>
					<p className="mt-1 text-xs font-semibold text-slate-500">{item.source} · {(item.domains || []).join(", ")}</p>
				</div>
			);
		}
		if (modal.type === "pending") {
			return (
				<a key={item.id} href={item.deepLink} className="block rounded-xl border border-red-100 bg-red-50/60 p-3 transition hover:bg-red-50">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="truncate text-sm font-black text-slate-900">{item.title}</p>
							<p className="mt-1 text-xs font-semibold text-slate-600">{item.description}</p>
							<p className="mt-2 text-[11px] font-bold text-red-700">{item.recommendedAction}</p>
						</div>
						<span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-red-700">{item.priority}</span>
					</div>
				</a>
			);
		}
		if (modal.type === "catalog") {
			return (
				<div key={item.code} className="rounded-xl border border-slate-200 p-3">
					<p className="text-sm font-black text-slate-800">{item.name}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>
					<p className="mt-2 text-[11px] font-bold text-slate-400">{item.code} · {item.source}</p>
				</div>
			);
		}
		return (
			<div key={item.id} className="rounded-xl border border-slate-200 p-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate text-sm font-black text-slate-800">{item.title}</p>
						<p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>
					</div>
					<span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{item.status}</span>
				</div>
			</div>
		);
	};
	return <CommandSimpleListModal title={modal.title} items={modal.items || []} onClose={onClose} renderItem={renderItem} />;
}

function PaginatedCommandList({ items, children, pageSize = COMMAND_LIST_PAGE_SIZE }) {
	const [page, setPage] = useState(1);
	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const start = (safePage - 1) * pageSize;
	const pageItems = items.slice(start, start + pageSize);

	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	return (
		<div className="space-y-3">
			<div className="max-h-[60vh] overflow-y-auto pr-1">{children(pageItems, start)}</div>
			{items.length > pageSize ? (
				<div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs font-bold text-slate-400">
						Mostrando {start + 1}-{Math.min(start + pageSize, items.length)} de {items.length}
					</p>
					<div className="flex items-center gap-2">
						<button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} className="rot-btn-tactile rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40">
							Anterior
						</button>
						<span className="text-xs font-black text-slate-500">{safePage}/{totalPages}</span>
						<button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} className="rot-btn-tactile rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40">
							Próxima
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
