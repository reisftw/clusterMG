import { useEffect, useState } from "react";
import { LayoutDashboard, ListChecks, Trophy } from "lucide-react";
import { fetchDssDashboardIndicators, fetchDssDashboardRanking, fetchDssDashboardSummary, fetchRotRegionals } from "../../api/rotApi";
import BarList from "../../components/ui/BarList";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";

const ABSENCE_LABEL = { ferias: "Férias", afastamento: "Afastamento", folga: "Folga", atestado: "Atestado", ausencia_operacional: "Ausência operacional", outro: "Outro", nao_informado: "Não informado" };
const STATUS_LABEL = { planejado: "Planejado", disponivel: "Disponível", em_andamento: "Em andamento", enviado: "Enviado", validado: "Validado", rejeitado: "Rejeitado", cancelado: "Cancelado", atrasado: "Atrasado" };

function monthLabel(bucket) {
	if (!bucket) return "-";
	const [year, month] = bucket.split("-");
	return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function Kpi({ label, value, accent = "text-slate-950" }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
			<p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
			<p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
		</div>
	);
}

export default function DssDashboardPage() {
	const today = new Date();
	const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
	const [filters, setFilters] = useState({ dateFrom: firstOfMonth, dateTo: today.toISOString().slice(0, 10), regionalId: "", operationType: "" });
	const [regionals, setRegionals] = useState([]);
	const [summary, setSummary] = useState(null);
	const [indicators, setIndicators] = useState(null);
	const [ranking, setRanking] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		fetchRotRegionals().then(setRegionals).catch(() => setRegionals([]));
	}, []);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [summaryData, indicatorsData, rankingData] = await Promise.all([
				fetchDssDashboardSummary(filters),
				fetchDssDashboardIndicators(filters),
				fetchDssDashboardRanking(filters),
			]);
			setSummary(summaryData);
			setIndicators(indicatorsData);
			setRanking(rankingData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o dashboard.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><LayoutDashboard size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">DSS · Dashboard</h1>
						<p className="text-sm font-semibold text-slate-500">Indicadores do período selecionado.</p>
					</div>
				</div>
			</header>

			<div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-[160px_160px_1fr_1fr_auto]">
				<input type="date" value={filters.dateFrom} onChange={(e) => setFilters((c) => ({ ...c, dateFrom: e.target.value }))} className="rot-input" />
				<input type="date" value={filters.dateTo} onChange={(e) => setFilters((c) => ({ ...c, dateTo: e.target.value }))} className="rot-input" />
				<Select value={filters.regionalId} onChange={(v) => setFilters((c) => ({ ...c, regionalId: v }))} items={regionals.map((r) => ({ id: r.id, name: r.nome || r.name }))} empty="Toda regional" />
				<Select value={filters.operationType} onChange={(v) => setFilters((c) => ({ ...c, operationType: v }))} items={[{ id: "ROT", name: "ROT" }, { id: "FIELD", name: "FIELD" }, { id: "DELIVERY", name: "DELIVERY" }]} empty="Toda operação" />
				<button type="button" onClick={load} className="rot-btn-tactile h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Filtrar</button>
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? <Spinner /> : (
				<>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<Kpi label="DSS programados" value={summary?.programados ?? 0} />
						<Kpi label="DSS realizados" value={summary?.realizados ?? 0} accent="text-emerald-700" />
						<Kpi label="DSS pendentes" value={summary?.pendentes ?? 0} accent="text-amber-700" />
						<Kpi label="DSS atrasados" value={summary?.atrasados ?? 0} accent="text-red-700" />
						<Kpi label="Participação média" value={summary?.participationAvg !== null && summary?.participationAvg !== undefined ? `${summary.participationAvg}%` : "—"} />
						<Kpi label="Cobertura" value={summary?.coverage !== null && summary?.coverage !== undefined ? `${summary.coverage}%` : "—"} />
						<Kpi label="Aguardando validação" value={summary?.awaitingValidation ?? 0} accent="text-purple-700" />
					</div>

					<div className="grid gap-4 lg:grid-cols-2">
						<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
							<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Participação por mês</h2>
							<BarList colorClass="bg-orange-500" items={(indicators?.participationByMonth || []).map((row) => ({ label: monthLabel(row.bucket), value: row.participationAvg ?? 0, displayValue: row.participationAvg !== null ? `${row.participationAvg}%` : "—" }))} />
						</section>
						<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
							<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Participação por regional</h2>
							<BarList colorClass="bg-blue-500" items={(indicators?.participationByRegional || []).filter((r) => r.label).map((row) => ({ label: row.label, value: row.participationAvg ?? 0, displayValue: row.participationAvg !== null ? `${row.participationAvg}%` : "—" }))} />
						</section>
						<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
							<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Participação por operação</h2>
							<BarList colorClass="bg-purple-500" items={(indicators?.participationByOperation || []).filter((r) => r.label).map((row) => ({ label: row.label, value: row.participationAvg ?? 0, displayValue: row.participationAvg !== null ? `${row.participationAvg}%` : "—" }))} />
						</section>
						<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
							<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Status das execuções</h2>
							<BarList colorClass="bg-slate-600" items={(indicators?.statusDistribution || []).map((row) => ({ label: STATUS_LABEL[row.status] || row.status, value: row.total }))} />
						</section>
						<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card lg:col-span-2">
							<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Ausências por motivo</h2>
							<BarList colorClass="bg-red-500" items={(indicators?.absenceReasons || []).map((row) => ({ label: ABSENCE_LABEL[row.reason] || row.reason, value: row.total }))} />
						</section>
					</div>

					<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
						<h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500">
							<Trophy size={16} /> Engajamento das equipes
						</h2>
						<table className="w-full min-w-[720px] text-left text-sm">
							<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
								<tr>
									<th className="px-4 py-3">Equipe</th>
									<th className="px-4 py-3">Previstos</th>
									<th className="px-4 py-3">Realizados</th>
									<th className="px-4 py-3">Participação média</th>
									<th className="px-4 py-3">Cumprimento no prazo</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{ranking.map((row, index) => (
									<tr key={index}>
										<td className="px-4 py-3 font-bold text-slate-900">{row.operationType} · {row.regionalName || "—"}{row.baseName ? ` · ${row.baseName}` : ""}</td>
										<td className="px-4 py-3 font-bold text-slate-600">{row.previstos}</td>
										<td className="px-4 py-3 font-bold text-slate-600">{row.realizados}</td>
										<td className="px-4 py-3 font-bold text-slate-600">{row.participationAvg !== null ? `${row.participationAvg}%` : "—"}</td>
										<td className="px-4 py-3 font-bold text-slate-600">{row.onTimePct !== null ? `${row.onTimePct}%` : "—"}</td>
									</tr>
								))}
							</tbody>
						</table>
						{!ranking.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400 flex items-center justify-center gap-2"><ListChecks size={14} /> Nenhum dado de engajamento no período.</p> : null}
					</section>
				</>
			)}
		</div>
	);
}
