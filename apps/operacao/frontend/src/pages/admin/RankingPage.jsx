import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Trophy } from "lucide-react";
import { fetchRotRanking, fetchRotRegionals } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const FILTROS = [
	{ id: "week", label: "Semana" },
	{ id: "month", label: "Mês/Ano" },
	{ id: "lastMonth", label: "Mês Anterior" },
	{ id: "year", label: "Ano" },
	{ id: "custom", label: "Período" },
];

function pad2(n) {
	return String(n).padStart(2, "0");
}
function ymd(date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function resolveInterval(filtro, dateFilter, customStart, customEnd) {
	const today = new Date();
	if (filtro === "week") {
		const start = new Date(today);
		start.setDate(start.getDate() - 6);
		return { dataInicio: ymd(start), dataFim: ymd(today) };
	}
	if (filtro === "month") {
		const [ano, mes] = (dateFilter || `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`).split("-").map(Number);
		return { dataInicio: ymd(new Date(ano, mes - 1, 1)), dataFim: ymd(new Date(ano, mes, 0)) };
	}
	if (filtro === "lastMonth") {
		const ref = new Date(today.getFullYear(), today.getMonth() - 1, 1);
		return { dataInicio: ymd(new Date(ref.getFullYear(), ref.getMonth(), 1)), dataFim: ymd(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)) };
	}
	if (filtro === "year") {
		const ano = Number((dateFilter || String(today.getFullYear())).split("-")[0]) || today.getFullYear();
		return { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
	}
	if (filtro === "custom") {
		return { dataInicio: customStart || undefined, dataFim: customEnd || undefined };
	}
	return {};
}

// Fiel a rot/src/pages/RankingPage.tsx — calculado em cima dos Chamados
// (pontos por tipo de serviço), sem tabela propria.
export default function RankingPage() {
	const { user } = useRotAuth();
	const isGlobal = Boolean(user?.isGlobal || user?.isAdmin);
	const [items, setItems] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [criterio, setCriterio] = useState("productivity");
	const [filtro, setFiltro] = useState("month");
	const [dateFilter, setDateFilter] = useState(`${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`);
	const [customStart, setCustomStart] = useState("");
	const [customEnd, setCustomEnd] = useState("");
	const [regionalFiltro, setRegionalFiltro] = useState("all");

	const interval = useMemo(() => resolveInterval(filtro, dateFilter, customStart, customEnd), [filtro, dateFilter, customStart, customEnd]);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [ranking, regionalList] = await Promise.all([
				fetchRotRanking({ dataInicio: interval.dataInicio, dataFim: interval.dataFim, regionalId: regionalFiltro }),
				regionals.length ? Promise.resolve(regionals) : fetchRotRegionals(),
			]);
			setItems(ranking);
			if (!regionals.length) setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o ranking.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [interval.dataInicio, interval.dataFim, regionalFiltro]);

	const sorted = useMemo(() => {
		return [...items].sort((a, b) => (criterio === "productivity" ? b.points - a.points : b.ticketsCount - a.ticketsCount));
	}, [items, criterio]);

	const titulo = filtro === "lastMonth"
		? "Mês Anterior"
		: filtro === "month"
			? new Date(`${dateFilter}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
			: filtro === "week"
				? "Últimos 7 dias"
				: filtro === "year"
					? `Ano de ${dateFilter.split("-")[0]}`
					: "Período personalizado";

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
						<Trophy size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Ranking de Performance</h1>
						<p className="text-sm font-semibold text-slate-500">Calculado a partir dos Chamados registrados.</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<select value={criterio} onChange={(e) => setCriterio(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100">
						<option value="productivity">Critério: Produtividade (Pontos)</option>
						<option value="quantity">Critério: Quantidade (Chamados)</option>
					</select>
					{isGlobal ? (
						<select value={regionalFiltro} onChange={(e) => setRegionalFiltro(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100">
							<option value="all">Todas as Regionais</option>
							{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
						</select>
					) : null}
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
				</div>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				<div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
					{FILTROS.map((f) => (
						<button key={f.id} type="button" onClick={() => setFiltro(f.id)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${filtro === f.id ? "bg-orange-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>
							{f.label}
						</button>
					))}
				</div>
				{filtro === "month" ? (
					<input type="month" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-10 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-bold text-blue-900 outline-none" />
				) : null}
				{filtro === "year" ? (
					<input type="number" value={dateFilter.split("-")[0]} onChange={(e) => setDateFilter(`${e.target.value}-01`)} className="h-10 w-24 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-bold text-blue-900 outline-none" />
				) : null}
				{filtro === "custom" ? (
					<div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2">
						<input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded border px-2 py-1 text-xs outline-none" />
						<input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded border px-2 py-1 text-xs outline-none" />
					</div>
				) : null}
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-100 bg-slate-50 p-6 text-center">
					<p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Relatório de Performance</p>
					<h3 className="text-xl font-black uppercase tracking-tight text-blue-950">Desempenho da Equipe — {titulo}</h3>
					{regionalFiltro !== "all" ? <p className="mt-1 text-xs font-bold uppercase text-orange-600">Regional: {regionals.find((r) => r.id === regionalFiltro)?.name}</p> : null}
				</div>

				{loading ? (
					<Spinner fullScreen={false} />
				) : (
					<div className="divide-y divide-slate-100">
						{sorted.map((rankingItem, index) => (
							<div key={rankingItem.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-blue-50/50">
								<div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black shadow-sm ${
									index === 0 ? "scale-110 bg-yellow-400 text-white" : index === 1 ? "bg-slate-300 text-slate-700" : index === 2 ? "bg-orange-400 text-white" : "bg-slate-100 text-slate-400"
								}`}>
									{index + 1}º
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-black text-slate-900">{rankingItem.name}</p>
									<p className="text-xs font-semibold text-slate-400">{rankingItem.roleName}</p>
								</div>
								<div className="shrink-0 text-right">
									<p className="text-lg font-black text-blue-950">{criterio === "productivity" ? rankingItem.points : rankingItem.ticketsCount}</p>
									<p className="text-[10px] font-bold uppercase text-slate-400">{criterio === "productivity" ? "pontos" : "chamados"}</p>
								</div>
							</div>
						))}
						{!sorted.length ? <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum chamado registrado neste período.</div> : null}
					</div>
				)}
			</div>
		</div>
	);
}
