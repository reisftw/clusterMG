import { RefreshCw, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buscarImpactoRecuperacao,
	buscarJobRecuperacao,
	buscarPendenciasRecuperacao,
	buscarResumoRecuperacao,
	buscarTecnicosRecuperacao,
	buscarUltimoJobRecuperacao,
	reprocessarRecuperacao,
	urlExportPendencias,
} from "../services/equipmentRecoveryService";

const today = new Intl.DateTimeFormat("en-CA", {
	timeZone: "America/Sao_Paulo",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
}).format(new Date());

function currency(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function percent(value) {
	return `${(Number(value || 0) * 100).toFixed(1).replace(".", ",")}%`;
}

function StatCard({ title, value, subtitle, icon: Icon }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">
						{title}
					</p>
					<p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
					{subtitle ? (
						<p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
					) : null}
				</div>
				<div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
					<Icon size={22} />
				</div>
			</div>
		</div>
	);
}

export default function EquipmentRecoveryPage() {
	const [filters, setFilters] = useState({ start_date: today, end_date: today });
	const [data, setData] = useState({
		impact: null,
		summary: null,
		technicians: [],
		pending: { items: [], page: 1, totalPages: 1, total: 0 },
	});
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [job, setJob] = useState(null);

	const params = useMemo(
		() => ({ ...filters, page, limit: 10 }),
		[filters, page],
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [impact, summary, technicians, pending] = await Promise.all([
				buscarImpactoRecuperacao(filters),
				buscarResumoRecuperacao(filters),
				buscarTecnicosRecuperacao(filters),
				buscarPendenciasRecuperacao(params),
			]);
			setData({
				impact,
				summary,
				technicians: technicians?.items || [],
				pending,
			});
		} catch (err) {
			setError(err.message || "Não foi possível carregar a recuperação.");
		} finally {
			setLoading(false);
		}
	}, [filters, params]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		let cancelled = false;
		buscarUltimoJobRecuperacao()
			.then((latest) => {
				if (!cancelled && latest?.status === "RUNNING") setJob(latest);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!job?.id || job.status !== "RUNNING") return undefined;
		let cancelled = false;
		const timer = window.setInterval(async () => {
			try {
				const next = await buscarJobRecuperacao(job.id);
				if (cancelled) return;
				setJob(next);
				if (next.status === "COMPLETE") {
					setMessage(
						`Reprocessamento concluído: ${next.summary?.persisted || next.summary?.total || 0} O.S.`,
					);
					load();
				}
				if (next.status === "FAILED") {
					setError(next.errorMessage || "Falha no reprocessamento.");
				}
			} catch (err) {
				if (!cancelled) setError(err.message || "Falha ao acompanhar job.");
			}
		}, 3000);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [job?.id, job?.status, load]);

	async function handleReprocess(apply) {
		setLoading(true);
		setError("");
		setMessage("");
		try {
			const result = await reprocessarRecuperacao({ ...filters, apply });
			setJob(result);
			setMessage(
				apply
					? "Reprocessamento iniciado no backend. Pode atualizar a página que o job continua."
					: "Simulação iniciada no backend. Pode atualizar a página que o job continua.",
			);
		} catch (err) {
			setError(err.message || "Falha ao reprocessar.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="space-y-6 p-6">
			<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
							Técnicos & estoque
						</p>
						<h1 className="mt-2 text-3xl font-black text-slate-950">
							Recuperação de ativos
						</h1>
						<p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
							Acompanhe equipamentos estimados por O.S., valores recuperados e
							pendências de devolução. A regra usa velocidade do serviço e valores
							cadastrados em Movimentações.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<input
							type="date"
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
							value={filters.start_date}
							onChange={(event) => {
								setPage(1);
								setFilters((current) => ({
									...current,
									start_date: event.target.value,
								}));
							}}
						/>
						<input
							type="date"
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
							value={filters.end_date}
							onChange={(event) => {
								setPage(1);
								setFilters((current) => ({
									...current,
									end_date: event.target.value,
								}));
							}}
						/>
						<button
							type="button"
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
							onClick={load}
							disabled={loading}
						>
							<RefreshCw size={16} /> Atualizar
						</button>
						<button
							type="button"
							className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700"
							onClick={() => handleReprocess(false)}
							disabled={loading}
						>
							Simular
						</button>
						<button
							type="button"
							className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm"
							onClick={() => handleReprocess(true)}
							disabled={loading}
						>
							Aplicar em homolog
						</button>
					</div>
				</div>
				{error ? (
					<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
						{error}
					</div>
				) : null}
				{message ? (
					<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
						{message}
					</div>
				) : null}
				{job?.id ? (
					<div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-sm font-black text-blue-900">
									Job {job.status}
								</p>
								<p className="text-sm font-semibold text-blue-700">
									{job.summary?.stage || "Processando"} ·{" "}
									{Number(job.summary?.percent || 0)}%
								</p>
							</div>
							<div className="min-w-[220px] flex-1 rounded-full bg-blue-100">
								<div
									className="h-3 rounded-full bg-blue-600 transition-all"
									style={{
										width: `${Math.min(100, Number(job.summary?.percent || 0))}%`,
									}}
								/>
							</div>
						</div>
						{job.errorMessage ? (
							<p className="mt-2 text-sm font-bold text-red-700">
								{job.errorMessage}
							</p>
						) : null}
					</div>
				) : null}
			</section>

			<div className="grid gap-4 lg:grid-cols-4">
				<StatCard
					title="O.S. válidas"
					value={data.summary?.total || 0}
					subtitle={`Nova regra adiciona ${data.impact?.delta || 0}`}
					icon={ShieldCheck}
				/>
				<StatCard
					title="Devolvidos"
					value={data.summary?.devolvidos || 0}
					subtitle={`Taxa ${percent(data.summary?.taxaDevolucao)}`}
					icon={TrendingUp}
				/>
				<StatCard
					title="Pendentes"
					value={data.summary?.pendentes || 0}
					subtitle={`${data.summary?.desconhecidos || 0} sem classificação`}
					icon={RefreshCw}
				/>
				<StatCard
					title="Valor recuperado"
					value={currency(data.summary?.valorDevolvido)}
					subtitle={`${currency(data.summary?.valorPendente)} pendente`}
					icon={Wallet}
				/>
			</div>

			<section className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-black text-slate-950">Técnicos</h2>
					<div className="mt-4 space-y-3">
						{data.technicians.slice(0, 10).map((item) => (
							<div
								key={item.technicianKey}
								className="rounded-xl border border-slate-100 bg-slate-50 p-3"
							>
								<div className="flex items-center justify-between gap-3">
									<p className="font-black text-slate-900">{item.technicianName}</p>
									<p className="text-sm font-black text-blue-600">
										{item.devolvidos}/{item.retirados}
									</p>
								</div>
								<div className="mt-2 h-2 rounded-full bg-slate-200">
									<div
										className="h-2 rounded-full bg-emerald-500"
										style={{
											width: `${Math.min(100, item.taxaDevolucao * 100)}%`,
										}}
									/>
								</div>
								<p className="mt-2 text-xs font-bold text-slate-500">
									FAST {item.equipamentos.FAST} · AC {item.equipamentos.AC} · AX{" "}
									{item.equipamentos.AX}
								</p>
							</div>
						))}
						{!data.technicians.length ? (
							<p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
								Nenhum técnico calculado nesse período.
							</p>
						) : null}
					</div>
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-lg font-black text-slate-950">
							Pendências de devolução
						</h2>
						<a
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
							href={urlExportPendencias(filters)}
						>
							Exportar CSV
						</a>
					</div>
					<div className="mt-4 overflow-x-auto">
						<table className="min-w-full text-left text-sm">
							<thead className="text-xs uppercase text-slate-500">
								<tr>
									<th className="py-2">O.S.</th>
									<th className="py-2">Técnico</th>
									<th className="py-2">Equip.</th>
									<th className="py-2">Valor</th>
									<th className="py-2">Confiança</th>
								</tr>
							</thead>
							<tbody>
								{(data.pending?.items || []).map((item) => (
									<tr key={item.id} className="border-t border-slate-100">
										<td className="py-3 font-black text-blue-700">{item.os_number}</td>
										<td className="py-3 font-bold text-slate-800">
											{item.technician_name || "Sem técnico"}
										</td>
										<td className="py-3 font-bold text-slate-700">
											{item.equipment_type}
										</td>
										<td className="py-3 font-bold text-slate-700">
											{currency(item.equipment_unit_value)}
										</td>
										<td className="py-3 font-bold text-slate-500">
											{item.match_confidence}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{!data.pending?.items?.length ? (
							<p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
								Nenhuma pendência encontrada.
							</p>
						) : null}
					</div>
					<div className="mt-4 flex items-center justify-between text-sm font-bold text-slate-600">
						<span>
							Página {data.pending?.page || 1} de {data.pending?.totalPages || 1}
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
								disabled={page <= 1}
								onClick={() => setPage((current) => Math.max(1, current - 1))}
							>
								Anterior
							</button>
							<button
								type="button"
								className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
								disabled={page >= (data.pending?.totalPages || 1)}
								onClick={() => setPage((current) => current + 1)}
							>
								Próxima
							</button>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
