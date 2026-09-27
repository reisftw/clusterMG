import {
	AlertTriangle,
	CheckCircle2,
	Clock3,
	FileSearch,
	RefreshCw,
	Search,
	ShieldCheck,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	buscarDashboardEvidencias,
	buscarEvidencia,
	buscarEvidencias,
	tentarNovamenteEvidencia,
} from "../services/evidenciasService";

const STATUS_LABELS = {
	pending: "Pendente",
	running: "Em execução",
	synced: "Sincronizada",
	failed: "Falha",
	blocked_config: "Pendente HubSoft",
};

const RESULT_LABELS = {
	enviado: "Enviado",
	falhou: "Falhou",
	duplicado: "Duplicado",
	agendado: "Agendado",
	fluxo_agendamento: "Fluxo de agendamento",
	sem_data_horario: "Sem data/horário",
	devolucao_informada: "Devolução informada",
	cliente_nao_localizado: "Cliente não localizado",
};

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	});
}

function maskPhone(value = "") {
	const digits = String(value || "").replace(/\D/g, "");
	if (digits.length < 8) return value || "-";
	return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function statusClass(status) {
	if (status === "synced") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
	if (status === "failed") return "bg-red-50 text-red-700 ring-red-100";
	if (status === "blocked_config")
		return "bg-amber-50 text-amber-700 ring-amber-100";
	return "bg-slate-100 text-slate-700 ring-slate-200";
}

function StatCard({ title, value, helper, icon: Icon, tone = "blue" }) {
	const tones = {
		blue: "bg-blue-50 text-blue-700",
		green: "bg-emerald-50 text-emerald-700",
		amber: "bg-amber-50 text-amber-700",
		red: "bg-red-50 text-red-700",
	};
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-wider text-slate-500">
						{title}
					</p>
					<p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
					<p className="mt-1 text-sm font-semibold text-slate-500">{helper}</p>
				</div>
				<div className={`rounded-2xl p-3 ${tones[tone] || tones.blue}`}>
					<Icon size={20} />
				</div>
			</div>
		</div>
	);
}

function DetailDrawer({ evidence, loading, onClose, onRetry }) {
	if (!evidence && !loading) return null;
	return (
		<div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm">
			<aside className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl">
				<div className="flex items-start justify-between border-b border-slate-200 p-6">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
							Evidência HubSoft
						</p>
						<h2 className="mt-2 text-2xl font-black text-slate-950">
							{evidence?.osNumber || "Carregando..."}
						</h2>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							{evidence?.customerName || "-"} · {evidence?.city || "-"}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
						aria-label="Fechar"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto p-6">
					{loading ? (
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
							Carregando evidência...
						</div>
					) : (
						<div className="space-y-6">
							<div className="grid gap-3 md:grid-cols-3">
								<div className="rounded-2xl bg-slate-50 p-4">
									<p className="text-xs font-black uppercase text-slate-500">
										Status
									</p>
									<p className="mt-2 font-black text-slate-900">
										{STATUS_LABELS[evidence.syncStatus] || evidence.syncStatus}
									</p>
								</div>
								<div className="rounded-2xl bg-slate-50 p-4">
									<p className="text-xs font-black uppercase text-slate-500">
										Resultado
									</p>
									<p className="mt-2 font-black text-slate-900">
										{RESULT_LABELS[evidence.result] || evidence.result || "-"}
									</p>
								</div>
								<div className="rounded-2xl bg-slate-50 p-4">
									<p className="text-xs font-black uppercase text-slate-500">
										Telefone
									</p>
									<p className="mt-2 font-black text-slate-900">
										{maskPhone(evidence.phone)}
									</p>
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 p-5">
								<h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
									Mensagem e resposta
								</h3>
								<div className="mt-4 grid gap-4 md:grid-cols-2">
									<div>
										<p className="text-xs font-black uppercase text-slate-500">
											Enviada
										</p>
										<p className="mt-2 whitespace-pre-wrap rounded-xl bg-blue-50 p-3 text-sm font-semibold text-slate-700">
											{evidence.messageSent || "-"}
										</p>
									</div>
									<div>
										<p className="text-xs font-black uppercase text-slate-500">
											Recebida
										</p>
										<p className="mt-2 whitespace-pre-wrap rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-slate-700">
											{evidence.customerResponse || "-"}
										</p>
									</div>
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 p-5">
								<h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
									Etapas HubSoft
								</h3>
								<div className="mt-4 space-y-3">
									{(evidence.steps || []).map((step) => (
										<div
											key={step.id}
											className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
										>
											<div>
												<p className="font-black text-slate-900">
													{step.stepType.replaceAll("_", " ")}
												</p>
												<p className="text-xs font-semibold text-slate-500">
													{step.errorMessage || "Aguardando processamento"}
												</p>
											</div>
											<div className="flex items-center gap-2">
												<span
													className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusClass(step.status)}`}
												>
													{STATUS_LABELS[step.status] || step.status}
												</span>
												<button
													type="button"
													onClick={() => onRetry(step.stepType)}
													className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
													title="Tentar novamente"
												>
													<RefreshCw size={16} />
												</button>
											</div>
										</div>
									))}
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 p-5">
								<h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
									Timeline
								</h3>
								<div className="mt-4 space-y-3">
									{(evidence.events || []).map((event) => (
										<div key={event.id} className="border-l-2 border-blue-200 pl-4">
											<p className="text-sm font-black text-slate-900">
												{event.title}
											</p>
											<p className="text-xs font-semibold text-slate-500">
												{formatDate(event.occurredAt)}
											</p>
											{event.description ? (
												<p className="mt-1 text-sm text-slate-600">
													{event.description}
												</p>
											) : null}
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</div>
			</aside>
		</div>
	);
}

export default function EvidenciasPage() {
	const [dashboard, setDashboard] = useState(null);
	const [items, setItems] = useState([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [detailLoading, setDetailLoading] = useState(false);
	const [selected, setSelected] = useState(null);
	const [filters, setFilters] = useState({
		q: "",
		status: "",
		result: "",
		page: 1,
		limit: 20,
	});

	const offset = useMemo(
		() => (Number(filters.page || 1) - 1) * Number(filters.limit || 20),
		[filters.page, filters.limit],
	);
	const pages = Math.max(1, Math.ceil(total / Number(filters.limit || 20)));

	async function load() {
		setLoading(true);
		try {
			const [summary, list] = await Promise.all([
				buscarDashboardEvidencias(),
				buscarEvidencias({ ...filters, offset }),
			]);
			setDashboard(summary);
			setItems(list.items || []);
			setTotal(Number(list.total || 0));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters.page, filters.limit, filters.status, filters.result]);

	async function openDetail(id) {
		setDetailLoading(true);
		setSelected({});
		try {
			setSelected(await buscarEvidencia(id));
		} finally {
			setDetailLoading(false);
		}
	}

	async function retryStep(stepType) {
		if (!selected?.id) return;
		const updated = await tentarNovamenteEvidencia(selected.id, stepType);
		setSelected(updated);
		await load();
	}

	const summary = dashboard?.summary || {};

	return (
		<div className="space-y-6 p-6">
			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
					Mensageria &gt; HubSoft
				</p>
				<div className="mt-2 flex flex-wrap items-end justify-between gap-4">
					<div>
						<h1 className="text-3xl font-black text-slate-950">Evidências</h1>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Rastreabilidade das mensagens, respostas, agendamentos e etapas HubSoft.
						</p>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700"
					>
						<RefreshCw size={16} />
						Atualizar
					</button>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
				<StatCard title="Total" value={summary.total || 0} helper="evidências" icon={FileSearch} />
				<StatCard title="Sincronizadas" value={summary.synced || 0} helper="concluídas" icon={CheckCircle2} tone="green" />
				<StatCard title="Pendentes HubSoft" value={summary.blocked || 0} helper="aguardam endpoint" icon={Clock3} tone="amber" />
				<StatCard title="Falhas" value={summary.failed || 0} helper="exigem atenção" icon={AlertTriangle} tone="red" />
				<StatCard title="Agendados" value={summary.scheduled || 0} helper="por resposta" icon={ShieldCheck} tone="green" />
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
					<label className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input
							value={filters.q}
							onChange={(event) =>
								setFilters((current) => ({ ...current, q: event.target.value, page: 1 }))
							}
							onKeyDown={(event) => {
								if (event.key === "Enter") load();
							}}
							className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-500"
							placeholder="Buscar O.S, cliente, código ou cidade"
						/>
					</label>
					<select
						value={filters.status}
						onChange={(event) =>
							setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))
						}
						className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500"
					>
						<option value="">Todos os status</option>
						<option value="pending">Pendente</option>
						<option value="blocked_config">Pendente HubSoft</option>
						<option value="synced">Sincronizada</option>
						<option value="failed">Falha</option>
					</select>
					<select
						value={filters.result}
						onChange={(event) =>
							setFilters((current) => ({ ...current, result: event.target.value, page: 1 }))
						}
						className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500"
					>
						<option value="">Todos os resultados</option>
						<option value="enviado">Enviado</option>
						<option value="agendado">Agendado</option>
						<option value="falhou">Falhou</option>
						<option value="duplicado">Duplicado</option>
					</select>
					<button
						type="button"
						onClick={load}
						className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Filtrar
					</button>
				</div>
			</div>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-slate-200">
						<thead className="bg-slate-50">
							<tr>
								{["O.S.", "Cliente", "Cidade", "Resultado", "Status", "Atualização"].map((head) => (
									<th key={head} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">
										{head}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{loading ? (
								<tr>
									<td colSpan={6} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
										Carregando evidências...
									</td>
								</tr>
							) : items.length ? (
								items.map((item) => (
									<tr
										key={item.id}
										onClick={() => openDetail(item.id)}
										className="cursor-pointer hover:bg-blue-50/60"
									>
										<td className="px-4 py-4 text-sm font-black text-blue-700">{item.osNumber || "-"}</td>
										<td className="px-4 py-4">
											<p className="text-sm font-black text-slate-900">{item.customerName || "-"}</p>
											<p className="text-xs font-semibold text-slate-500">{maskPhone(item.phone)}</p>
										</td>
										<td className="px-4 py-4 text-sm font-semibold text-slate-700">{item.city || "-"}</td>
										<td className="px-4 py-4 text-sm font-bold text-slate-700">
											{RESULT_LABELS[item.result] || item.result || "-"}
										</td>
										<td className="px-4 py-4">
											<span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusClass(item.syncStatus)}`}>
												{STATUS_LABELS[item.syncStatus] || item.syncStatus}
											</span>
										</td>
										<td className="px-4 py-4 text-sm font-semibold text-slate-500">
											{formatDate(item.updatedAt || item.createdAt)}
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={6} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
										Nenhuma evidência encontrada.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
					<p className="text-sm font-semibold text-slate-500">
						Mostrando {items.length} de {total}
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={Number(filters.page) <= 1}
							onClick={() =>
								setFilters((current) => ({ ...current, page: Math.max(1, Number(current.page) - 1) }))
							}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black disabled:opacity-40"
						>
							Anterior
						</button>
						<span className="text-sm font-black text-slate-600">
							{filters.page} / {pages}
						</span>
						<button
							type="button"
							disabled={Number(filters.page) >= pages}
							onClick={() =>
								setFilters((current) => ({ ...current, page: Number(current.page) + 1 }))
							}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black disabled:opacity-40"
						>
							Próxima
						</button>
					</div>
				</div>
			</div>

			<DetailDrawer
				evidence={selected}
				loading={detailLoading}
				onClose={() => setSelected(null)}
				onRetry={retryStep}
			/>
		</div>
	);
}
