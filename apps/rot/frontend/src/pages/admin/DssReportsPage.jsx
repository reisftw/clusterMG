import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Download, FileSpreadsheet, Search } from "lucide-react";
import { fetchDssReportsDetails, fetchDssThemes, fetchRotRegionals } from "../../api/rotApi";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { exportDssReportPdf, exportDssReportXlsx } from "../../utils/exportDssReport";
import { EXECUTION_STATUS_BADGE, EXECUTION_STATUS_LABEL } from "./DssScheduleDetailPage";

const STATUS_OPTIONS = Object.entries(EXECUTION_STATUS_LABEL).map(([id, name]) => ({ id, name }));
const OPERATION_OPTIONS = [{ id: "ROT", name: "ROT" }, { id: "FIELD", name: "FIELD" }, { id: "DELIVERY", name: "DELIVERY" }];

export default function DssReportsPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canExport = hasPermission("dss.relatorio.exportar");
	const [regionals, setRegionals] = useState([]);
	const [themes, setThemes] = useState([]);
	const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", q: "", status: "", operationType: "", regionalId: "", themeId: "" });
	const [items, setItems] = useState([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const pageSize = 25;
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [exporting, setExporting] = useState("");

	useEffect(() => {
		fetchRotRegionals().then(setRegionals).catch(() => setRegionals([]));
		fetchDssThemes().then(setThemes).catch(() => setThemes([]));
	}, []);

	const load = async (targetPage = 1) => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchDssReportsDetails({ ...filters, page: targetPage, pageSize });
			setItems(data.items || []);
			setTotal(data.total || 0);
			setPage(targetPage);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o relatório.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load(1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const filtersLabel = [filters.dateFrom && `De ${filters.dateFrom}`, filters.dateTo && `até ${filters.dateTo}`, filters.status && EXECUTION_STATUS_LABEL[filters.status]].filter(Boolean).join(" · ");

	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><BarChart3 size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">DSS · Relatórios</h1>
						<p className="text-sm font-semibold text-slate-500">{total} registro(s) para os filtros selecionados.</p>
					</div>
				</div>
				{canExport ? (
					<div className="flex gap-2">
						<button type="button" disabled={!!exporting} onClick={async () => { setExporting("pdf"); try { await exportDssReportPdf(items, filtersLabel); } finally { setExporting(""); } }} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
							<Download size={15} /> PDF
						</button>
						<button type="button" disabled={!!exporting} onClick={async () => { setExporting("xlsx"); try { await exportDssReportXlsx(items); } finally { setExporting(""); } }} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
							<FileSpreadsheet size={15} /> XLSX
						</button>
					</div>
				) : null}
			</header>

			<div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-card lg:grid-cols-[1fr_140px_140px_140px_140px_160px_auto]">
				<div className="relative">
					<Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input value={filters.q} onChange={(e) => setFilters((c) => ({ ...c, q: e.target.value }))} placeholder="Buscar por tema/semana..." className="h-11 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</div>
				<input type="date" value={filters.dateFrom} onChange={(e) => setFilters((c) => ({ ...c, dateFrom: e.target.value }))} className="rot-input" />
				<input type="date" value={filters.dateTo} onChange={(e) => setFilters((c) => ({ ...c, dateTo: e.target.value }))} className="rot-input" />
				<Select value={filters.status} onChange={(v) => setFilters((c) => ({ ...c, status: v }))} items={STATUS_OPTIONS} empty="Todo status" />
				<Select value={filters.operationType} onChange={(v) => setFilters((c) => ({ ...c, operationType: v }))} items={OPERATION_OPTIONS} empty="Toda operação" />
				<Select value={filters.regionalId} onChange={(v) => setFilters((c) => ({ ...c, regionalId: v }))} items={regionals.map((r) => ({ id: r.id, name: r.nome || r.name }))} empty="Toda regional" />
				<button type="button" onClick={() => load(1)} className="rot-btn-tactile h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Filtrar</button>
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? <Spinner /> : (
				<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
					<table className="w-full min-w-[920px] text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Semana</th>
								<th className="px-4 py-3">Tema</th>
								<th className="px-4 py-3">Equipe</th>
								<th className="px-4 py-3">Responsável</th>
								<th className="px-4 py-3">Prazo</th>
								<th className="px-4 py-3">Participação</th>
								<th className="px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{items.map((item) => (
								<tr key={item.id} onClick={() => navigate(`/seguranca-trabalho/dss/execucoes/${item.id}`)} className="cursor-pointer hover:bg-slate-50">
									<td className="px-4 py-3 font-bold text-slate-900">{item.weekLabel}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.themeTitle || "—"}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.operationType} · {item.regionalName}{item.baseName ? ` · ${item.baseName}` : ""}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.responsibleName || "Não identificado"}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{new Date(item.dueDate).toLocaleDateString("pt-BR")}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.participationPct !== null && item.participationPct !== undefined ? `${item.participationPct}%` : "—"}</td>
									<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${EXECUTION_STATUS_BADGE[item.status] || ""}`}>{EXECUTION_STATUS_LABEL[item.status] || item.status}</span></td>
								</tr>
							))}
						</tbody>
					</table>
					{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Não encontramos registros para os filtros selecionados.</p> : null}
					{items.length ? (
						<div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
							<p className="text-xs font-semibold text-slate-500">Página {page} de {totalPages} · {total} registro(s)</p>
							<div className="flex gap-2">
								<button type="button" disabled={page <= 1} onClick={() => load(page - 1)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Anterior</button>
								<button type="button" disabled={page >= totalPages} onClick={() => load(page + 1)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Próxima</button>
							</div>
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}
