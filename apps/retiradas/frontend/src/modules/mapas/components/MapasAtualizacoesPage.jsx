import {
	ArrowDownRight,
	ArrowUpRight,
	BadgeCheck,
	CalendarDays,
	Clock3,
	FileSearch,
	Map,
	RefreshCw,
	Route,
	Search,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import {
	buscarAtualizacaoMapa,
	listarAtualizacoesMapa,
} from "../services/mapasAtualizacoesService";

function todayKey() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function formatNumber(value) {
	return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function MetricCard({ title, value, helper, icon: Icon, tone = "blue" }) {
	const tones = {
		blue: "bg-blue-50 text-blue-700 border-blue-100",
		green: "bg-emerald-50 text-emerald-700 border-emerald-100",
		orange: "bg-orange-50 text-orange-700 border-orange-100",
		red: "bg-red-50 text-red-700 border-red-100",
		slate: "bg-slate-50 text-slate-700 border-slate-100",
	};
	return (
		<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-xs font-black uppercase text-slate-500">{title}</p>
					<strong className="mt-2 block text-3xl font-black text-slate-950">
						{value}
					</strong>
					<p className="mt-1 text-sm font-semibold text-slate-500">{helper}</p>
				</div>
				<span className={`rounded-2xl border p-3 ${tones[tone] || tones.blue}`}>
					<Icon className="h-5 w-5" />
				</span>
			</div>
		</div>
	);
}

function RankingList({ title, items = [], empty = "Sem dados" }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4">
			<h3 className="text-sm font-black text-slate-950">{title}</h3>
			<div className="mt-3 space-y-2">
				{items.length ? (
					items.slice(0, 5).map((item, index) => (
						<div
							key={`${item.key || item.label}-${index}`}
							className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
						>
							<span className="line-clamp-1 text-sm font-bold text-slate-700">
								{index + 1}. {item.label || item.key}
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
		</div>
	);
}

const ITEMS_PAGE_SIZE = 10;

function ItemsTable({ title, items = [], empty }) {
	const [page, setPage] = useState(1);
	const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const pageItems = items.slice(
		(safePage - 1) * ITEMS_PAGE_SIZE,
		safePage * ITEMS_PAGE_SIZE,
	);

	return (
		<section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
			<div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 className="font-black text-slate-950">{title}</h3>
					<p className="text-sm font-semibold text-slate-500">
						{formatNumber(items.length)} registro(s) · 10 por página
					</p>
				</div>
				{items.length > ITEMS_PAGE_SIZE ? (
					<div className="flex items-center gap-2 text-xs font-black text-slate-600">
						<button
							type="button"
							disabled={safePage <= 1}
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Anterior
						</button>
						<span className="rounded-lg bg-slate-100 px-3 py-2">
							{safePage} / {totalPages}
						</span>
						<button
							type="button"
							disabled={safePage >= totalPages}
							onClick={() =>
								setPage((current) => Math.min(totalPages, current + 1))
							}
							className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Próxima
						</button>
					</div>
				) : null}
			</div>
			<div className="max-h-80 overflow-auto">
				{items.length ? (
					<table className="w-full min-w-[760px] text-left text-sm">
						<thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">OS</th>
								<th className="px-4 py-3">Cidade</th>
								<th className="px-4 py-3">Tipo</th>
								<th className="px-4 py-3">Técnico</th>
								<th className="px-4 py-3">Data</th>
							</tr>
						</thead>
						<tbody>
							{pageItems.map((item) => (
								<tr key={`${item.changeType}-${item.orderId}`} className="border-t border-slate-100">
									<td className="px-4 py-3 font-black text-blue-700">
										{item.orderNumber || item.orderId}
									</td>
									<td className="px-4 py-3 font-semibold text-slate-700">
										{item.city || "-"}
									</td>
									<td className="px-4 py-3 text-slate-600">{item.type || "-"}</td>
									<td className="px-4 py-3 text-slate-600">
										{item.technicianName || "-"}
									</td>
									<td className="px-4 py-3 text-slate-500">
										{formatDateTime(item.sourceDate)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p className="p-4 text-sm font-bold text-slate-500">{empty}</p>
				)}
			</div>
			{items.length > ITEMS_PAGE_SIZE ? (
				<div className="border-t border-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
					Mostrando {formatNumber((safePage - 1) * ITEMS_PAGE_SIZE + 1)} a{" "}
					{formatNumber(Math.min(safePage * ITEMS_PAGE_SIZE, items.length))} de{" "}
					{formatNumber(items.length)}
				</div>
			) : null}
		</section>
	);
}

function DetailDrawer({ update, onClose }) {
	const [detail, setDetail] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		async function load() {
			if (!update?.id) return;
			setLoading(true);
			setError("");
			try {
				const response = await buscarAtualizacaoMapa(update.id);
				if (!cancelled) setDetail(response);
			} catch (err) {
				if (!cancelled) setError(err.message || "Falha ao carregar detalhe.");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [update?.id]);

	if (!update) return null;
	const items = detail?.items || {};
	return (
		<div className="fixed inset-0 z-[80] bg-slate-950/40">
			<div className="absolute right-0 top-0 h-full w-full max-w-6xl overflow-y-auto bg-slate-50 shadow-2xl">
				<div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-6 backdrop-blur">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
								Atualização do {update.profile === "MATCH" ? "Match" : "Mapa"}
							</p>
							<h2 className="mt-1 text-2xl font-black text-slate-950">
								{formatTime(update.detectedAt)}
							</h2>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Antes {formatNumber(update.previousTotal)} · Agora{" "}
								{formatNumber(update.currentTotal)}
							</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="rounded-xl border border-slate-200 bg-white p-2"
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</div>
				<div className="space-y-5 p-6">
					{loading ? <Spinner /> : null}
					{error ? (
						<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
							{error}
						</div>
					) : null}
					{detail ? (
						<>
							<div className="grid gap-4 lg:grid-cols-3">
								<RankingList title="Top técnicos que fecharam" items={detail.topTechnicians} />
								<RankingList title="Cidades com novas OS" items={detail.topOpenedCities} />
								<RankingList title="Cidades com fechamentos" items={detail.topClosedCities} />
							</div>
							<ItemsTable
								title="Novas OS"
								items={items.added || []}
								empty="Nenhuma O.S nova nesta atualização."
							/>
							<ItemsTable
								title="Executadas confirmadas pela Meta"
								items={items.executed || []}
								empty="Nenhuma execução confirmada pela Meta neste intervalo."
							/>
							<ItemsTable
								title="Outras saídas do mapa"
								items={items.otherRemovals || []}
								empty="Nenhuma saída sem confirmação."
							/>
							<ItemsTable
								title="Alterações de O.S"
								items={items.updated || []}
								empty="Nenhuma alteração operacional relevante."
							/>
						</>
					) : null}
				</div>
			</div>
		</div>
	);
}

export default function MapasAtualizacoesPage() {
	const [profile, setProfile] = useState("MAPA");
	const [date, setDate] = useState(todayKey());
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [selected, setSelected] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setData(await listarAtualizacoesMapa({ date, profile, limit: 50 }));
		} catch (err) {
			setError(err.message || "Falha ao carregar atualizações.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [date, profile]);

	const updates = useMemo(() => data?.updates || [], [data?.updates]);
	const summary = data?.summary || {};
	const last = useMemo(() => updates[0] || null, [updates]);

	return (
		<div className="min-h-screen bg-slate-50 p-6">
			<div className="mx-auto max-w-[1500px] space-y-6">
				<header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex items-start gap-4">
							<span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
								<Map className="h-6 w-6" />
							</span>
							<div>
								<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
									Mapas &gt; Atualizações
								</p>
								<h1 className="mt-1 text-3xl font-black text-slate-950">
									Atualizações automáticas do {profile === "MATCH" ? "Match" : "Mapa"}
								</h1>
								<p className="mt-1 text-sm font-semibold text-slate-500">
									Histórico auditável das sincronizações válidas do HubSoft.
								</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-600">
								<CalendarDays className="h-4 w-4" />
								<input
									type="date"
									value={date}
									onChange={(event) => setDate(event.target.value)}
									className="bg-transparent outline-none"
								/>
							</label>
							<button
								type="button"
								onClick={load}
								className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm"
							>
								<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
								Atualizar
							</button>
						</div>
					</div>
				</header>

				<div role="tablist" aria-label="Origem das atualizações" className="flex gap-2 border-b border-slate-200">
					{["MAPA", "MATCH"].map((value) => <button key={value} type="button" role="tab" aria-selected={profile === value} onClick={() => { setProfile(value); setSelected(null); }} className={`border-b-2 px-5 py-3 font-bold ${profile === value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{value === "MAPA" ? "Mapa" : "Match"}</button>)}
				</div>
				{error ? (
					<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
						{error}
					</div>
				) : null}

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
					<MetricCard
						title="Atualizações hoje"
						value={formatNumber(summary.updates)}
						helper={last ? `Última às ${formatTime(last.detectedAt)}` : "Nenhuma execução válida"}
						icon={Clock3}
					/>
					<MetricCard
						title="Novas OS"
						value={`+${formatNumber(summary.added)}`}
						helper="Detectadas entre snapshots"
						icon={ArrowUpRight}
						tone="green"
					/>
					<MetricCard
						title="Executadas"
						value={formatNumber(summary.executed)}
						helper="Confirmadas pela Meta"
						icon={BadgeCheck}
						tone="blue"
					/>
					<MetricCard
						title="Saldo"
						value={Number(summary.saldo || 0) >= 0 ? `+${formatNumber(summary.saldo)}` : formatNumber(summary.saldo)}
						helper="Novas menos executadas"
						icon={ArrowDownRight}
						tone={Number(summary.saldo || 0) >= 0 ? "orange" : "slate"}
					/>
					<MetricCard
						title="Última atualização"
						value={last ? formatTime(last.detectedAt) : "-"}
						helper="Somente sync COMPLETE"
						icon={Route}
						tone="slate"
					/>
				</div>

				<section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
					<div className="flex items-center justify-between border-b border-slate-100 p-5">
						<div>
							<h2 className="text-xl font-black text-slate-950">Linha do tempo</h2>
							<p className="text-sm font-semibold text-slate-500">
								Clique em uma atualização para auditar as O.S.
							</p>
						</div>
						<Search className="h-5 w-5 text-slate-400" />
					</div>
					<div className="divide-y divide-slate-100">
						{loading && !updates.length ? (
							<div className="p-8">
								<Spinner />
							</div>
						) : null}
						{updates.length ? (
							updates.map((update) => (
								<button
									key={update.id}
									type="button"
									onClick={() => setSelected(update)}
									className="grid w-full gap-4 p-5 text-left transition hover:bg-slate-50 lg:grid-cols-[110px_1fr_180px_180px_180px]"
								>
									<div>
										<strong className="text-2xl font-black text-slate-950">
											{formatTime(update.detectedAt)}
										</strong>
										<p className="text-xs font-bold text-slate-500">
											{formatDateTime(update.detectedAt)}
										</p>
									</div>
									<div>
										<p className="text-sm font-black text-slate-950">
											{profile === "MATCH" ? "Match" : "Mapa"} atualizado automaticamente
										</p>
										<p className="mt-1 text-sm font-semibold text-slate-500">
											Antes {formatNumber(update.previousTotal)} · Agora{" "}
											{formatNumber(update.currentTotal)} · Permanentes{" "}
											{formatNumber(update.permanentCount)}
										</p>
									</div>
									<div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
										<p className="text-xs font-black uppercase">Novas</p>
										<strong className="text-xl font-black">
											+{formatNumber(update.addedCount)}
										</strong>
									</div>
									<div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
										<p className="text-xs font-black uppercase">Executadas</p>
										<strong className="text-xl font-black">
											{formatNumber(update.executedCount)}
										</strong>
									</div>
									<div className="rounded-2xl bg-orange-50 p-3 text-orange-700">
										<p className="text-xs font-black uppercase">Saldo</p>
										<strong className="text-xl font-black">
											{Number(update.saldo || 0) >= 0 ? "+" : ""}
											{formatNumber(update.saldo)}
										</strong>
									</div>
								</button>
							))
						) : !loading ? (
							<div className="p-8 text-center">
								<FileSearch className="mx-auto h-8 w-8 text-slate-300" />
								<p className="mt-3 text-sm font-black text-slate-700">
									Nenhuma atualização válida encontrada para este dia.
								</p>
							</div>
						) : null}
					</div>
				</section>
			</div>
			<DetailDrawer update={selected} onClose={() => setSelected(null)} />
		</div>
	);
}
