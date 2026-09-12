import {
	AlertTriangle,
	CalendarRange,
	CheckCircle2,
	Clock3,
	PackageSearch,
	RefreshCw,
	Trophy,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import {
	buscarDashboardMovimentacoes,
	buscarJobVarreduraMovimentacoes,
	iniciarVarreduraMovimentacoes,
	listarMovimentacoes,
} from "../services/movimentacoesService";

const STATUS_LABEL = {
	pendente: "Pendente",
	casada: "Entregue (O.S. baixada)",
	sem_match: "Sem O.S. correspondente",
};

const STATUS_STYLE = {
	pendente: "border-amber-200 bg-amber-50 text-amber-700",
	casada: "border-green-200 bg-green-50 text-green-700",
	sem_match: "border-gray-200 bg-gray-50 text-gray-600",
};

const STATUS_ICON = {
	pendente: Clock3,
	casada: CheckCircle2,
	sem_match: AlertTriangle,
};

const SCAN_POLL_INTERVAL_MS = 1500;
const SCAN_POLL_TIMEOUT_MS = 2 * 60 * 1000;

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR");
}

const PERIODO_TIPOS = {
	TODOS: "todos",
	DIA: "dia",
	MES: "mes",
	ANO: "ano",
};

const ANO_ATUAL = new Date().getFullYear();
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, index) => ANO_ATUAL - index);

function pad2(value) {
	return String(value).padStart(2, "0");
}

function hojeYMD() {
	const agora = new Date();
	return `${agora.getFullYear()}-${pad2(agora.getMonth() + 1)}-${pad2(agora.getDate())}`;
}

function mesAtualYM() {
	const agora = new Date();
	return `${agora.getFullYear()}-${pad2(agora.getMonth() + 1)}`;
}

// Converte o filtro de periodo (dia/mes/ano) num intervalo absoluto
// (dataInicio/dataFim em ISO) que a API entende. "todos" nao filtra.
function calcularIntervaloPeriodo(tipo, valor) {
	if (tipo === PERIODO_TIPOS.DIA && valor) {
		const [ano, mes, dia] = valor.split("-").map(Number);
		return {
			dataInicio: new Date(ano, mes - 1, dia, 0, 0, 0, 0).toISOString(),
			dataFim: new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString(),
		};
	}
	if (tipo === PERIODO_TIPOS.MES && valor) {
		const [ano, mes] = valor.split("-").map(Number);
		return {
			dataInicio: new Date(ano, mes - 1, 1, 0, 0, 0, 0).toISOString(),
			dataFim: new Date(ano, mes, 0, 23, 59, 59, 999).toISOString(),
		};
	}
	if (tipo === PERIODO_TIPOS.ANO && valor) {
		const ano = Number(valor);
		return {
			dataInicio: new Date(ano, 0, 1, 0, 0, 0, 0).toISOString(),
			dataFim: new Date(ano, 11, 31, 23, 59, 59, 999).toISOString(),
		};
	}
	return { dataInicio: undefined, dataFim: undefined };
}

function descreverPeriodo(tipo, valor) {
	if (tipo === PERIODO_TIPOS.DIA && valor) {
		return new Date(`${valor}T00:00:00`).toLocaleDateString("pt-BR");
	}
	if (tipo === PERIODO_TIPOS.MES && valor) {
		const [ano, mes] = valor.split("-").map(Number);
		return new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
			month: "long",
			year: "numeric",
		});
	}
	if (tipo === PERIODO_TIPOS.ANO && valor) {
		return valor;
	}
	return "Todo o período";
}

function groupResumoPorDia(resumo) {
	const map = new Map();
	for (const item of resumo || []) {
		const chave = String(item.dia || "").slice(0, 10);
		const atual = map.get(chave) || { dia: chave, empresas: [] };
		atual.empresas.push(item);
		map.set(chave, atual);
	}
	return [...map.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}

export default function MovimentacoesPage() {
	const [dashboard, setDashboard] = useState({
		resumoPorEmpresaDia: [],
		rankingTecnicos: [],
		rankingProdutos: [],
	});
	const [loadingDashboard, setLoadingDashboard] = useState(true);
	const [dashboardError, setDashboardError] = useState("");

	const [lista, setLista] = useState({ items: [], page: 1, totalPages: 1, total: 0 });
	const [loadingLista, setLoadingLista] = useState(true);
	const [listaError, setListaError] = useState("");
	const [page, setPage] = useState(1);
	const [statusFiltro, setStatusFiltro] = useState("");

	const [showFiltroPeriodo, setShowFiltroPeriodo] = useState(false);
	const [periodoTipo, setPeriodoTipo] = useState(PERIODO_TIPOS.TODOS);
	const [periodoDia, setPeriodoDia] = useState(hojeYMD());
	const [periodoMes, setPeriodoMes] = useState(mesAtualYM());
	const [periodoAno, setPeriodoAno] = useState(String(ANO_ATUAL));
	const [periodoAplicado, setPeriodoAplicado] = useState({
		tipo: PERIODO_TIPOS.TODOS,
		valor: "",
	});

	const [scanJob, setScanJob] = useState(null);
	const [scanning, setScanning] = useState(false);
	const [scanError, setScanError] = useState("");
	const [showScanModal, setShowScanModal] = useState(false);
	const pollTimerRef = useRef(null);

	const intervaloPeriodo = useMemo(
		() =>
			calcularIntervaloPeriodo(periodoAplicado.tipo, periodoAplicado.valor),
		[periodoAplicado],
	);

	const carregarDashboard = useCallback(async () => {
		setLoadingDashboard(true);
		setDashboardError("");
		try {
			const data = await buscarDashboardMovimentacoes({
				dataInicio: intervaloPeriodo.dataInicio,
				dataFim: intervaloPeriodo.dataFim,
			});
			setDashboard(data);
		} catch {
			setDashboardError("Não foi possível carregar o painel de movimentações.");
		} finally {
			setLoadingDashboard(false);
		}
	}, [intervaloPeriodo]);

	const carregarLista = useCallback(async () => {
		setLoadingLista(true);
		setListaError("");
		try {
			const data = await listarMovimentacoes({
				page,
				limit: 20,
				status: statusFiltro || undefined,
				dataInicio: intervaloPeriodo.dataInicio,
				dataFim: intervaloPeriodo.dataFim,
			});
			setLista(data);
		} catch {
			setListaError("Não foi possível carregar a lista de movimentações.");
		} finally {
			setLoadingLista(false);
		}
	}, [page, statusFiltro, intervaloPeriodo]);

	useEffect(() => {
		carregarDashboard();
	}, [carregarDashboard]);

	useEffect(() => {
		carregarLista();
	}, [carregarLista]);

	useEffect(() => {
		return () => {
			if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
		};
	}, []);

	const pararPolling = useCallback(() => {
		if (pollTimerRef.current) {
			clearTimeout(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	}, []);

	const acompanharJob = useCallback(
		(jobId, startedAt) => {
			buscarJobVarreduraMovimentacoes(jobId)
				.then((job) => {
					setScanJob(job);
					const finalizado = job.status === "completed" || job.status === "failed";
					if (finalizado) {
						setScanning(false);
						carregarDashboard();
						carregarLista();
						return;
					}
					if (Date.now() - startedAt > SCAN_POLL_TIMEOUT_MS) {
						setScanning(false);
						setScanError(
							"A varredura está demorando mais que o esperado. Confira novamente em instantes.",
						);
						return;
					}
					pollTimerRef.current = setTimeout(
						() => acompanharJob(jobId, startedAt),
						SCAN_POLL_INTERVAL_MS,
					);
				})
				.catch(() => {
					setScanning(false);
					setScanError("Não foi possível acompanhar a varredura.");
				});
		},
		[carregarDashboard, carregarLista],
	);

	const handleAplicarFiltroPeriodo = () => {
		const valor =
			periodoTipo === PERIODO_TIPOS.DIA
				? periodoDia
				: periodoTipo === PERIODO_TIPOS.MES
					? periodoMes
					: periodoTipo === PERIODO_TIPOS.ANO
						? periodoAno
						: "";
		setPeriodoAplicado({ tipo: periodoTipo, valor });
		setPage(1);
		setShowFiltroPeriodo(false);
	};

	const handleLimparFiltroPeriodo = () => {
		setPeriodoTipo(PERIODO_TIPOS.TODOS);
		setPeriodoAplicado({ tipo: PERIODO_TIPOS.TODOS, valor: "" });
		setPage(1);
		setShowFiltroPeriodo(false);
	};

	const handleIniciarVarredura = async ({ anoTodo = false } = {}) => {
		pararPolling();
		setScanError("");
		setScanning(true);
		setShowScanModal(true);
		try {
			const intervalo = anoTodo
				? {
						dataInicio: new Date(ANO_ATUAL, 0, 1, 0, 0, 0, 0).toISOString(),
						dataFim: new Date().toISOString(),
					}
				: {};
			const job = await iniciarVarreduraMovimentacoes(intervalo);
			setScanJob(job);
			acompanharJob(job.id, Date.now());
		} catch {
			setScanning(false);
			setScanError("Não foi possível iniciar a varredura.");
		}
	};

	const resumoPorDia = useMemo(
		() => groupResumoPorDia(dashboard.resumoPorEmpresaDia),
		[dashboard.resumoPorEmpresaDia],
	);

	const totais = useMemo(() => {
		return (dashboard.resumoPorEmpresaDia || []).reduce(
			(acc, item) => ({
				total: acc.total + Number(item.total || 0),
				casadas: acc.casadas + Number(item.casadas || 0),
				semMatch: acc.semMatch + Number(item.semMatch || 0),
				pendentes: acc.pendentes + Number(item.pendentes || 0),
			}),
			{ total: 0, casadas: 0, semMatch: 0, pendentes: 0 },
		);
	}, [dashboard.resumoPorEmpresaDia]);

	return (
		<div className="space-y-5">
			<section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white">
							<PackageSearch size={21} />
						</div>
						<div>
							<h1 className="text-xl font-black text-gray-900">Movimentações</h1>
							<p className="text-sm text-gray-500">
								Devoluções de equipamento (comodato) registradas no Portal de
								Movimentações, cruzadas com as O.S. abertas no mapa e match.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative">
							<button
								type="button"
								onClick={() => setShowFiltroPeriodo((current) => !current)}
								className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
							>
								<CalendarRange size={16} />
								{descreverPeriodo(periodoAplicado.tipo, periodoAplicado.valor)}
							</button>

							{showFiltroPeriodo ? (
								<div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-gray-100 bg-white p-4 shadow-lg">
									<p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">
										Filtrar por período
									</p>
									<div className="mb-3 grid grid-cols-2 gap-2">
										{[
											{ tipo: PERIODO_TIPOS.TODOS, label: "Todos" },
											{ tipo: PERIODO_TIPOS.DIA, label: "Dia" },
											{ tipo: PERIODO_TIPOS.MES, label: "Mês" },
											{ tipo: PERIODO_TIPOS.ANO, label: "Ano" },
										].map((opcao) => (
											<button
												key={opcao.tipo}
												type="button"
												onClick={() => setPeriodoTipo(opcao.tipo)}
												className={`rounded-lg border px-3 py-2 text-xs font-bold ${
													periodoTipo === opcao.tipo
														? "border-blue-500 bg-blue-50 text-blue-700"
														: "border-gray-200 text-gray-600 hover:bg-gray-50"
												}`}
											>
												{opcao.label}
											</button>
										))}
									</div>

									{periodoTipo === PERIODO_TIPOS.DIA ? (
										<input
											type="date"
											value={periodoDia}
											onChange={(event) => setPeriodoDia(event.target.value)}
											className="input-field mb-3 w-full"
										/>
									) : null}
									{periodoTipo === PERIODO_TIPOS.MES ? (
										<input
											type="month"
											value={periodoMes}
											onChange={(event) => setPeriodoMes(event.target.value)}
											className="input-field mb-3 w-full"
										/>
									) : null}
									{periodoTipo === PERIODO_TIPOS.ANO ? (
										<select
											value={periodoAno}
											onChange={(event) => setPeriodoAno(event.target.value)}
											className="input-field mb-3 w-full"
										>
											{ANOS_DISPONIVEIS.map((ano) => (
												<option key={ano} value={ano}>
													{ano}
												</option>
											))}
										</select>
									) : null}

									<div className="flex justify-end gap-2">
										<button
											type="button"
											onClick={handleLimparFiltroPeriodo}
											className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
										>
											Limpar
										</button>
										<button
											type="button"
											onClick={handleAplicarFiltroPeriodo}
											className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800"
										>
											Aplicar
										</button>
									</div>
								</div>
							) : null}
						</div>

						<button
							type="button"
							onClick={() => handleIniciarVarredura()}
							disabled={scanning}
							className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
							{scanning ? "Varredura em andamento..." : "Varredura agora"}
						</button>
						<button
							type="button"
							onClick={() => handleIniciarVarredura({ anoTodo: true })}
							disabled={scanning}
							title={`Reprocessa o Portal de Movimentações desde 01/01/${ANO_ATUAL} — útil para achar O.S. antigas com equipamento já retirado.`}
							className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<CalendarRange size={16} />
							Varredura do ano todo
						</button>
					</div>
				</div>
			</section>

			<section className="grid gap-3 md:grid-cols-4">
				<div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
						Devoluções mapeadas
					</p>
					<p className="mt-1 text-2xl font-black text-gray-900">{totais.total}</p>
				</div>
				<div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-green-600">
						Entregues (O.S. baixada)
					</p>
					<p className="mt-1 text-2xl font-black text-green-800">
						{totais.casadas}
					</p>
				</div>
				<div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
						Pendentes
					</p>
					<p className="mt-1 text-2xl font-black text-amber-700">
						{totais.pendentes}
					</p>
				</div>
				<div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
						Sem O.S. correspondente
					</p>
					<p className="mt-1 text-2xl font-black text-gray-700">
						{totais.semMatch}
					</p>
				</div>
			</section>

			{dashboardError ? (
				<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{dashboardError}
				</p>
			) : null}

			<section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
				<h2 className="mb-4 text-base font-bold text-gray-900">
					Devoluções por dia e empresa
				</h2>
				{loadingDashboard ? (
					<p className="text-sm text-gray-500">Carregando...</p>
				) : (
					<div className="space-y-3">
						{resumoPorDia.map((dia) => (
							<div key={dia.dia} className="rounded-lg border border-gray-100 p-3">
								<p className="mb-2 text-sm font-bold text-gray-700">
									{dia.dia
										? new Date(`${dia.dia}T00:00:00`).toLocaleDateString("pt-BR")
										: "Sem data"}
								</p>
								<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
									{dia.empresas.map((item) => (
										<div
											key={`${dia.dia}-${item.empresa}`}
											className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
										>
											<p className="text-sm font-semibold text-gray-800">
												{item.empresa}
											</p>
											<p className="mt-1 text-xs text-gray-500">
												{item.total} devolução(ões) · {item.casadas} entregue(s) ·{" "}
												{item.semMatch} sem O.S.
											</p>
										</div>
									))}
								</div>
							</div>
						))}
						{!resumoPorDia.length ? (
							<p className="text-sm text-gray-500">
								Nenhuma devolução encontrada ainda. Use "Varredura agora" para
								consultar o Portal de Movimentações.
							</p>
						) : null}
					</div>
				)}
			</section>

			<section className="grid gap-5 lg:grid-cols-2">
				<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
					<div className="mb-3 flex items-center gap-2">
						<Trophy size={18} className="text-amber-500" />
						<h2 className="text-base font-bold text-gray-900">
							Ranking de técnicos
						</h2>
					</div>
					<div className="space-y-2">
						{(dashboard.rankingTecnicos || []).map((item, index) => (
							<div
								key={item.tecnico}
								className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
							>
								<span className="text-sm font-semibold text-gray-700">
									{index + 1}. {item.tecnico}
								</span>
								<span className="text-sm font-black text-gray-900">
									{item.total}
								</span>
							</div>
						))}
						{!dashboard.rankingTecnicos?.length ? (
							<p className="text-sm text-gray-500">Sem dados no período.</p>
						) : null}
					</div>
				</div>

				<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
					<div className="mb-3 flex items-center gap-2">
						<Trophy size={18} className="text-blue-500" />
						<h2 className="text-base font-bold text-gray-900">
							Ranking de produtos
						</h2>
					</div>
					<div className="space-y-2">
						{(dashboard.rankingProdutos || []).map((item, index) => (
							<div
								key={item.produto}
								className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
							>
								<span className="text-sm font-semibold text-gray-700">
									{index + 1}. {item.produto}
								</span>
								<span className="text-sm font-black text-gray-900">
									{item.total}
								</span>
							</div>
						))}
						{!dashboard.rankingProdutos?.length ? (
							<p className="text-sm text-gray-500">Sem dados no período.</p>
						) : null}
					</div>
				</div>
			</section>

			<section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<h2 className="text-base font-bold text-gray-900">
						Devoluções (paginado)
					</h2>
					<select
						value={statusFiltro}
						onChange={(event) => {
							setPage(1);
							setStatusFiltro(event.target.value);
						}}
						className="input-field sm:w-auto"
					>
						<option value="">Todos os status</option>
						<option value="pendente">Pendente</option>
						<option value="casada">Entregue (O.S. baixada)</option>
						<option value="sem_match">Sem O.S. correspondente</option>
					</select>
				</div>

				{listaError ? (
					<p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{listaError}
					</p>
				) : null}

				<div className="overflow-hidden rounded-lg border border-gray-100">
					<div className="overflow-x-auto">
						<table className="min-w-[860px] w-full divide-y divide-gray-100 text-sm">
							<thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
								<tr>
									<th className="px-4 py-3">Cliente</th>
									<th className="px-4 py-3">Técnico</th>
									<th className="px-4 py-3">Empresa</th>
									<th className="px-4 py-3">Produto / Série</th>
									<th className="px-4 py-3">Emitido em</th>
									<th className="px-4 py-3">O.S.</th>
									<th className="px-4 py-3">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 bg-white">
								{loadingLista ? (
									<tr>
										<td colSpan={7} className="px-4 py-8 text-center text-gray-500">
											Carregando...
										</td>
									</tr>
								) : (
									lista.items.map((item) => {
										const StatusIcon = STATUS_ICON[item.statusMatch] || AlertTriangle;
										return (
											<tr key={item.id}>
												<td className="px-4 py-3 font-semibold text-gray-900">
													{item.parceiroNome || "-"}
												</td>
												<td className="px-4 py-3 text-gray-600">
													{item.registradoPor || "-"}
												</td>
												<td className="px-4 py-3 text-gray-600">
													{item.empresaNome || "-"}
												</td>
												<td className="px-4 py-3">
													<p className="font-semibold text-gray-800">
														{item.produtoNome || "-"}
													</p>
													<p className="font-mono text-xs text-gray-500">
														{item.serie}
													</p>
												</td>
												<td className="px-4 py-3 text-xs text-gray-500">
													{formatDateTime(item.emitidoEm)}
												</td>
												<td className="px-4 py-3 font-mono text-xs text-gray-700">
													{item.osNumero || "-"}
												</td>
												<td className="px-4 py-3">
													<span
														className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
															STATUS_STYLE[item.statusMatch] || STATUS_STYLE.pendente
														}`}
													>
														<StatusIcon size={13} />
														{STATUS_LABEL[item.statusMatch] || item.statusMatch}
													</span>
												</td>
											</tr>
										);
									})
								)}
								{!loadingLista && !lista.items.length ? (
									<tr>
										<td colSpan={7} className="px-4 py-8 text-center text-gray-500">
											Nenhuma movimentação encontrada.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</div>

				<div className="mt-4 flex items-center justify-between text-sm text-gray-500">
					<span>
						Página {lista.page} de {lista.totalPages} · {lista.total} registro(s)
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={page <= 1}
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Anterior
						</button>
						<button
							type="button"
							disabled={page >= lista.totalPages}
							onClick={() => setPage((current) => current + 1)}
							className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Próxima
						</button>
					</div>
				</div>
			</section>

			{showScanModal ? (
				<ModalShell
					onClose={() => setShowScanModal(false)}
					showClose={false}
					size="lg"
					bodyClassName="p-0"
				>
					<div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
								<PackageSearch size={18} />
							</div>
							<div>
								<h2 className="text-base font-bold text-gray-900">
									Varredura de movimentações
								</h2>
								<p className="text-sm text-gray-500">
									Consultando o Portal de Movimentações e cruzando com o mapa/match.
								</p>
							</div>
						</div>
						<button
							type="button"
							onClick={() => setShowScanModal(false)}
							className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
							aria-label="Fechar"
						>
							<X size={16} />
						</button>
					</div>

					<div className="space-y-4 p-5">
						{scanError ? (
							<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{scanError}
							</p>
						) : null}

						{scanJob ? (
							<>
								<div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
									<div
										className="h-full bg-blue-600 transition-all"
										style={{ width: `${scanJob.percent || 0}%` }}
									/>
								</div>
								<p className="text-sm text-gray-600">{scanJob.stage}</p>

								{scanJob.status === "completed" ? (
									<div className="grid gap-3 sm:grid-cols-3">
										<div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
											<p className="text-xs text-gray-400">Encontradas</p>
											<p className="text-xl font-black text-gray-900">
												{scanJob.resultado?.totalMovimentacoes ?? scanJob.total ?? 0}
											</p>
										</div>
										<div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2">
											<p className="text-xs text-green-600">Entregues</p>
											<p className="text-xl font-black text-green-800">
												{scanJob.resultado?.totalCasadas ?? scanJob.casadas ?? 0}
											</p>
										</div>
										<div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
											<p className="text-xs text-gray-500">Sem O.S.</p>
											<p className="text-xl font-black text-gray-700">
												{scanJob.resultado?.totalSemMatch ?? scanJob.semMatch ?? 0}
											</p>
										</div>
									</div>
								) : null}

								{scanJob.status === "failed" ? (
									<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
										{scanJob.error || "Falha na varredura."}
									</p>
								) : null}
							</>
						) : (
							<p className="text-sm text-gray-500">Iniciando varredura...</p>
						)}
					</div>

					<div className="flex justify-end border-t border-gray-100 p-4">
						<button
							type="button"
							onClick={() => setShowScanModal(false)}
							className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
						>
							Fechar
						</button>
					</div>
				</ModalShell>
			) : null}
		</div>
	);
}
