import { useEffect, useState } from "react";
import { Eye, FileClock, RefreshCw, Search } from "lucide-react";
import { fetchRotAuditLogEntities, fetchRotAuditLogs } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";

const ACTION_LABEL = { create: "Criação", update: "Atualização", delete: "Exclusão" };
const ACTION_TONE = {
	create: "bg-emerald-50 text-emerald-700",
	update: "bg-blue-50 text-blue-700",
	delete: "bg-red-50 text-red-700",
};
const PAGE_SIZE = 30;

function formatDate(value) {
	return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Visualizador dos logs de auditoria — o registro em si (auditLog()) ja
// acontece desde o Modulo 1 em cada rota de escrita administrativa; esta
// pagina so estava faltando pra dar visibilidade ao que ja e gravado.
export default function AuditLogsPage() {
	const [items, setItems] = useState([]);
	const [entities, setEntities] = useState([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(0);
	const [entityFiltro, setEntityFiltro] = useState("");
	const [actionFiltro, setActionFiltro] = useState("");
	const [busca, setBusca] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [detail, setDetail] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [logsData, entitiesData] = await Promise.all([
				fetchRotAuditLogs({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, entity: entityFiltro, action: actionFiltro, q: busca }),
				entities.length ? Promise.resolve(entities) : fetchRotAuditLogEntities(),
			]);
			setItems(logsData.items);
			setTotal(logsData.total);
			if (!entities.length) setEntities(entitiesData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os logs de auditoria.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [page, entityFiltro, actionFiltro]);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<FileClock size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Logs de Auditoria</h1>
						<p className="text-sm font-semibold text-slate-500">{total} registro(s) · quem fez o quê, quando.</p>
					</div>
				</div>
				<button
					type="button"
					onClick={load}
					className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
				>
					<RefreshCw size={16} />
					Atualizar
				</button>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="grid gap-3 lg:grid-cols-[1.4fr_.8fr_.8fr]">
					<label className="relative">
						<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input
							value={busca}
							onChange={(event) => setBusca(event.target.value)}
							onKeyDown={(event) => event.key === "Enter" && (setPage(0), load())}
							placeholder="Buscar por usuário ou ID do registro..."
							className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<select
						value={entityFiltro}
						onChange={(event) => {
							setEntityFiltro(event.target.value);
							setPage(0);
						}}
						className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Todas as entidades</option>
						{entities.map((entity) => (
							<option key={entity} value={entity}>{entity}</option>
						))}
					</select>
					<select
						value={actionFiltro}
						onChange={(event) => {
							setActionFiltro(event.target.value);
							setPage(0);
						}}
						className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Todas as ações</option>
						<option value="create">Criação</option>
						<option value="update">Atualização</option>
						<option value="delete">Exclusão</option>
					</select>
				</div>
			</div>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{loading ? (
					<Spinner fullScreen={false} />
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[720px] text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left">
									<th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Quando</th>
									<th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Usuário</th>
									<th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Ação</th>
									<th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Entidade</th>
									<th className="px-5 py-3 text-right text-xs font-black uppercase text-slate-500">Detalhes</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{items.map((log) => (
									<tr key={log.id} className="rot-row-hover">
										<td className="px-5 py-3 font-semibold text-slate-600">{formatDate(log.createdAt)}</td>
										<td className="px-5 py-3 font-black text-slate-900">{log.userName || "Sistema"}</td>
										<td className="px-5 py-3">
											<span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${ACTION_TONE[log.action] || "bg-slate-100 text-slate-600"}`}>
												{ACTION_LABEL[log.action] || log.action}
											</span>
										</td>
										<td className="px-5 py-3 font-semibold text-slate-600">
											{log.entity}
											{log.entityId ? <span className="ml-1 text-xs text-slate-400">#{log.entityId.slice(-8)}</span> : null}
										</td>
										<td className="px-5 py-3 text-right">
											<button
												type="button"
												onClick={() => setDetail(log)}
												title="Ver detalhes"
												className="rot-btn-tactile inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
											>
												<Eye size={16} />
											</button>
										</td>
									</tr>
								))}
								{!items.length ? (
									<tr>
										<td colSpan={5} className="px-5 py-10 text-center text-sm font-bold text-slate-400">
											Nenhum log encontrado.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				)}

				{total ? (
					<div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
						<p className="text-sm font-semibold text-slate-500">Página {page + 1} de {totalPages}</p>
						<div className="flex gap-2">
							<button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
								Anterior
							</button>
							<button type="button" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page >= totalPages - 1} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
								Próxima
							</button>
						</div>
					</div>
				) : null}
			</div>

			{detail ? (
				<ModalShell
					open
					title={`${ACTION_LABEL[detail.action] || detail.action} — ${detail.entity}`}
					description={`${detail.userName || "Sistema"} · ${formatDate(detail.createdAt)}`}
					icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><FileClock size={22} /></span>}
					onClose={() => setDetail(null)}
					size="lg"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Antes</p>
							<pre className="max-h-80 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
								{detail.beforeData ? JSON.stringify(detail.beforeData, null, 2) : "—"}
							</pre>
						</div>
						<div>
							<p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Depois</p>
							<pre className="max-h-80 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
								{detail.afterData ? JSON.stringify(detail.afterData, null, 2) : "—"}
							</pre>
						</div>
					</div>
				</ModalShell>
			) : null}
		</div>
	);
}
