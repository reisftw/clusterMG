import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	BarChart3,
	CalendarDays,
	CheckCircle2,
	Download,
	Info,
	Medal,
	RefreshCw,
	Search,
	SlidersHorizontal,
	Trophy,
	Users,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	baixarRankingXlsx,
	buscarRanking,
	buscarRankingDetalhe,
} from "../services/rankingService";

const PERIOD_PRESETS = [
	{ value: "today", label: "Hoje" },
	{ value: "yesterday", label: "Ontem" },
	{ value: "last7", label: "7 dias" },
	{ value: "month", label: "Este mes" },
	{ value: "previousMonth", label: "Mes anterior" },
	{ value: "custom", label: "Personalizado" },
];

const DIMENSIONS = [
	{ value: "technician", label: "Tecnicos" },
	{ value: "regional", label: "Regionais" },
	{ value: "agent", label: "Agentes" },
	{ value: "city", label: "Cidades" },
];

const TECH_CHANNELS = [
	{ value: "all", label: "Todos" },
	{ value: "withdrawal", label: "Retirada" },
	{ value: "regional", label: "Regionais" },
	{ value: "agent", label: "Agentes" },
];

function pad(value) {
	return String(value).padStart(2, "0");
}

function toDateKey(date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, amount) {
	const next = new Date(date);
	next.setDate(next.getDate() + amount);
	return next;
}

function getPresetRange(preset) {
	const today = new Date();
	if (preset === "yesterday") {
		const yesterday = addDays(today, -1);
		return { startDate: toDateKey(yesterday), endDate: toDateKey(yesterday) };
	}
	if (preset === "last7") {
		return { startDate: toDateKey(addDays(today, -6)), endDate: toDateKey(today) };
	}
	if (preset === "month") {
		return {
			startDate: toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
			endDate: toDateKey(today),
		};
	}
	if (preset === "previousMonth") {
		return {
			startDate: toDateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
			endDate: toDateKey(new Date(today.getFullYear(), today.getMonth(), 0)),
		};
	}
	return { startDate: toDateKey(today), endDate: toDateKey(today) };
}

function formatNumber(value) {
	return Number(value || 0).toLocaleString("pt-BR");
}

function formatDecimal(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	});
}

function formatPercent(value) {
	if (value === null || value === undefined) return "-";
	return `${formatDecimal(value)}%`;
}

function formatDateTime(value) {
	if (!value) return "-";
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
}

function formatSyncAge(lastSync) {
	if (!lastSync?.updatedAt) return "Sem sincronizacao";
	if (Number.isFinite(lastSync.ageMinutes)) {
		if (lastSync.ageMinutes < 1) return "Atualizado agora";
		if (lastSync.ageMinutes < 60) return `Atualizado ha ${lastSync.ageMinutes} min`;
	}
	return `Atualizado em ${formatDateTime(lastSync.updatedAt)}`;
}

function badgeClass(type) {
	if (type === "RETIRADA") return "border-blue-200 bg-blue-50 text-blue-700";
	if (type === "REGIONAL") return "border-emerald-200 bg-emerald-50 text-emerald-700";
	if (type === "AA") return "border-orange-200 bg-orange-50 text-orange-700";
	if (type === "MISTO") return "border-violet-200 bg-violet-50 text-violet-700";
	return "border-slate-200 bg-slate-50 text-slate-700";
}

function Badge({ children, type }) {
	return (
		<span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${badgeClass(type)}`}>
			{children}
		</span>
	);
}

function Segment({ items, value, onChange, label }) {
	return (
		<div>
			{label ? (
				<p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
					{label}
				</p>
			) : null}
			<div className="inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
				{items.map((item) => (
					<button
						key={item.value}
						type="button"
						onClick={() => onChange(item.value)}
						className={`rounded-xl px-3 py-2 text-sm font-black transition ${
							value === item.value
								? "bg-blue-600 text-white shadow-sm"
								: "text-slate-600 hover:bg-slate-50"
						}`}
					>
						{item.label}
					</button>
				))}
			</div>
		</div>
	);
}

function KpiCard({ title, value, helper, icon: Icon, tone = "blue", onClick }) {
	const tones = {
		blue: "bg-blue-50 text-blue-700",
		green: "bg-emerald-50 text-emerald-700",
		orange: "bg-orange-50 text-orange-700",
		purple: "bg-violet-50 text-violet-700",
		red: "bg-red-50 text-red-700",
		slate: "bg-slate-50 text-slate-700",
	};
	const clickable = typeof onClick === "function";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={!clickable}
			className={`rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition ${
				clickable ? "hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md" : ""
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
						{title}
					</p>
					<p className="mt-2 text-3xl font-black text-slate-950">
						{typeof value === "string" ? value : formatNumber(value)}
					</p>
					{helper ? (
						<p className="mt-1 text-xs font-bold text-slate-500">{helper}</p>
					) : null}
				</div>
				<div className={`rounded-2xl p-3 ${tones[tone] || tones.blue}`}>
					<Icon className="h-5 w-5" />
				</div>
			</div>
		</button>
	);
}

function MiniTechCard({ title, value, helper, tone, onClick }) {
	const toneClass =
		tone === "green"
			? "from-emerald-500 to-teal-600"
			: tone === "orange"
				? "from-orange-500 to-amber-600"
				: "from-blue-600 to-indigo-600";
	return (
		<button
			type="button"
			onClick={onClick}
			className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
		>
			<div className={`mb-3 h-1.5 rounded-full bg-gradient-to-r ${toneClass}`} />
			<p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
				{title}
			</p>
			<div className="mt-2 flex items-end justify-between gap-3">
				<strong className="text-3xl font-black text-slate-950">
					{formatNumber(value)}
				</strong>
				<span className="text-xs font-bold text-slate-500">{helper}</span>
			</div>
		</button>
	);
}

function Podium({ items = [], dimension }) {
	if (!items.length) {
		return (
			<div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
				<Trophy className="mx-auto h-8 w-8 text-slate-300" />
				<p className="mt-3 text-sm font-black text-slate-700">
					Nenhuma producao para destacar neste periodo.
				</p>
			</div>
		);
	}
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">Destaques</h2>
					<p className="text-sm font-semibold text-slate-500">
						Top 3 do recorte selecionado.
					</p>
				</div>
				<Medal className="h-5 w-5 text-amber-500" />
			</div>
			<div className="grid gap-3 lg:grid-cols-3">
				{items.map((item, index) => (
					<button
						key={`${item.id}-${index}`}
						type="button"
						className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
							index === 0
								? "border-amber-200 bg-amber-50"
								: "border-slate-200 bg-slate-50"
						}`}
					>
						<div className="flex items-start justify-between gap-3">
							<span className="rounded-2xl bg-white px-3 py-2 text-lg font-black text-slate-950 shadow-sm">
								{item.position}o
							</span>
							<Badge type={item.type}>{item.typeLabel || item.type || dimension}</Badge>
						</div>
						<h3 className="mt-4 line-clamp-2 text-lg font-black text-slate-950">
							{item.name}
						</h3>
						<p className="mt-1 line-clamp-1 text-xs font-bold text-slate-500">
							{item.responsibleName || item.channelsLabel || "Sem responsavel"}
						</p>
						<div className="mt-4 flex items-end justify-between">
							<strong className="text-3xl font-black text-slate-950">
								{formatNumber(item.production)}
							</strong>
							<span className="text-sm font-black text-slate-600">
								{formatPercent(item.participation)}
							</span>
						</div>
					</button>
				))}
			</div>
		</section>
	);
}

function LoadingBlock() {
	return (
		<div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			{Array.from({ length: 6 }).map((_, index) => (
				<div key={index} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
			))}
		</div>
	);
}

function Chips({ filters, setters }) {
	const chips = [];
	if (filters.search) chips.push(["Busca", filters.search, () => setters.setSearch("")]);
	if (filters.city) chips.push(["Cidade", filters.city, () => setters.setCity("")]);
	if (filters.osType) chips.push(["Tipo OS", filters.osType, () => setters.setOsType("")]);
	if (filters.regionalId) chips.push(["Regional", filters.regionalId, () => setters.setRegionalId("")]);
	if (filters.agentId) chips.push(["Agente", filters.agentId, () => setters.setAgentId("")]);
	if (!chips.length) return null;
	return (
		<div className="flex flex-wrap gap-2">
			{chips.map(([label, value, onRemove]) => (
				<button
					key={`${label}-${value}`}
					type="button"
					onClick={onRemove}
					className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700"
				>
					{label}: {value}
					<X className="h-3.5 w-3.5" />
				</button>
			))}
		</div>
	);
}

function FiltersDrawer({ open, onClose, filters, options, setters }) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-[90] bg-slate-950/40">
			<div className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
							Filtros
						</p>
						<h2 className="mt-1 text-2xl font-black text-slate-950">
							Recorte operacional
						</h2>
					</div>
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2">
						<X className="h-5 w-5" />
					</button>
				</div>
				<div className="mt-6 space-y-4">
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Busca</span>
						<input
							value={filters.search}
							onChange={(event) => setters.setSearch(event.target.value)}
							placeholder="Buscar tecnico, regional, agente ou cidade"
							className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Regional</span>
						<select
							value={filters.regionalId}
							onChange={(event) => setters.setRegionalId(event.target.value)}
							className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"
						>
							<option value="">Todas as regionais</option>
							{(options.regionals || []).map((item) => (
								<option key={item.id} value={item.id}>{item.name}</option>
							))}
						</select>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Agente</span>
						<select
							value={filters.agentId}
							onChange={(event) => setters.setAgentId(event.target.value)}
							className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"
						>
							<option value="">Todos os agentes</option>
							{(options.agents || []).map((item) => (
								<option key={item.id} value={item.id}>{item.name}</option>
							))}
						</select>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Cidade</span>
						<select
							value={filters.city}
							onChange={(event) => setters.setCity(event.target.value)}
							className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"
						>
							<option value="">Todas as cidades</option>
							{(options.cities || []).map((item) => (
								<option key={item} value={item}>{item}</option>
							))}
						</select>
					</label>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">Tipo de O.S.</span>
						<select
							value={filters.osType}
							onChange={(event) => setters.setOsType(event.target.value)}
							className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"
						>
							<option value="">Todos os tipos</option>
							{(options.osTypes || []).map((item) => (
								<option key={item} value={item}>{item}</option>
							))}
						</select>
					</label>
				</div>
			</div>
		</div>
	);
}

function HowItWorksDrawer({ open, onClose }) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-[90] bg-slate-950/40">
			<div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
							Como funciona
						</p>
						<h2 className="mt-1 text-2xl font-black text-slate-950">
							Ranking usa a mesma Meta do HubSoft
						</h2>
					</div>
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2">
						<X className="h-5 w-5" />
					</button>
				</div>
				<div className="mt-6 space-y-4 text-sm font-semibold leading-6 text-slate-600">
					<p>
						Os numeros partem das sincronizacoes de Meta do HubSoft, ja
						classificadas pelo Classification Engine em Retirada, Regional, AA ou
						Nao classificado.
					</p>
					<p>
						A dimensao de tecnico usa `tecnicos[].id` e `tecnicos[].name` salvos
						no registro da OS. Uma OS continua valendo uma unica producao.
					</p>
					<p>
						OS sem tecnico ficam na cobertura de auditoria. OS com multiplos
						tecnicos nao sao distribuidas individualmente ate existir regra
						operacional definida.
					</p>
					<p>
						Ao abrir qualquer linha, o drawer mostra a composicao: canal,
						responsavel, cidades, evolucao diaria e as OS que formam o numero.
					</p>
				</div>
			</div>
		</div>
	);
}

function DistributionList({ title, items = [], empty = "Sem dados", pageSize = 5 }) {
	const [page, setPage] = useState(1);
	const total = items.length;
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(page, pages);
	const start = total ? (safePage - 1) * pageSize : 0;
	const end = Math.min(total, safePage * pageSize);
	const pageItems = items.slice(start, end);

	return (
		<div className="flex rounded-2xl border border-slate-200 bg-white p-4">
			<div className="flex min-h-0 w-full flex-col">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h4 className="text-sm font-black text-slate-950">{title}</h4>
						<p className="mt-0.5 text-xs font-bold text-slate-500">
							{total ? `${formatNumber(start + 1)}-${formatNumber(end)} de ${formatNumber(total)}` : empty}
						</p>
					</div>
					{total > pageSize ? (
						<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
							{safePage}/{pages}
						</span>
					) : null}
				</div>
				<div className="mt-3 space-y-2">
				{items.length ? (
					pageItems.map((item) => (
						<div key={`${item.name || item.channel}-${item.total}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
							<span className="line-clamp-1 text-sm font-bold text-slate-700">
								{item.name || item.label || item.channel}
							</span>
							<strong className="text-sm font-black text-slate-950">
								{formatNumber(item.total)}
							</strong>
						</div>
					))
				) : (
					<p className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-500">
						{empty}
					</p>
				)}
				</div>
				{total > pageSize ? (
					<div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
						<button
							type="button"
							disabled={safePage <= 1}
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40"
						>
							<ArrowLeft className="h-3.5 w-3.5" />
							Anterior
						</button>
						<button
							type="button"
							disabled={safePage >= pages}
							onClick={() => setPage((current) => Math.min(pages, current + 1))}
							className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40"
						>
							Proxima
							<ArrowRight className="h-3.5 w-3.5" />
						</button>
					</div>
				) : null}
			</div>
		</div>
	);
}

function DetailDrawer({ item, filters, onClose }) {
	const [detail, setDetail] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [recordsPage, setRecordsPage] = useState(1);
	const [recordsLimit, setRecordsLimit] = useState(20);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			if (!item) return;
			setLoading(true);
			setError("");
			setRecordsPage(1);
			try {
				const response = await buscarRankingDetalhe({ ...filters, id: item.id });
				if (!cancelled) setDetail(response);
			} catch (err) {
				if (!cancelled) setError(err.message || "Nao foi possivel carregar o detalhe.");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [item, filters]);

	if (!item) return null;
	const evolution = detail?.evolution || [];
	const maxEvolution = Math.max(...evolution.map((entry) => Number(entry.total || 0)), 1);
	const records = detail?.records || [];
	const recordsPages = Math.max(1, Math.ceil(records.length / recordsLimit));
	const recordsStart = records.length ? (recordsPage - 1) * recordsLimit : 0;
	const recordsEnd = Math.min(records.length, recordsPage * recordsLimit);
	const pagedRecords = records.slice(recordsStart, recordsEnd);

	return (
		<div className="fixed inset-0 z-[80] bg-slate-950/40">
			<div className="absolute right-0 top-0 h-full w-full max-w-5xl overflow-y-auto bg-slate-50 shadow-2xl">
				<div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-6 backdrop-blur">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
								Detalhamento
							</p>
							<h2 className="mt-1 text-2xl font-black text-slate-950">
								{item.name}
							</h2>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								{item.id?.startsWith("id:") ? `ID HubSoft: ${item.id.replace("id:", "")} · ` : ""}
								{item.typeLabel || item.type} · {formatNumber(item.production)} OS
							</p>
						</div>
						<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2">
							<X className="h-5 w-5" />
						</button>
					</div>
				</div>
				<div className="space-y-5 p-6">
					{error ? (
						<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
							{error}
						</div>
					) : null}
					{loading ? <LoadingBlock /> : null}
					{detail ? (
						<>
							<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
								<div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
									<div className="rounded-2xl bg-slate-950 p-5 text-white">
										<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-200">
											Resumo auditavel
										</p>
										<strong className="mt-4 block text-5xl font-black">
											{formatNumber(detail.stats?.production)}
										</strong>
										<span className="text-sm font-bold text-slate-300">
											OS compoem este numero
										</span>
										<div className="mt-5 flex flex-wrap gap-2">
											<Badge type={item.type}>{item.typeLabel || item.type}</Badge>
											<span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">
												{formatNumber(records.length)} registros
											</span>
										</div>
									</div>
									<div className="grid gap-3 sm:grid-cols-3">
										<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
											<p className="text-xs font-black uppercase text-slate-500">Media/dia</p>
											<strong className="mt-2 block text-2xl font-black text-slate-950">
												{formatDecimal(detail.stats?.averagePerDay)}
											</strong>
										</div>
										<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
											<p className="text-xs font-black uppercase text-slate-500">Dias ativos</p>
											<strong className="mt-2 block text-2xl font-black text-slate-950">
												{formatNumber(detail.stats?.activeDays)}
											</strong>
										</div>
										<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
											<p className="text-xs font-black uppercase text-slate-500">Tecnicos</p>
											<strong className="mt-2 block text-2xl font-black text-slate-950">
												{formatNumber(detail.stats?.uniqueTechnicians)}
											</strong>
										</div>
										<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-3">
											<p className="text-xs font-black uppercase text-slate-500">Ultima producao</p>
											<strong className="mt-2 block text-lg font-black text-slate-950">
												{formatDateTime(detail.stats?.lastProduction)}
											</strong>
										</div>
									</div>
								</div>
							</div>
							<div className="grid gap-4 xl:grid-cols-4">
								<DistributionList title="Producao por canal" items={detail.channels} />
								<DistributionList title="Responsaveis" items={detail.owners} />
								<DistributionList title="Cidades" items={detail.cities} />
								<DistributionList title="Ranking interno de tecnicos" items={detail.technicianRanking} />
							</div>
							<div className="rounded-2xl border border-slate-200 bg-white p-4">
								<h3 className="text-sm font-black text-slate-950">Evolucao diaria</h3>
								<div className="mt-4 space-y-2">
									{evolution.length ? (
										evolution.map((entry) => (
											<div key={entry.day} className="grid grid-cols-[96px_1fr_52px] items-center gap-3">
												<span className="text-xs font-black text-slate-500">{entry.day}</span>
												<div className="h-3 overflow-hidden rounded-full bg-slate-100">
													<div
														className="h-full rounded-full bg-blue-600"
														style={{ width: `${Math.max(4, (Number(entry.total || 0) / maxEvolution) * 100)}%` }}
													/>
												</div>
												<strong className="text-right text-sm font-black">{entry.total}</strong>
											</div>
										))
									) : (
										<p className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-500">Sem evolucao.</p>
									)}
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
								<div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
									<div>
										<h3 className="font-black text-slate-950">OS que formam este numero</h3>
										<p className="text-sm font-semibold text-slate-500">
											Mostrando {formatNumber(recordsStart + (records.length ? 1 : 0))}-{formatNumber(recordsEnd)} de {formatNumber(records.length)} OS.
										</p>
									</div>
									<label className="flex items-center gap-2 text-sm font-black text-slate-600">
										Linhas
										<select
											value={recordsLimit}
											onChange={(event) => {
												setRecordsLimit(Number(event.target.value));
												setRecordsPage(1);
											}}
											className="rounded-xl border border-slate-200 bg-white px-3 py-2"
										>
											<option value={10}>10</option>
											<option value={20}>20</option>
											<option value={50}>50</option>
										</select>
									</label>
								</div>
								<div className="overflow-x-auto">
									<table className="w-full min-w-[940px] text-left text-sm">
										<thead className="bg-slate-50 text-xs uppercase text-slate-500">
											<tr>
												<th className="px-4 py-3">OS</th>
												<th className="px-4 py-3">Tecnico</th>
												<th className="px-4 py-3">Canal</th>
												<th className="px-4 py-3">Responsavel</th>
												<th className="px-4 py-3">Cidade</th>
												<th className="px-4 py-3">Data</th>
												<th className="px-4 py-3">Classificacao</th>
											</tr>
										</thead>
										<tbody>
											{pagedRecords.map((record) => (
												<tr key={`${record.hubsoftId}-${record.number}`} className="border-t border-slate-100">
													<td className="px-4 py-3 font-black text-blue-700">{record.number || record.hubsoftId}</td>
													<td className="px-4 py-3 font-bold text-slate-700">{record.technicianName || "-"}</td>
													<td className="px-4 py-3"><Badge type={record.channel}>{record.channel}</Badge></td>
													<td className="px-4 py-3 text-slate-700">{record.ownerName || "-"}</td>
													<td className="px-4 py-3 text-slate-700">{record.city || "-"}</td>
													<td className="px-4 py-3 text-slate-600">{formatDateTime(record.finishedAt)}</td>
													<td className="px-4 py-3 text-slate-500">{record.classificationReason || record.classificationRule || "-"}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
								<div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-sm font-bold text-slate-500">
										Pagina {recordsPage} de {recordsPages}
									</p>
									<div className="flex items-center gap-2">
										<button
											type="button"
											disabled={recordsPage <= 1}
											onClick={() => setRecordsPage((current) => Math.max(1, current - 1))}
											className="rounded-xl border border-slate-200 p-2 disabled:opacity-40"
										>
											<ArrowLeft className="h-4 w-4" />
										</button>
										<button
											type="button"
											disabled={recordsPage >= recordsPages}
											onClick={() => setRecordsPage((current) => Math.min(recordsPages, current + 1))}
											className="rounded-xl border border-slate-200 p-2 disabled:opacity-40"
										>
											<ArrowRight className="h-4 w-4" />
										</button>
									</div>
								</div>
							</div>
						</>
					) : null}
				</div>
			</div>
		</div>
	);
}

function RankingTable({ data, dimension, loading, onSelect, page, setPage, limit, setLimit }) {
	const rows = data?.ranking || [];
	const total = data?.pagination?.total || 0;
	const pages = data?.pagination?.pages || 1;
	const from = total ? (page - 1) * limit + 1 : 0;
	const to = Math.min(total, page * limit);

	const title =
		dimension === "technician"
			? "Tecnico"
			: dimension === "regional"
				? "Regional"
				: dimension === "agent"
					? "Agente"
					: "Cidade";

	return (
		<section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
			<div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-xl font-black text-slate-950">Ranking completo</h2>
					<p className="text-sm font-semibold text-slate-500">
						Clique em uma linha para ver OS, evolucao e distribuicao.
					</p>
				</div>
				<label className="flex items-center gap-2 text-sm font-black text-slate-600">
					Linhas
					<select
						value={limit}
						onChange={(event) => {
							setLimit(Number(event.target.value));
							setPage(1);
						}}
						className="rounded-xl border border-slate-200 bg-white px-3 py-2"
					>
						<option value={20}>20</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
					</select>
				</label>
			</div>
			{loading ? <div className="p-5"><LoadingBlock /></div> : null}
			{!loading && rows.length ? (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1100px] text-left text-sm">
						<thead className="bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th className="px-5 py-4">#</th>
								<th className="px-5 py-4">{title}</th>
								<th className="px-5 py-4">Tipo</th>
								<th className="px-5 py-4">Responsavel</th>
								<th className="px-5 py-4 text-right">Producao</th>
								{dimension !== "technician" ? (
									<th className="px-5 py-4 text-right">Tecnicos</th>
								) : null}
								<th className="px-5 py-4 text-right">Participacao</th>
								<th className="px-5 py-4 text-right">Media/dia</th>
								<th className="px-5 py-4">Ultima producao</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((item) => (
								<tr
									key={`${item.dimension}-${item.id}`}
									onClick={() => onSelect(item)}
									className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/50"
								>
									<td className="px-5 py-4">
										<span className="inline-flex min-w-10 justify-center rounded-xl bg-slate-100 px-3 py-2 font-black text-slate-900">
											{item.position}o
										</span>
									</td>
									<td className="px-5 py-4">
										<div className="line-clamp-2 font-black text-slate-950">{item.name}</div>
										{item.channelsLabel ? (
											<div className="mt-1 text-xs font-bold text-slate-500">{item.channelsLabel}</div>
										) : null}
									</td>
									<td className="px-5 py-4"><Badge type={item.type}>{item.typeLabel || item.type}</Badge></td>
									<td className="px-5 py-4 text-slate-700">{item.responsibleName || "-"}</td>
									<td className="px-5 py-4 text-right text-lg font-black text-slate-950">{formatNumber(item.production)}</td>
									{dimension !== "technician" ? (
										<td className="px-5 py-4 text-right font-black text-slate-700">{formatNumber(item.uniqueTechnicians)}</td>
									) : null}
									<td className="px-5 py-4 text-right font-black text-slate-700">{formatPercent(item.participation)}</td>
									<td className="px-5 py-4 text-right font-bold text-slate-700">{formatDecimal(item.averagePerDay)}</td>
									<td className="px-5 py-4 text-slate-600">{formatDateTime(item.lastProduction)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
			{!loading && !rows.length ? (
				<div className="p-10 text-center">
					<Search className="mx-auto h-8 w-8 text-slate-300" />
					<h3 className="mt-3 text-lg font-black text-slate-950">Sem producao no recorte</h3>
					<p className="text-sm font-semibold text-slate-500">Tente outro periodo ou remova filtros.</p>
				</div>
			) : null}
			<div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm font-bold text-slate-500">
					Mostrando {formatNumber(from)}-{formatNumber(to)} de {formatNumber(total)}
				</p>
				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={page <= 1}
						onClick={() => setPage((current) => Math.max(1, current - 1))}
						className="rounded-xl border border-slate-200 p-2 disabled:opacity-40"
					>
						<ArrowLeft className="h-4 w-4" />
					</button>
					<span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
						{page} / {pages}
					</span>
					<button
						type="button"
						disabled={page >= pages}
						onClick={() => setPage((current) => current + 1)}
						className="rounded-xl border border-slate-200 p-2 disabled:opacity-40"
					>
						<ArrowRight className="h-4 w-4" />
					</button>
				</div>
			</div>
		</section>
	);
}

export default function RankingPage() {
	const initialRange = useMemo(() => getPresetRange("today"), []);
	const [periodPreset, setPeriodPreset] = useState("today");
	const [startDate, setStartDate] = useState(initialRange.startDate);
	const [endDate, setEndDate] = useState(initialRange.endDate);
	const [dimension, setDimension] = useState("technician");
	const [technicianChannel, setTechnicianChannel] = useState("all");
	const [search, setSearch] = useState("");
	const [city, setCity] = useState("");
	const [osType, setOsType] = useState("");
	const [regionalId, setRegionalId] = useState("");
	const [agentId, setAgentId] = useState("");
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(20);
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [howOpen, setHowOpen] = useState(false);
	const [selected, setSelected] = useState(null);

	const filters = useMemo(
		() => ({
			start_date: startDate,
			end_date: endDate,
			dimension,
			technician_channel: dimension === "technician" ? technicianChannel : "",
			search,
			city,
			os_type: osType,
			regional_id: regionalId,
			agent_id: agentId,
			page,
			limit,
		}),
		[
			startDate,
			endDate,
			dimension,
			technicianChannel,
			search,
			city,
			osType,
			regionalId,
			agentId,
			page,
			limit,
		],
	);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError("");
			try {
				const response = await buscarRanking(filters);
				if (!cancelled) setData(response);
			} catch (err) {
				if (!cancelled) setError(err.message || "Nao foi possivel carregar o ranking.");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [filters]);

	function applyPreset(value) {
		setPeriodPreset(value);
		if (value !== "custom") {
			const range = getPresetRange(value);
			setStartDate(range.startDate);
			setEndDate(range.endDate);
		}
		setPage(1);
	}

	function setQuickTech(channel) {
		setDimension("technician");
		setTechnicianChannel(channel);
		setPage(1);
	}

	function refresh() {
		setLoading(true);
		buscarRanking(filters)
			.then(setData)
			.catch((err) => setError(err.message || "Nao foi possivel atualizar."))
			.finally(() => setLoading(false));
	}

	const summary = data?.summary || {};
	const options = data?.filters || {};
	const classificationOk = Number(summary.unclassified || 0) === 0;
	const activeFilterState = { search, city, osType, regionalId, agentId };
	const setters = {
		setSearch: (value) => {
			setSearch(value);
			setPage(1);
		},
		setCity: (value) => {
			setCity(value);
			setPage(1);
		},
		setOsType: (value) => {
			setOsType(value);
			setPage(1);
		},
		setRegionalId: (value) => {
			setRegionalId(value);
			setPage(1);
		},
		setAgentId: (value) => {
			setAgentId(value);
			setPage(1);
		},
	};

	return (
		<div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 lg:px-8">
			<div className="mx-auto max-w-[1840px] space-y-5">
				<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
					<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
						<div>
							<div className="flex items-center gap-3">
								<div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
									<Trophy className="h-7 w-7" />
								</div>
								<div>
									<h1 className="text-3xl font-black text-slate-950">Ranking</h1>
									<p className="text-sm font-semibold text-slate-500">
										Produtividade por tecnico, regional, agente autorizado e cidade.
									</p>
								</div>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${
								data?.lastSync?.stale ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
							}`}>
								<span className="h-2 w-2 rounded-full bg-current" />
								{formatSyncAge(data?.lastSync)}
							</span>
							<button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
								<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
								Atualizar
							</button>
							<button type="button" onClick={() => baixarRankingXlsx(filters)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">
								<Download className="h-4 w-4" />
								Exportar
							</button>
						</div>
					</div>
				</section>

				<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
						<div className="space-y-4">
							<Segment items={PERIOD_PRESETS} value={periodPreset} onChange={applyPreset} label="Periodo" />
							{periodPreset === "custom" ? (
								<div className="flex flex-wrap gap-2">
									<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" />
									<input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" />
								</div>
							) : null}
						</div>
						<div className="space-y-4">
							<Segment
								items={DIMENSIONS}
								value={dimension}
								onChange={(value) => {
									setDimension(value);
									setPage(1);
								}}
								label="Ranking por"
							/>
							{dimension === "technician" ? (
								<Segment
									items={TECH_CHANNELS}
									value={technicianChannel}
									onChange={(value) => {
										setTechnicianChannel(value);
										setPage(1);
									}}
									label="Tipo de tecnico"
								/>
							) : null}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
								<SlidersHorizontal className="h-4 w-4" />
								Filtros
							</button>
							<button type="button" onClick={() => setHowOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
								<Info className="h-4 w-4" />
								Como funciona
							</button>
						</div>
					</div>
					<div className="mt-4">
						<Chips filters={activeFilterState} setters={setters} />
					</div>
				</section>

				{error ? (
					<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
						{error}
					</div>
				) : null}

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
					<KpiCard title="Producao OS" value={summary.classified} helper="OS classificadas" icon={BarChart3} tone="blue" />
					<KpiCard title="Tecnicos com producao" value={summary.activeTechnicians} helper="Tecnicos unicos no periodo" icon={Users} tone="purple" />
					<KpiCard title="Regionais" value={summary.regional} helper={`${formatNumber(summary.regionals)} responsaveis`} icon={Medal} tone="green" />
					<KpiCard title="Agentes" value={summary.aa} helper={`${formatNumber(summary.agents)} responsaveis`} icon={Medal} tone="orange" />
					<KpiCard
						title={classificationOk ? "Tudo classificado" : "Nao classificados"}
						value={summary.unclassified}
						helper={classificationOk ? "Sem pendencias" : "Requer auditoria"}
						icon={classificationOk ? CheckCircle2 : AlertTriangle}
						tone={classificationOk ? "green" : "red"}
					/>
				</div>

				<div className="grid gap-4 lg:grid-cols-3">
					<MiniTechCard title="Tecnicos de Retirada" value={summary.withdrawalTechnicians} helper="filtrar" tone="blue" onClick={() => setQuickTech("withdrawal")} />
					<MiniTechCard title="Tecnicos Regionais" value={summary.regionalTechnicians} helper="filtrar" tone="green" onClick={() => setQuickTech("regional")} />
					<MiniTechCard title="Tecnicos AA" value={summary.agentTechnicians} helper="filtrar" tone="orange" onClick={() => setQuickTech("agent")} />
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<div className="flex items-center gap-2">
							<CheckCircle2 className="h-5 w-5 text-emerald-600" />
							<p className="text-sm font-black text-slate-950">
								Cobertura de tecnico: {formatPercent(summary.coverage?.coveragePercent)}
							</p>
						</div>
						<p className="text-sm font-semibold text-slate-500">
							Atribuiveis: {formatNumber(summary.coverage?.attributable)} · Sem tecnico: {formatNumber(summary.coverage?.noTechnician)} · Multiplos: {formatNumber(summary.coverage?.multipleTechnicians)}
						</p>
					</div>
				</div>

				<Podium items={data?.podium || []} dimension={dimension} />

				<RankingTable
					data={data}
					dimension={dimension}
					loading={loading}
					onSelect={setSelected}
					page={page}
					setPage={setPage}
					limit={limit}
					setLimit={setLimit}
				/>
			</div>

			<FiltersDrawer
				open={filtersOpen}
				onClose={() => setFiltersOpen(false)}
				filters={activeFilterState}
				options={options}
				setters={setters}
			/>
			<HowItWorksDrawer open={howOpen} onClose={() => setHowOpen(false)} />
			<DetailDrawer item={selected} filters={filters} onClose={() => setSelected(null)} />
		</div>
	);
}
