import {
	AlertTriangle,
	BadgeDollarSign,
	CalendarDays,
	Download,
	Filter,
	RefreshCw,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	buscarExecucaoAuditoriaMultas,
	buscarAuditoriaMultas,
	simularAuditoriaMultas,
} from "../services/serviceOrderFinesService";

const MONEY = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function dateKey(date = new Date()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function currentWeekRange() {
	const now = new Date();
	const saoPauloDate = new Date(`${dateKey(now)}T12:00:00.000Z`);
	const day = saoPauloDate.getUTCDay();
	const start = new Date(saoPauloDate);
	start.setUTCDate(saoPauloDate.getUTCDate() - day);
	return { startDate: dateKey(start), endDate: dateKey(now) };
}

function currentMonthRange() {
	const today = dateKey();
	return { startDate: `${today.slice(0, 8)}01`, endDate: today };
}

function currentYearRange() {
	const today = dateKey();
	return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today };
}

function formatCurrency(value) {
	if (value === null || value === undefined || value === "") return "Sem referência";
	const number = Number(value);
	return Number.isFinite(number) ? MONEY.format(number) : "Sem referência";
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("pt-BR");
}

function KpiCard({ title, value, helper, tone = "blue" }) {
	const tones = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		green: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
		slate: "border-slate-100 bg-slate-50 text-slate-700",
	};
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
					<p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>
				</div>
				<span className={`rounded-2xl border p-3 ${tones[tone] || tones.blue}`}>
					<BadgeDollarSign size={20} />
				</span>
			</div>
		</div>
	);
}

export default function ServiceOrderFinesPage() {
	const [items, setItems] = useState([]);
	const [summary, setSummary] = useState({
		total: 0,
		cobrancasLocalizadas: 0,
		semCobranca: 0,
		semReferencia: 0,
		multas270: 0,
		valorLancado: 0,
		valorEsperado: 0,
		diferenca: 0,
	});
	const [pagination, setPagination] = useState({
		page: 1,
		limit: 20,
		total: 0,
		totalPages: 1,
	});
	const [loading, setLoading] = useState(true);
	const [simulating, setSimulating] = useState(false);
	const [runStatus, setRunStatus] = useState("");
	const [error, setError] = useState("");
	const [search, setSearch] = useState("");
	const [submittedSearch, setSubmittedSearch] = useState("");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [quickFilter, setQuickFilter] = useState("all");

	async function load(nextPage = pagination.page) {
		setLoading(true);
		setError("");
		try {
			const response = await buscarAuditoriaMultas({
				page: nextPage,
				limit: pagination.limit,
				q: submittedSearch,
				startDate,
				endDate,
			});
			setItems(Array.isArray(response?.items) ? response.items : []);
			setSummary((current) => ({ ...current, ...(response?.summary || {}) }));
			setPagination((current) => ({
				...current,
				...(response?.pagination || {}),
			}));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar multas.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [submittedSearch, startDate, endDate]);

	async function handleSimulate() {
		return handleSimulateRange({ startDate, endDate });
	}

	async function handleSimulateRange(range) {
		setSimulating(true);
		setError("");
		setRunStatus("Varredura enviada. Acompanhando processamento...");
		const nextStartDate = range.startDate || startDate;
		const nextEndDate = range.endDate || endDate;
		try {
			const run = await simularAuditoriaMultas({
				startDate: nextStartDate,
				endDate: nextEndDate,
			});
			if (range.startDate || range.endDate) {
				setStartDate(nextStartDate);
				setEndDate(nextEndDate);
			}
			if (run?.id) {
				let latest = run;
				for (let attempt = 0; attempt < 180; attempt += 1) {
					if (latest.status && latest.status !== "RUNNING") break;
					await new Promise((resolve) => setTimeout(resolve, 2000));
					latest = await buscarExecucaoAuditoriaMultas(run.id);
					const summary = latest?.result_summary || {};
					setRunStatus(
						`${summary.stage || "Processando"}${summary.percent ? ` · ${summary.percent}%` : ""}`,
					);
				}
				if (latest?.status && latest.status !== "COMPLETE" && latest.status !== "VALID_EMPTY_RESULT") {
					throw new Error(latest.error_message || "A varredura não foi concluída.");
				}
				setRunStatus("Varredura concluída. Dados atualizados.");
			}
			await load(1);
		} catch (err) {
			setError(err?.message || "Não foi possível iniciar a varredura.");
		} finally {
			setSimulating(false);
		}
	}

	const filteredItems = useMemo(() => {
		const text = search.trim().toLowerCase();
		return items.filter((item) => {
			if (quickFilter === "sem_cobranca" && item.matchStatus !== "Sem cobrança") return false;
			if (quickFilter === "sem_referencia" && item.auditStatus !== "Sem referência") return false;
			if (quickFilter === "r270" && Number(item.valorLancado) !== 270) return false;
			if (!text) return true;
			return [item.atendimento, item.cliente, item.cidade, item.responsavel, item.finalizadoPor]
				.join(" ")
				.toLowerCase()
				.includes(text);
		});
	}, [items, quickFilter, search]);

	return (
		<div className="space-y-6 p-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Ordem de Serviço / Multas</p>
						<h1 className="mt-2 text-3xl font-black text-slate-950">Auditoria de Multas</h1>
						<p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">
							Conciliação entre atendimentos de multa e cobranças financeiras. Acompanhe atendimentos do tipo Multa - Equipamento, responsáveis, valores lançados e divergências.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => load()}
							disabled={loading}
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
						>
							<RefreshCw size={16} /> Atualizar
						</button>
						<button
							type="button"
							onClick={handleSimulate}
							disabled={simulating}
							className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm"
						>
							<RefreshCw size={16} /> {simulating ? "Rodando..." : "Salvar período"}
						</button>
						{[
							["Semana", currentWeekRange()],
							["Mês", currentMonthRange()],
							["Ano", currentYearRange()],
						].map(([label, range]) => (
							<button
								key={label}
								type="button"
								onClick={() => handleSimulateRange(range)}
								disabled={simulating}
								className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700"
							>
								<RefreshCw size={16} /> Varredura {label}
							</button>
						))}
						<button
							type="button"
							disabled
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-400"
							title="Exportação será habilitada quando a auditoria financeira estiver persistida."
						>
							<Download size={16} /> Exportar
						</button>
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
					<div className="flex gap-3">
						<AlertTriangle className="mt-0.5 shrink-0" size={18} />
						<p>
							A conciliação consulta as cobranças financeiras do HubSoft em modo somente leitura para os registros exibidos nesta página. Multas de R$270 continuam sendo tratadas como lançamento válido, não como erro automático.
						</p>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{runStatus ? (
					<div className="md:col-span-2 xl:col-span-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">
						{runStatus}
					</div>
				) : null}
				<KpiCard title="Atendimentos resolvidos" value={summary.total} helper="Registros HubSoft MULTAS" tone="blue" />
				<KpiCard title="Cobranças localizadas" value={summary.cobrancasLocalizadas} helper="Aguardando fonte financeira" tone="green" />
				<KpiCard title="Sem cobrança" value={summary.semCobranca} helper="Sem match financeiro confirmado" tone="orange" />
				<KpiCard title="Sem referência" value={summary.semReferencia} helper="Valor esperado não inferido" tone="slate" />
				<KpiCard title="Multas R$270" value={summary.multas270} helper="Não classifica erro automático" tone="orange" />
				<KpiCard title="Valor lançado" value={formatCurrency(summary.valorLancado)} helper="Cobranças confirmadas" tone="green" />
				<KpiCard title="Valor esperado" value={formatCurrency(summary.valorEsperado)} helper="Fonte oficial pendente" tone="blue" />
				<KpiCard title="Diferença financeira" value={formatCurrency(summary.diferenca)} helper="Lançado - esperado" tone="red" />
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">Auditoria</h2>
						<p className="text-sm font-semibold text-slate-500">Tabela inicial para validação dos atendimentos de multa.</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
							<input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										setPagination((current) => ({ ...current, page: 1 }));
										setSubmittedSearch(search);
									}
								}}
								placeholder="Buscar atendimento, cliente ou cidade"
								className="h-10 w-72 rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-300"
							/>
						</div>
						<input
							type="date"
							value={startDate}
							onChange={(event) => {
								setPagination((current) => ({ ...current, page: 1 }));
								setStartDate(event.target.value);
							}}
							className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700"
						/>
						<input
							type="date"
							value={endDate}
							onChange={(event) => {
								setPagination((current) => ({ ...current, page: 1 }));
								setEndDate(event.target.value);
							}}
							className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700"
						/>
						<button
							type="button"
							onClick={() => {
								setPagination((current) => ({ ...current, page: 1 }));
								setSubmittedSearch(search);
							}}
							className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"
						>
							Aplicar filtros
						</button>
						{[
							["all", "Todos"],
							["sem_cobranca", "Sem cobrança"],
							["sem_referencia", "Sem referência"],
							["r270", "R$270"],
						].map(([value, label]) => (
							<button
								key={value}
								type="button"
								onClick={() => setQuickFilter(value)}
								className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${
									quickFilter === value
										? "border-blue-600 bg-blue-600 text-white"
										: "border-slate-200 bg-white text-slate-700"
								}`}
							>
								<Filter size={14} /> {label}
							</button>
						))}
					</div>
				</div>

				{error ? (
					<div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div>
				) : null}

				<div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
					<table className="min-w-full divide-y divide-slate-200 text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
							<tr>
								<th className="px-4 py-3">Data</th>
								<th className="px-4 py-3">Atendimento</th>
								<th className="px-4 py-3">Cliente</th>
								<th className="px-4 py-3">Responsável</th>
								<th className="px-4 py-3">Finalizado por</th>
								<th className="px-4 py-3">Lançado por</th>
								<th className="px-4 py-3 text-right">Valor lançado</th>
								<th className="px-4 py-3 text-right">Valor esperado</th>
								<th className="px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{loading ? (
								<tr>
									<td colSpan={9} className="px-4 py-10 text-center font-black text-slate-500">
										Carregando auditoria...
									</td>
								</tr>
							) : filteredItems.length ? (
								filteredItems.map((item) => (
									<tr key={item.id} className="align-top">
										<td className="px-4 py-3 font-bold text-slate-700">
											<span className="inline-flex items-center gap-2">
												<CalendarDays size={14} /> {formatDate(item.data)}
											</span>
										</td>
										<td className="px-4 py-3 font-black text-blue-700">{item.atendimento}</td>
										<td className="px-4 py-3">
											<p className="font-black text-slate-950">{item.cliente}</p>
											<p className="text-xs font-semibold text-slate-500">{item.cidade}</p>
										</td>
										<td className="px-4 py-3 font-semibold text-slate-700">{item.responsavel}</td>
										<td className="px-4 py-3 font-semibold text-slate-700">{item.finalizadoPor}</td>
										<td className="px-4 py-3 font-semibold text-slate-700">{item.lancadoPor}</td>
										<td className="px-4 py-3 text-right font-black text-slate-950">{formatCurrency(item.valorLancado)}</td>
										<td className="px-4 py-3 text-right font-black text-slate-950">{formatCurrency(item.valorEsperado)}</td>
										<td className="px-4 py-3">
											<span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
												{item.auditStatus}
											</span>
											{item.auditReason ? (
												<p className="mt-2 max-w-xs text-xs font-semibold text-slate-500">
													{item.auditReason}
												</p>
											) : null}
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={9} className="px-4 py-10 text-center font-black text-slate-500">
										Nenhuma multa encontrada neste recorte.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-black text-slate-600">
					<span>
						Mostrando página {pagination.page} de {pagination.totalPages} · {pagination.total} registro(s)
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={loading || pagination.page <= 1}
							onClick={() => load(Math.max(1, pagination.page - 1))}
							className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-40"
						>
							Anterior
						</button>
						<button
							type="button"
							disabled={loading || pagination.page >= pagination.totalPages}
							onClick={() => load(Math.min(pagination.totalPages, pagination.page + 1))}
							className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-40"
						>
							Próxima
						</button>
					</div>
				</div>
			</section>
		</div>
	);
}
