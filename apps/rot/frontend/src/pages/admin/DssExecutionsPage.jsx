import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Users } from "lucide-react";
import { fetchDssExecutions } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { EXECUTION_STATUS_BADGE, EXECUTION_STATUS_LABEL } from "./DssScheduleDetailPage";

export default function DssExecutionsPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canSeeBroad = hasPermission("dss.execucao.visualizar_abrangencia") || hasPermission("dss.execucao.visualizar_todos");
	const [scope, setScope] = useState(canSeeBroad ? "all" : "mine");
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async (nextScope) => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchDssExecutions(nextScope === "mine" ? { scope: "mine" } : {}));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as execuções.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load(scope);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scope]);

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><ClipboardCheck size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">DSS · Execuções</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} execução(ões) {scope === "mine" ? "da sua equipe" : "visíveis para você"}.</p>
					</div>
				</div>
				{canSeeBroad ? (
					<div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-card">
						<button type="button" onClick={() => setScope("mine")} className={`rounded-lg px-4 py-2 text-sm font-black ${scope === "mine" ? "bg-orange-600 text-white" : "text-slate-600"}`}>
							<Users size={14} className="mr-1.5 inline" /> Minha equipe
						</button>
						<button type="button" onClick={() => setScope("all")} className={`rounded-lg px-4 py-2 text-sm font-black ${scope === "all" ? "bg-orange-600 text-white" : "text-slate-600"}`}>Todas</button>
					</div>
				) : null}
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? <Spinner /> : (
				<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
					<table className="w-full min-w-[780px] text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Tema</th>
								<th className="px-4 py-3">Semana</th>
								<th className="px-4 py-3">Equipe</th>
								<th className="px-4 py-3">Prazo</th>
								<th className="px-4 py-3">Participação</th>
								<th className="px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{items.map((item) => (
								<tr key={item.id} onClick={() => navigate(`/seguranca-trabalho/dss/execucoes/${item.id}`)} className="cursor-pointer hover:bg-slate-50">
									<td className="px-4 py-3 font-bold text-slate-900">{item.themeTitle || "—"}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.weekLabel}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.operationType} · {item.regionalName}{item.baseName ? ` · ${item.baseName}` : ""}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{new Date(item.dueDate).toLocaleDateString("pt-BR")}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.presentesCount}/{item.previstosCount}</td>
									<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${EXECUTION_STATUS_BADGE[item.status] || ""}`}>{EXECUTION_STATUS_LABEL[item.status] || item.status}</span></td>
								</tr>
							))}
						</tbody>
					</table>
					{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">{scope === "mine" ? "Não existem DSS programados para sua equipe." : "Nenhuma execução encontrada para os filtros selecionados."}</p> : null}
				</div>
			)}
		</div>
	);
}
