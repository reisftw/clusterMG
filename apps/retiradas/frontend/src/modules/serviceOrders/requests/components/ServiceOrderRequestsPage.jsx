import {
	AlertCircle,
	Check,
	CheckCircle2,
	Clock3,
	ExternalLink,
	History,
	LoaderCircle,
	RefreshCw,
	Search,
	Send,
	UserRoundCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hasAnyPermission } from "../../../../constants/roles";
import { useAuthContext } from "../../../../context/AuthContext";
import {
	buscarHistoricoSolicitacoes,
	buscarMinhasSolicitacoes,
	buscarSolicitacaoOrdemServico,
	buscarTecnicosSolicitacao,
	criarSolicitacaoOrdemServico,
} from "../services/serviceOrderRequestsService";

const STATUS_LABELS = {
	QUEUED: "Na fila",
	RUNNING: "Processando",
	COMPLETED: "Concluída",
	FAILED: "Falhou",
};

const PROGRESS_STEPS = [
	{ at: 10, label: "Validar técnico", icon: UserRoundCheck },
	{ at: 20, label: "Validar sessão HubSoft", icon: LoaderCircle },
	{ at: 35, label: "Localizar O.S", icon: Search },
	{ at: 60, label: "Remover agenda", icon: Clock3 },
	{ at: 75, label: "Transferir O.S", icon: Send },
	{ at: 90, label: "Confirmar alteração", icon: Check },
];

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		timeZone: "America/Sao_Paulo",
		dateStyle: "short",
		timeStyle: "short",
	});
}

function StatusBadge({ status }) {
	const styles = {
		QUEUED: "border-slate-200 bg-slate-50 text-slate-700",
		RUNNING: "border-blue-200 bg-blue-50 text-blue-700",
		COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
		FAILED: "border-red-200 bg-red-50 text-red-700",
	};
	return (
		<span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${styles[status] || styles.QUEUED}`}>
			{STATUS_LABELS[status] || status}
		</span>
	);
}

function ProgressPanel({ item }) {
	const progress = Number(item?.progress || 0);
	const finished = item?.status === "COMPLETED";
	const failed = item?.status === "FAILED";
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Acompanhamento</p>
					<h2 className="mt-1 text-xl font-black text-slate-950">Cliente {item.clientCode}</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">{item.stage}</p>
				</div>
				<StatusBadge status={item.status} />
			</div>

			<div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
				<div
					className={`h-full rounded-full transition-all duration-500 ${failed ? "bg-red-500" : finished ? "bg-emerald-500" : "bg-blue-600"}`}
					style={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
				/>
			</div>

			<div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
				{PROGRESS_STEPS.map((step) => {
					const done = finished || progress >= step.at;
					const Icon = step.icon;
					return (
						<div
							key={step.label}
							className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 ${done ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}
						>
							<span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${done ? "bg-blue-600 text-white" : "bg-white"}`}>
								{done ? <Check size={16} /> : <Icon size={16} />}
							</span>
							<span className="text-xs font-black">{step.label}</span>
						</div>
					);
				})}
			</div>

			{finished ? (
				<div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
					<div className="flex items-start gap-3">
						<CheckCircle2 className="mt-0.5 shrink-0" size={20} />
						<div>
							<p className="font-black">Transferência concluída</p>
							<p className="text-sm font-semibold">{item.resultMessage}</p>
						</div>
					</div>
					{item.hubsoftUrl ? (
						<a href={item.hubsoftUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-black text-white">
							Abrir O.S <ExternalLink size={15} />
						</a>
					) : null}
				</div>
			) : null}
			{failed ? (
				<div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
					<AlertCircle className="mt-0.5 shrink-0" size={20} />
					<div>
						<p className="font-black">Não foi possível concluir</p>
						<p className="text-sm font-semibold">{item.errorMessage || "Tente novamente ou procure um administrador."}</p>
					</div>
				</div>
			) : null}
		</section>
	);
}

function RequestsTable({ items, admin = false }) {
	if (!items.length) {
		return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">Nenhuma solicitação encontrada.</div>;
	}
	return (
		<div className="overflow-x-auto rounded-xl border border-slate-200">
			<table className="min-w-full divide-y divide-slate-200 text-sm">
				<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
					<tr>
						<th className="px-4 py-3">Quando</th>
						{admin ? <th className="px-4 py-3">Solicitante</th> : null}
						<th className="px-4 py-3">Cliente</th>
						<th className="px-4 py-3">O.S</th>
						<th className="px-4 py-3">Técnico HubSoft</th>
						<th className="px-4 py-3">Status</th>
						<th className="px-4 py-3 text-right">Consulta</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100 bg-white">
					{items.map((item) => (
						<tr key={item.id} className="text-slate-700">
							<td className="whitespace-nowrap px-4 py-3 font-semibold">{formatDateTime(item.createdAt)}</td>
							{admin ? <td className="px-4 py-3"><strong className="block text-slate-950">{item.requesterName}</strong><span className="text-xs text-slate-500">{item.requesterEmail}</span></td> : null}
							<td className="px-4 py-3"><strong className="block text-slate-950">{item.clientCode}</strong><span className="text-xs text-slate-500">{item.clientName || "Aguardando consulta"}</span></td>
							<td className="whitespace-nowrap px-4 py-3 font-black">{item.serviceOrderNumber || "-"}</td>
							<td className="min-w-48 px-4 py-3 font-semibold">{item.technicianHubsoftName}</td>
							<td className="px-4 py-3"><StatusBadge status={item.status} /></td>
							<td className="px-4 py-3 text-right">
								{item.hubsoftUrl ? <a href={item.hubsoftUrl} target="_blank" rel="noreferrer" title="Abrir O.S no HubSoft" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-blue-700 hover:bg-blue-50"><ExternalLink size={16} /></a> : "-"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function ServiceOrderRequestsPage() {
	const { currentUser } = useAuthContext();
	const canViewHistory = hasAnyPermission(currentUser, ["service_orders.requests.history"]);
	const canChooseTechnician = ["admin", "backoffice", "backoffice_retirada"].includes(
		String(currentUser?.role || "").trim().toLowerCase(),
	);
	const [clientCode, setClientCode] = useState("");
	const [technicians, setTechnicians] = useState([]);
	const [selectedTechnician, setSelectedTechnician] = useState("");
	const [active, setActive] = useState(null);
	const [mine, setMine] = useState([]);
	const [history, setHistory] = useState([]);
	const [historyPage, setHistoryPage] = useState(1);
	const [historyPagination, setHistoryPagination] = useState({ page: 1, totalPages: 1, total: 0 });
	const [historySearch, setHistorySearch] = useState("");
	const [historyStatus, setHistoryStatus] = useState("");
	const [loading, setLoading] = useState(false);
	const [loadingHistory, setLoadingHistory] = useState(false);
	const [error, setError] = useState("");

	const linkedTechnician = useMemo(
		() => currentUser?.metasTecnicoNome || currentUser?.metas_tecnico_nome || "",
		[currentUser],
	);

	const loadMine = useCallback(async () => {
		const response = await buscarMinhasSolicitacoes();
		setMine(Array.isArray(response?.items) ? response.items : []);
	}, []);

	const loadHistory = useCallback(async () => {
		if (!canViewHistory) return;
		setLoadingHistory(true);
		try {
			const response = await buscarHistoricoSolicitacoes({
				page: historyPage,
				q: historySearch,
				status: historyStatus,
			});
			setHistory(Array.isArray(response?.items) ? response.items : []);
			setHistoryPagination(response?.pagination || { page: 1, totalPages: 1, total: 0 });
		} finally {
			setLoadingHistory(false);
		}
	}, [canViewHistory, historyPage, historySearch, historyStatus]);

	useEffect(() => {
		loadMine().catch(() => {});
	}, [loadMine]);

	useEffect(() => {
		if (!canChooseTechnician) return undefined;
		let active = true;
		buscarTecnicosSolicitacao()
			.then((response) => {
				if (!active) return;
				setTechnicians(Array.isArray(response?.items) ? response.items : []);
			})
			.catch((loadError) => {
				if (active) setError(loadError?.message || "Falha ao carregar técnicos.");
			});
		return () => {
			active = false;
		};
	}, [canChooseTechnician]);

	useEffect(() => {
		loadHistory().catch(() => {});
	}, [loadHistory]);

	useEffect(() => {
		if (!active?.id || ["COMPLETED", "FAILED"].includes(active.status)) return undefined;
		const timer = window.setInterval(async () => {
			try {
				const response = await buscarSolicitacaoOrdemServico(active.id);
				if (!response?.item) return;
				setActive(response.item);
				if (["COMPLETED", "FAILED"].includes(response.item.status)) {
					await loadMine();
					await loadHistory();
				}
			} catch (pollError) {
				setError(pollError?.message || "Falha ao acompanhar a solicitação.");
			}
		}, 1000);
		return () => window.clearInterval(timer);
	}, [active?.id, active?.status, loadHistory, loadMine]);

	async function submit(event) {
		event.preventDefault();
		setError("");
		if (!/^\d+$/.test(clientCode)) {
			setError("Informe somente o código numérico do cliente.");
			return;
		}
		setLoading(true);
		try {
			const response = await criarSolicitacaoOrdemServico(
				clientCode,
				canChooseTechnician ? selectedTechnician : "",
			);
			setActive(response.item);
			setClientCode("");
			await loadMine();
		} catch (submitError) {
			setError(submitError?.message || "Não foi possível criar a solicitação.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="space-y-6 p-4 sm:p-6">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Ordem de Serviço</p>
						<h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Solicitação</h1>
						<p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
							Informe o código do cliente para transferir a O.S aberta para o técnico vinculado ao seu usuário.
						</p>
					</div>
					<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
						<p className="text-xs font-black uppercase tracking-wide text-blue-600">Técnico HubSoft</p>
						<p className="mt-1 font-black">{canChooseTechnician ? "Selecionado na solicitação" : linkedTechnician || "Vínculo não configurado"}</p>
					</div>
				</div>

				<form onSubmit={submit} className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)_auto]">
					<label className="block">
						<span className="mb-2 block text-sm font-black text-slate-700">Código do cliente</span>
						<input
							value={clientCode}
							onChange={(event) => setClientCode(event.target.value.replace(/\D/g, ""))}
							inputMode="numeric"
							autoComplete="off"
							placeholder="Ex.: 336813"
							className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					{canChooseTechnician ? (
						<label className="block">
							<span className="mb-2 block text-sm font-black text-slate-700">Técnico de retirada</span>
							<select
								value={selectedTechnician}
								onChange={(event) => setSelectedTechnician(event.target.value)}
								className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
							>
								<option value="">Selecione</option>
								{technicians.map((technician) => (
									<option key={technician.id || technician.name} value={technician.name}>
										{technician.displayName || technician.name}
									</option>
								))}
							</select>
						</label>
					) : null}
					<button
						type="submit"
						disabled={loading || (canChooseTechnician ? !selectedTechnician : !linkedTechnician)}
						className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
					>
						{loading ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}
						{loading ? "Enviando..." : "Solicitar transferência"}
					</button>
				</form>
				<p className="mt-3 text-xs font-semibold text-slate-500">
					A O.S será configurada como Cancelamento FTTH, Pendente, agenda NENHUM, agendamento manual e duração de 00:59:00.
				</p>
				{error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</div> : null}
			</section>

			{active ? <ProgressPanel item={active} /> : null}

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Minhas solicitações</p>
						<h2 className="mt-1 text-xl font-black text-slate-950">Últimas movimentações</h2>
					</div>
					<button type="button" onClick={() => loadMine()} title="Atualizar" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"><RefreshCw size={17} /></button>
				</div>
				<RequestsTable items={mine} />
			</section>

			{canViewHistory ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<div className="flex items-center gap-2 text-blue-600"><History size={18} /><p className="text-xs font-black uppercase tracking-[0.16em]">Administração</p></div>
							<h2 className="mt-1 text-xl font-black text-slate-950">Histórico de solicitações</h2>
						</div>
						<div className="flex flex-wrap gap-2">
							<input value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setHistoryPage(1); }} placeholder="Cliente, técnico ou O.S" className="h-10 min-w-56 rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
							<select value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); setHistoryPage(1); }} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700">
								<option value="">Todos os status</option>
								<option value="QUEUED">Na fila</option>
								<option value="RUNNING">Processando</option>
								<option value="COMPLETED">Concluída</option>
								<option value="FAILED">Falhou</option>
							</select>
							<button type="button" onClick={loadHistory} disabled={loadingHistory} title="Atualizar histórico" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"><RefreshCw className={loadingHistory ? "animate-spin" : ""} size={17} /></button>
						</div>
					</div>
					<div className="mt-4"><RequestsTable items={history} admin /></div>
					<div className="mt-4 flex items-center justify-between gap-3 text-sm font-bold text-slate-600">
						<span>{historyPagination.total || 0} solicitação(ões)</span>
						<div className="flex items-center gap-2">
							<button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Anterior</button>
							<span>{historyPage} de {historyPagination.totalPages || 1}</span>
							<button type="button" disabled={historyPage >= (historyPagination.totalPages || 1)} onClick={() => setHistoryPage((page) => page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Próxima</button>
						</div>
					</div>
				</section>
			) : null}
		</div>
	);
}
