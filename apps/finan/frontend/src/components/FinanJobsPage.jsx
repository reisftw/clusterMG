// Central de Jobs e Integrações (roteiro Finan #28, Fase 4A) — última
// execução, duração, registros processados, erros e reprocessar (quando
// aplicável) para cada tarefa automática do Finan. Mesmo espírito visual
// da Qualidade de Dados (FinanQualidadeDadosPage.jsx).
import { AlertCircle, CheckCircle2, Clock, ListChecks, PlayCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanJobExecucoes, fetchFinanJobs, reprocessarFinanJob } from "../api/finanApi";
import { useFinanAuth } from "../state/useFinanAuth";

function hasManage(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.configuracoes.manage");
}

function formatDateTime(iso) {
	if (!iso) return "Nunca executou";
	try {
		return new Date(iso).toLocaleString("pt-BR");
	} catch {
		return iso;
	}
}

function formatDuration(ms) {
	if (!Number.isFinite(ms)) return "-";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_META = {
	success: { label: "Sucesso", className: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
	failed: { label: "Falhou", className: "border-red-200 bg-red-50 text-red-700", Icon: AlertCircle },
	running: { label: "Executando", className: "border-blue-200 bg-blue-50 text-blue-700", Icon: Clock },
};

function StatusBadge({ status }) {
	const meta = STATUS_META[status] || STATUS_META.running;
	const Icon = meta.Icon;
	return (
		<span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-black ${meta.className}`}>
			<Icon size={12} />
			{meta.label}
		</span>
	);
}

function JobCard({ job, canManage, onReprocess, reprocessing }) {
	const [expanded, setExpanded] = useState(false);
	const [execucoes, setExecucoes] = useState(null);
	const [loadingHistory, setLoadingHistory] = useState(false);
	const last = job.lastExecution;

	const toggleHistory = async () => {
		if (expanded) {
			setExpanded(false);
			return;
		}
		setExpanded(true);
		if (execucoes) return;
		setLoadingHistory(true);
		try {
			setExecucoes(await fetchFinanJobExecucoes(job.jobKey, { limit: 20 }));
		} catch {
			setExecucoes([]);
		} finally {
			setLoadingHistory(false);
		}
	};

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-black text-slate-950">{job.label}</p>
						{last ? <StatusBadge status={last.status} /> : (
							<span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-black text-slate-500">
								Nunca executou
							</span>
						)}
					</div>
					<p className="mt-1 max-w-2xl text-xs font-medium text-slate-500">{job.description}</p>
					<p className="mt-1.5 text-[11px] font-semibold text-slate-400">
						{job.schedule} · últimos 7 dias: {job.last7Days.success} sucesso(s), {job.last7Days.failed} falha(s)
					</p>
					{last?.status === "failed" && last?.errorMessage ? (
						<p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700">
							{last.errorMessage}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 flex-col items-end gap-2">
					<div className="text-right">
						<p className="text-xs font-bold text-slate-400">Última execução</p>
						<p className="text-sm font-black text-slate-950">{formatDateTime(last?.startedAt)}</p>
						{last ? (
							<p className="text-[11px] font-bold text-slate-400">
								{formatDuration(last.durationMs)}
								{Number.isFinite(last.recordsProcessed) ? ` · ${last.recordsProcessed} registro(s)` : ""}
							</p>
						) : null}
					</div>
					{canManage && job.reprocessable ? (
						<button
							type="button"
							onClick={() => onReprocess(job.jobKey)}
							disabled={reprocessing === job.jobKey}
							className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:opacity-50"
						>
							<PlayCircle size={14} className={reprocessing === job.jobKey ? "animate-pulse" : ""} />
							Reprocessar
						</button>
					) : null}
				</div>
			</div>
			<button
				type="button"
				onClick={toggleHistory}
				className="mt-3 text-xs font-black text-blue-700 hover:underline"
			>
				{expanded ? "Ocultar histórico" : "Ver histórico de execuções"}
			</button>
			{expanded ? (
				<div className="mt-3 overflow-auto rounded-xl border border-slate-100">
					{loadingHistory ? (
						<p className="px-4 py-4 text-xs font-semibold text-slate-500">Carregando...</p>
					) : execucoes?.length ? (
						<table className="min-w-full divide-y divide-slate-100 text-xs">
							<thead className="bg-slate-50 text-left font-black uppercase text-slate-500">
								<tr>
									<th scope="col" className="px-3 py-2">Início</th>
									<th scope="col" className="px-3 py-2">Status</th>
									<th scope="col" className="px-3 py-2">Duração</th>
									<th scope="col" className="px-3 py-2">Registros</th>
									<th scope="col" className="px-3 py-2">Disparo</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-50">
								{execucoes.map((exec) => (
									<tr key={exec.id}>
										<td className="px-3 py-2 font-bold text-slate-700">{formatDateTime(exec.startedAt)}</td>
										<td className="px-3 py-2"><StatusBadge status={exec.status} /></td>
										<td className="px-3 py-2 font-bold text-slate-600">{formatDuration(exec.durationMs)}</td>
										<td className="px-3 py-2 font-bold text-slate-600">{exec.recordsProcessed ?? "-"}</td>
										<td className="px-3 py-2 font-bold text-slate-600">
											{exec.trigger === "manual" ? `Manual${exec.triggeredBy ? ` · ${exec.triggeredBy}` : ""}` : "Automático"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<p className="px-4 py-4 text-xs font-semibold text-slate-500">Nenhuma execução registrada ainda.</p>
					)}
				</div>
			) : null}
		</div>
	);
}

export default function FinanJobsPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasManage(currentUser);
	const [jobs, setJobs] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [feedback, setFeedback] = useState("");
	const [reprocessing, setReprocessing] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setJobs(await fetchFinanJobs());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a Central de Jobs.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleReprocess = async (jobKey) => {
		setReprocessing(jobKey);
		setFeedback("");
		try {
			await reprocessarFinanJob(jobKey);
			setFeedback("Reprocessamento iniciado. Atualize em alguns segundos para ver o resultado.");
			setTimeout(load, 2000);
		} catch (err) {
			setError(err?.message || "Falha ao reprocessar o job.");
		} finally {
			setReprocessing("");
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<ListChecks size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Central de Jobs e Integrações</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Última execução, duração, registros processados e erros das tarefas automáticas do Finan.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={17} />
						Atualizar
					</button>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}
			{feedback ? (
				<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{feedback}</div>
			) : null}

			<div className="space-y-3">
				{loading ? (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Carregando jobs...
					</p>
				) : jobs.length ? (
					jobs.map((job) => (
						<JobCard
							key={job.jobKey}
							job={job}
							canManage={canManage}
							onReprocess={handleReprocess}
							reprocessing={reprocessing}
						/>
					))
				) : (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Nenhum job registrado.
					</p>
				)}
			</div>
		</div>
	);
}
