import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Send, XCircle } from "lucide-react";
import { cancelDssSchedule, fetchDssSchedule, publishDssSchedule } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { SCHEDULE_STATUS_BADGE, SCHEDULE_STATUS_LABEL } from "./DssSchedulesPage";

const EXECUTION_STATUS_LABEL = {
	planejado: "Planejado", disponivel: "Disponível", em_andamento: "Em andamento",
	enviado: "Enviado", validado: "Validado", rejeitado: "Rejeitado", cancelado: "Cancelado", atrasado: "Atrasado",
};
const EXECUTION_STATUS_BADGE = {
	planejado: "bg-slate-100 text-slate-600", disponivel: "bg-blue-50 text-blue-700", em_andamento: "bg-amber-50 text-amber-700",
	enviado: "bg-purple-50 text-purple-700", validado: "bg-emerald-50 text-emerald-700", rejeitado: "bg-red-50 text-red-700",
	cancelado: "bg-slate-100 text-slate-500", atrasado: "bg-red-50 text-red-700",
};

export default function DssScheduleDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canPublish = hasPermission("dss.programacao.publicar");
	const canManage = hasPermission("dss.programacao.gerenciar");
	const [schedule, setSchedule] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setSchedule(await fetchDssSchedule(id));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a programação.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	const publish = async () => {
		setBusy(true);
		setError("");
		try {
			await publishDssSchedule(id);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível publicar.");
		} finally {
			setBusy(false);
		}
	};

	const cancel = async () => {
		setBusy(true);
		setError("");
		try {
			await cancelDssSchedule(id);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível cancelar.");
		} finally {
			setBusy(false);
		}
	};

	if (loading) return <Spinner />;
	if (!schedule) return <p className="text-sm font-bold text-red-600">{error || "Programação não encontrada."}</p>;

	return (
		<div className="space-y-6">
			<button type="button" onClick={() => navigate("/seguranca-trabalho/dss/programacao")} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800">
				<ArrowLeft size={15} /> Voltar para programações
			</button>

			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><CalendarClock size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">{schedule.weekLabel}</h1>
						<p className="text-sm font-semibold text-slate-500">{schedule.themeTitle}</p>
					</div>
					<span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${SCHEDULE_STATUS_BADGE[schedule.status] || ""}`}>{SCHEDULE_STATUS_LABEL[schedule.status] || schedule.status}</span>
				</div>
				<div className="flex gap-2">
					{canPublish && schedule.status === "rascunho" ? (
						<button type="button" onClick={publish} disabled={busy} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60"><Send size={15} /> Publicar</button>
					) : null}
					{canManage && schedule.status !== "cancelado" ? (
						<button type="button" onClick={cancel} disabled={busy} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"><XCircle size={15} /> Cancelar</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-3">
				<div><p className="text-xs font-black uppercase text-slate-400">Início</p><p className="font-bold text-slate-800">{new Date(schedule.startDate).toLocaleDateString("pt-BR")}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Fim</p><p className="font-bold text-slate-800">{new Date(schedule.endDate).toLocaleDateString("pt-BR")}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Prazo</p><p className="font-bold text-slate-800">{new Date(schedule.dueDate).toLocaleDateString("pt-BR")}</p></div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
				<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Público (escopo)</h2>
				<div className="flex flex-wrap gap-2">
					{(schedule.scopes || []).map((scope) => (
						<span key={scope.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
							{scope.operationType} · {scope.regionalName || "todas as regionais"} · {scope.baseName || "todas as bases"}{scope.roleName ? ` · ${scope.roleName}` : ""}
						</span>
					))}
				</div>
			</section>

			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
				<h2 className="border-b border-slate-100 px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500">Execuções geradas ({(schedule.executions || []).length})</h2>
				<table className="w-full min-w-[640px] text-left text-sm">
					<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
						<tr>
							<th className="px-4 py-3">Equipe</th>
							<th className="px-4 py-3">Responsável</th>
							<th className="px-4 py-3">Previstos</th>
							<th className="px-4 py-3">Status</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{(schedule.executions || []).map((execution) => (
							<tr key={execution.id} onClick={() => navigate(`/seguranca-trabalho/dss/execucoes/${execution.id}`)} className="cursor-pointer hover:bg-slate-50">
								<td className="px-4 py-3 font-bold text-slate-900">{execution.operationType} · {execution.regionalName}{execution.baseName ? ` · ${execution.baseName}` : ""}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{execution.responsibleName || "Não identificado"}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{execution.previstosCount}</td>
								<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${EXECUTION_STATUS_BADGE[execution.status] || ""}`}>{EXECUTION_STATUS_LABEL[execution.status] || execution.status}</span></td>
							</tr>
						))}
					</tbody>
				</table>
				{!(schedule.executions || []).length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma execução gerada ainda — publique a programação.</p> : null}
			</section>
		</div>
	);
}

export { EXECUTION_STATUS_BADGE, EXECUTION_STATUS_LABEL };
