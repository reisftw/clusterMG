import {
	Activity,
	CalendarDays,
	Eye,
	FileSearch,
	Filter,
	Monitor,
	ShieldCheck,
	User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import {
	listarLogsAuditoria,
	obterLogAuditoria,
} from "../services/auditoriaService";

const ACTION_LABELS = {
	create: "Criação",
	update: "Atualização",
	delete: "Exclusão",
};

const PAGE_SIZES = [25, 50, 100, 200];

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	});
}

function stringifyAuditValue(value) {
	if (value === null || value === undefined || value === "") return "-";
	if (typeof value === "object") return JSON.stringify(value, null, 2);
	return String(value);
}

function normalizeChangedFields(log = {}) {
	return Array.isArray(log.changedFields) ? log.changedFields : [];
}

function DetailValue({ title, value }) {
	return (
		<div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
			<p className="text-xs font-black uppercase tracking-wide text-slate-500">
				{title}
			</p>
			<pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">
				{stringifyAuditValue(value)}
			</pre>
		</div>
	);
}

function AuditLogDetailModal({ log, loading, onClose }) {
	if (!log && !loading) return null;
	const fields = normalizeChangedFields(log);

	return (
		<ModalShell
			open
			title="Detalhe do log"
			description={
				log
					? `${ACTION_LABELS[log.action] || log.action} em ${log.entity || log.module}`
					: "Carregando log de auditoria"
			}
			size="5xl"
			onClose={onClose}
			icon={<ShieldCheck className="h-6 w-6 text-blue-600" />}
			bodyClassName="space-y-4 overflow-auto"
		>
			{loading ? (
				<div className="rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">
					Carregando detalhes...
				</div>
			) : (
				<>
					<div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
						<div>
							<p className="text-xs font-bold uppercase text-slate-400">Data</p>
							<p className="font-semibold text-slate-900">
								{formatDateTime(log.createdAt)}
							</p>
						</div>
						<div>
							<p className="text-xs font-bold uppercase text-slate-400">
								Usuário
							</p>
							<p className="font-semibold text-slate-900">
								{log.userName || log.userEmail || log.userId || "-"}
							</p>
						</div>
						<div>
							<p className="text-xs font-bold uppercase text-slate-400">IP</p>
							<p className="font-semibold text-slate-900">
								{log.ipAddress || "-"}
							</p>
						</div>
					</div>

					{fields.length ? (
						<div className="space-y-3">
							{fields.map((field) => (
								<div key={field} className="rounded-2xl border border-slate-200 p-3">
									<p className="mb-3 text-sm font-black text-slate-900">
										{field}
									</p>
									<div className="grid gap-3 md:grid-cols-2">
										<DetailValue title="Antes" value={log.beforeData?.[field]} />
										<DetailValue title="Depois" value={log.afterData?.[field]} />
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="grid gap-3 md:grid-cols-2">
							<DetailValue title="Antes" value={log.beforeData} />
							<DetailValue title="Depois" value={log.afterData} />
						</div>
					)}

					<div className="rounded-2xl border border-slate-200 bg-white p-3">
						<p className="text-xs font-bold uppercase text-slate-400">
							User agent
						</p>
						<p className="mt-1 break-words text-sm text-slate-700">
							{log.userAgent || "-"}
						</p>
					</div>
				</>
			)}
		</ModalShell>
	);
}

function FilterInput({ icon: Icon, label, value, onChange, placeholder, type = "text" }) {
	return (
		<label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase text-slate-500">
			{label}
			<span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
				<Icon className="h-4 w-4 shrink-0 text-slate-400" />
				<input
					type={type}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
				/>
			</span>
		</label>
	);
}

export default function AuditoriaLogsPage() {
	const [filters, setFilters] = useState({
		action: "",
		endDate: "",
		entity: "",
		limit: 50,
		module: "",
		offset: 0,
		setorId: "",
		startDate: "",
		userId: "",
	});
	const [logs, setLogs] = useState([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [selectedLog, setSelectedLog] = useState(null);
	const [detailLoading, setDetailLoading] = useState(false);

	const page = Math.floor(filters.offset / filters.limit) + 1;
	const totalPages = Math.max(1, Math.ceil(total / filters.limit));

	const setFilter = useCallback((key, value) => {
		setFilters((current) => ({
			...current,
			[key]: value,
			offset: key === "offset" ? value : 0,
		}));
	}, []);

	const fetchLogs = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const response = await listarLogsAuditoria(filters);
			setLogs(response?.items || []);
			setTotal(Number(response?.total || 0));
		} catch (requestError) {
			setError(requestError?.message || "Erro ao carregar logs de auditoria.");
		} finally {
			setLoading(false);
		}
	}, [filters]);

	useEffect(() => {
		fetchLogs();
	}, [fetchLogs]);

	const openDetail = async (id) => {
		setDetailLoading(true);
		setSelectedLog({});
		try {
			setSelectedLog(await obterLogAuditoria(id));
		} catch (requestError) {
			setSelectedLog({
				action: "erro",
				entity: "auditoria",
				afterData: { erro: requestError?.message || "Erro ao carregar log." },
				changedFields: [],
			});
		} finally {
			setDetailLoading(false);
		}
	};

	const summary = useMemo(
		() => [
			{ label: "Logs encontrados", value: total, icon: Activity },
			{ label: "Página atual", value: `${page}/${totalPages}`, icon: FileSearch },
			{ label: "Exibindo", value: logs.length, icon: Monitor },
		],
		[logs.length, page, total, totalPages],
	);

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
				<div>
					<p className="text-sm font-bold uppercase tracking-wide text-blue-600">
						Configurações
					</p>
					<h1 className="text-2xl font-black text-slate-950">
						Logs de Auditoria
					</h1>
					<p className="mt-1 text-sm text-slate-500">
						Acompanhe alterações, exclusões e criações feitas por usuários autenticados.
					</p>
				</div>
				<button
					type="button"
					onClick={fetchLogs}
					className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
				>
					<FileSearch className="h-4 w-4" />
					Atualizar
				</button>
			</div>

			<div className="grid gap-3 md:grid-cols-3">
				{summary.map(({ icon: Icon, label, value }) => (
					<div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex items-center gap-3">
							<div className="rounded-xl bg-blue-50 p-3 text-blue-600">
								<Icon className="h-5 w-5" />
							</div>
							<div>
								<p className="text-xs font-bold uppercase text-slate-400">{label}</p>
								<p className="text-2xl font-black text-slate-950">{value}</p>
							</div>
						</div>
					</div>
				))}
			</div>

			<div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900">
					<Filter className="h-4 w-4 text-blue-600" />
					Filtros
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<FilterInput icon={User} label="Usuário" value={filters.userId} onChange={(value) => setFilter("userId", value)} placeholder="ID, nome ou e-mail" />
					<FilterInput icon={ShieldCheck} label="Setor" value={filters.setorId} onChange={(value) => setFilter("setorId", value)} placeholder="Setor/departamento" />
					<FilterInput icon={Monitor} label="Módulo" value={filters.module} onChange={(value) => setFilter("module", value)} placeholder="financeiro, usuarios..." />
					<FilterInput icon={FileSearch} label="Entidade" value={filters.entity} onChange={(value) => setFilter("entity", value)} placeholder="Coleção/documento" />
					<label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase text-slate-500">
						Ação
						<select
							value={filters.action}
							onChange={(event) => setFilter("action", event.target.value)}
							className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
						>
							<option value="">Todas</option>
							<option value="create">Criação</option>
							<option value="update">Atualização</option>
							<option value="delete">Exclusão</option>
						</select>
					</label>
					<FilterInput icon={CalendarDays} label="Início" type="date" value={filters.startDate} onChange={(value) => setFilter("startDate", value)} />
					<FilterInput icon={CalendarDays} label="Fim" type="date" value={filters.endDate} onChange={(value) => setFilter("endDate", value)} />
					<label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase text-slate-500">
						Página
						<select
							value={filters.limit}
							onChange={(event) => setFilters((current) => ({ ...current, limit: Number(event.target.value), offset: 0 }))}
							className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
						>
							{PAGE_SIZES.map((size) => (
								<option key={size} value={size}>
									{size} por página
								</option>
							))}
						</select>
					</label>
				</div>
			</div>

			<div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-slate-100 text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Data</th>
								<th className="px-4 py-3">Usuário</th>
								<th className="px-4 py-3">Setor</th>
								<th className="px-4 py-3">Módulo</th>
								<th className="px-4 py-3">Ação</th>
								<th className="px-4 py-3">IP</th>
								<th className="px-4 py-3 text-right">Ver</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{loading ? (
								<tr>
									<td colSpan={7} className="px-4 py-8 text-center text-slate-500">
										Carregando logs...
									</td>
								</tr>
							) : logs.length ? (
								logs.map((log) => (
									<tr key={log.id} className="hover:bg-blue-50/40">
										<td className="px-4 py-3 font-semibold text-slate-700">
											{formatDateTime(log.createdAt)}
										</td>
										<td className="px-4 py-3">
											<p className="font-bold text-slate-900">
												{log.userName || log.userEmail || log.userId || "-"}
											</p>
											{log.userEmail ? (
												<p className="text-xs text-slate-500">{log.userEmail}</p>
											) : null}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{log.setorId || log.departmentId || "-"}
										</td>
										<td className="px-4 py-3">
											<p className="font-bold text-slate-900">{log.module || "-"}</p>
											<p className="text-xs text-slate-500">{log.entity || "-"}</p>
										</td>
										<td className="px-4 py-3">
											<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
												{ACTION_LABELS[log.action] || log.action || "-"}
											</span>
										</td>
										<td className="px-4 py-3 text-slate-600">{log.ipAddress || "-"}</td>
										<td className="px-4 py-3 text-right">
											<button
												type="button"
												onClick={() => openDetail(log.id)}
												className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
											>
												<Eye className="h-4 w-4" />
												Ver
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={7} className="px-4 py-8 text-center text-slate-500">
										{error || "Nenhum log encontrado."}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
					<span>
						Página {page} de {totalPages} · {total} registro(s)
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={filters.offset <= 0}
							onClick={() => setFilter("offset", Math.max(0, filters.offset - filters.limit))}
							className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"
						>
							Anterior
						</button>
						<button
							type="button"
							disabled={page >= totalPages}
							onClick={() => setFilter("offset", filters.offset + filters.limit)}
							className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"
						>
							Próxima
						</button>
					</div>
				</div>
			</div>

			<AuditLogDetailModal
				log={selectedLog}
				loading={detailLoading}
				onClose={() => setSelectedLog(null)}
			/>
		</div>
	);
}
