// Observabilidade (roteiro Finan #27, Fase 4A) — painel técnico (uptime,
// latência, erros 4xx/5xx, tamanho do Postgres, backups, filas), separado
// do financeiro. Mesmo espírito visual da Qualidade de Dados.
import { Activity, AlertTriangle, Database, HardDrive, RefreshCw, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanObservabilidadeOverview } from "../api/finanApi";

function formatBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function formatUptime(seconds) {
	if (!Number.isFinite(seconds)) return "-";
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days) return `${days}d ${hours}h`;
	if (hours) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function formatDateTime(iso) {
	if (!iso) return "Nunca";
	try {
		return new Date(iso).toLocaleString("pt-BR");
	} catch {
		return iso;
	}
}

function StatCard({ icon: Icon, label, value, sublabel, tone = "text-slate-950" }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-center gap-3">
				<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
					<Icon size={20} />
				</span>
				<div className="min-w-0">
					<p className="text-xs font-black uppercase text-slate-500">{label}</p>
					<p className={`truncate text-xl font-black ${tone}`}>{value}</p>
					{sublabel ? <p className="text-[11px] font-bold text-slate-400">{sublabel}</p> : null}
				</div>
			</div>
		</div>
	);
}

export default function FinanObservabilidadePage() {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setData(await fetchFinanObservabilidadeOverview());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o painel de observabilidade.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const requests24h = data?.requests?.last24h;
	const errorRate = requests24h?.errorRatePct ?? 0;
	const errorTone = errorRate >= 5 ? "text-red-600" : errorRate >= 1 ? "text-amber-600" : "text-emerald-600";
	const backupLast = data?.backup?.lastExecution;
	const backupOk = backupLast?.status === "success";

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Activity size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Observabilidade</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Painel técnico do Finan — uptime, latência, erros, tamanho do banco e backups. Separado do financeiro.
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

			{loading ? (
				<p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
					Carregando métricas...
				</p>
			) : data ? (
				<>
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
						<StatCard
							icon={Server}
							label="Uptime do processo"
							value={formatUptime(data.process.uptimeSeconds)}
							sublabel={`Node ${data.process.nodeVersion}`}
						/>
						<StatCard
							icon={Activity}
							label="Latência média (24h)"
							value={`${requests24h?.latencyAvgMs ?? 0}ms`}
							sublabel={`pico ${requests24h?.latencyMaxMs ?? 0}ms · ${requests24h?.requestsTotal ?? 0} req.`}
						/>
						<StatCard
							icon={AlertTriangle}
							label="Taxa de erro (24h)"
							value={`${errorRate}%`}
							sublabel={`${requests24h?.requests4xx ?? 0} · 4xx / ${requests24h?.requests5xx ?? 0} · 5xx`}
							tone={errorTone}
						/>
						<StatCard
							icon={Database}
							label="Tamanho do banco"
							value={formatBytes(data.postgres.sizeBytes)}
							sublabel={`pool: ${data.postgres.pool.total} conexão(ões), ${data.postgres.pool.waiting} na fila`}
						/>
					</div>

					<div className="grid gap-4 lg:grid-cols-2">
						<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<div className="flex items-center gap-3">
								<span
									className={`flex h-10 w-10 items-center justify-center rounded-xl ${
										backupOk ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
									}`}
								>
									<HardDrive size={20} />
								</span>
								<div>
									<p className="text-xs font-black uppercase text-slate-500">Último backup</p>
									<p className="text-sm font-black text-slate-950">{formatDateTime(backupLast?.startedAt)}</p>
									<p className="text-[11px] font-bold text-slate-400">
										{backupLast ? (backupOk ? "Sucesso" : `Falhou: ${backupLast.errorMessage || "erro desconhecido"}`) : "Ainda não rodou"}
										{" · últimos 7 dias: "}
										{data.backup.last7Days.success} sucesso(s), {data.backup.last7Days.failed} falha(s)
									</p>
								</div>
							</div>
						</div>

						<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<p className="text-xs font-black uppercase text-slate-500">Maiores tabelas do Finan</p>
							<div className="mt-3 space-y-1.5">
								{data.postgres.biggestTables.length ? (
									data.postgres.biggestTables.map((table) => (
										<div key={table.table} className="flex items-center justify-between text-xs font-bold text-slate-600">
											<span className="truncate">{table.table}</span>
											<span className="text-slate-950">{table.rows.toLocaleString("pt-BR")}</span>
										</div>
									))
								) : (
									<p className="text-xs font-semibold text-slate-400">Sem dados ainda.</p>
								)}
							</div>
						</div>
					</div>

					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<p className="text-xs font-black uppercase text-slate-500">Filas de tarefas automáticas</p>
						<div className="mt-3 grid gap-3 sm:grid-cols-3">
							{data.jobs.map((job) => (
								<div key={job.jobKey} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
									<p className="text-xs font-black text-slate-950">{job.label}</p>
									<p className="mt-1 text-[11px] font-bold text-slate-500">
										{job.lastExecution
											? `${job.lastExecution.status === "success" ? "OK" : "Falhou"} · ${formatDateTime(job.lastExecution.startedAt)}`
											: "Nunca executou"}
									</p>
								</div>
							))}
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}
