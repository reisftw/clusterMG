import {
	AlertTriangle,
	Building2,
	CalendarRange,
	CheckCircle2,
	Clock3,
	MapPin,
	PackageSearch,
	RefreshCw,
	RotateCw,
	Trophy,
	Warehouse,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import MovimentacoesCalendario from "./MovimentacoesCalendario";
import {
	buscarCidadesMovimentacoes,
	buscarDashboardMovimentacoes,
	buscarEquipamentosMovimentacoes,
	buscarJobConciliacaoOrdensFechadas,
	buscarJobVarreduraMovimentacoes,
	iniciarConciliacaoOrdensFechadas,
	iniciarVarreduraMovimentacoes,
	listarMovimentacoes,
	salvarEquipamentoConfig,
} from "../services/movimentacoesService";
import { readRowsFromPlanilha } from "../utils/readPlanilhaOrdensFechadas";

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

const CATEGORIA_OPCOES = ["FAST", "AC", "AX"];
const CATEGORIA_STYLE = {
	FAST: "border-purple-200 bg-purple-50 text-purple-700",
	AC: "border-sky-200 bg-sky-50 text-sky-700",
	AX: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function formatMoney(value) {
	if (value === null || value === undefined || value === "") return "";
	return Number(value).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

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

const ABAS = {
	PAINEL: "painel",
	CIDADES: "cidades",
	EQUIPAMENTOS: "equipamentos",
	ORDENS_FECHADAS: "ordens_fechadas",
};

export default function MovimentacoesPage() {
	const [aba, setAba] = useState(ABAS.PAINEL);

	const [dashboard, setDashboard] = useState({
		resumoPorEmpresaDia: [],
		rankingTecnicos: [],
		rankingProdutos: [],
	});
	const [loadingDashboard, setLoadingDashboard] = useState(true);
	const [dashboardError, setDashboardError] = useState("");

	const [cidades, setCidades] = useState({
		rankingCidadesRetiradas: [],
		rankingCidadesDevolvidas: [],
		rankingEstoques: [],
	});
	const [loadingCidades, setLoadingCidades] = useState(true);
	const [cidadesError, setCidadesError] = useState("");

	const [equipamentos, setEquipamentos] = useState({ produtos: [] });
	const [loadingEquipamentos, setLoadingEquipamentos] = useState(true);
	const [equipamentosError, setEquipamentosError] = useState("");

	const [equipamentoModal, setEquipamentoModal] = useState(null);
	const [salvandoEquipamento, setSalvandoEquipamento] = useState(false);
	const [equipamentoModalError, setEquipamentoModalError] = useState("");

	const [mesCalendario, setMesCalendario] = useState(
		() => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
	);
	const [diaSelecionado, setDiaSelecionado] = useState(null);
	const [diaModalPage, setDiaModalPage] = useState(1);
	const [diaModalData, setDiaModalData] = useState({
		items: [],
		page: 1,
		totalPages: 1,
		total: 0,
	});
	const [diaModalLoading, setDiaModalLoading] = useState(false);
	const [diaModalError, setDiaModalError] = useState("");

	const [ofArquivo, setOfArquivo] = useState(null);
	const [ofDataInicio, setOfDataInicio] = useState(hojeYMD());
	const [ofDataFim, setOfDataFim] = useState(hojeYMD());
	const [ofJob, setOfJob] = useState(null);
	const [ofProcessando, setOfProcessando] = useState(false);
	const [ofError, setOfError] = useState("");
	const [ofFiltro, setOfFiltro] = useState("todos");
	const [ofPage, setOfPage] = useState(1);
	const ofPollTimerRef = useRef(null);

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

	const carregarCidades = useCallback(async () => {
		setLoadingCidades(true);
		setCidadesError("");
		try {
			const data = await buscarCidadesMovimentacoes({
				dataInicio: intervaloPeriodo.dataInicio,
				dataFim: intervaloPeriodo.dataFim,
			});
			setCidades(data);
		} catch {
			setCidadesError("Não foi possível carregar o ranking de cidades.");
		} finally {
			setLoadingCidades(false);
		}
	}, [intervaloPeriodo]);

	useEffect(() => {
		if (aba === ABAS.CIDADES) carregarCidades();
	}, [aba, carregarCidades]);

	const handleSelecionarDia = (diaChave) => {
		setDiaSelecionado(diaChave);
		setDiaModalPage(1);
	};

	useEffect(() => {
		if (!diaSelecionado) return;
		let ativo = true;
		setDiaModalLoading(true);
		setDiaModalError("");
		listarMovimentacoes({
			page: diaModalPage,
			limit: 10,
			dataInicio: `${diaSelecionado}T00:00:00.000`,
			dataFim: `${diaSelecionado}T23:59:59.999`,
		})
			.then((data) => {
				if (ativo) setDiaModalData(data);
			})
			.catch(() => {
				if (ativo) setDiaModalError("Não foi possível carregar as entregas do dia.");
			})
			.finally(() => {
				if (ativo) setDiaModalLoading(false);
			});
		return () => {
			ativo = false;
		};
	}, [diaSelecionado, diaModalPage]);

	const ofPararPolling = useCallback(() => {
		if (ofPollTimerRef.current) {
			clearTimeout(ofPollTimerRef.current);
			ofPollTimerRef.current = null;
		}
	}, []);

	const ofAcompanharJob = useCallback(
		(jobId, startedAt) => {
			buscarJobConciliacaoOrdensFechadas(jobId)
				.then((job) => {
					setOfJob(job);
					const finalizado = job.status === "completed" || job.status === "failed";
					if (finalizado) {
						setOfProcessando(false);
						setOfPage(1);
						return;
					}
					if (Date.now() - startedAt > SCAN_POLL_TIMEOUT_MS) {
						setOfProcessando(false);
						setOfError(
							"A conciliação está demorando mais que o esperado. Confira novamente em instantes.",
						);
						return;
					}
					ofPollTimerRef.current = setTimeout(
						() => ofAcompanharJob(jobId, startedAt),
						SCAN_POLL_INTERVAL_MS,
					);
				})
				.catch(() => {
					setOfProcessando(false);
					setOfError("Não foi possível acompanhar a conciliação.");
				});
		},
		[],
	);

	useEffect(() => {
		return () => ofPararPolling();
	}, [ofPararPolling]);

	const handleConciliarOrdensFechadas = async () => {
		if (!ofArquivo) {
			setOfError("Selecione a planilha com nome e cidade do cliente.");
			return;
		}
		if (!ofDataInicio || !ofDataFim) {
			setOfError("Informe o período (data início e fim).");
			return;
		}
		ofPararPolling();
		setOfError("");
		setOfProcessando(true);
		setOfJob(null);
		try {
			const rows = await readRowsFromPlanilha(ofArquivo);
			const job = await iniciarConciliacaoOrdensFechadas({
				rows,
				dataInicio: new Date(`${ofDataInicio}T00:00:00`).toISOString(),
				dataFim: new Date(`${ofDataFim}T23:59:59.999`).toISOString(),
			});
			setOfJob(job);
			ofAcompanharJob(job.id, Date.now());
		} catch {
			setOfProcessando(false);
			setOfError(
				"Não foi possível ler a planilha ou iniciar a conciliação. Confira as colunas (nome e cidade).",
			);
		}
	};

	const ofItensFiltrados = useMemo(() => {
		const itens = ofJob?.resultado?.itens || [];
		if (ofFiltro === "entregues") return itens.filter((item) => item.entregue);
		if (ofFiltro === "nao_entregues") return itens.filter((item) => !item.entregue);
		return itens;
	}, [ofJob, ofFiltro]);

	const OF_PAGE_SIZE = 20;
	const ofTotalPages = Math.max(1, Math.ceil(ofItensFiltrados.length / OF_PAGE_SIZE));
	const ofPageSegura = Math.min(ofPage, ofTotalPages);
	const ofItensPaginados = ofItensFiltrados.slice(
		(ofPageSegura - 1) * OF_PAGE_SIZE,
		ofPageSegura * OF_PAGE_SIZE,
	);

	const carregarEquipamentos = useCallback(async () => {
		setLoadingEquipamentos(true);
		setEquipamentosError("");
		try {
			const data = await buscarEquipamentosMovimentacoes({
				dataInicio: intervaloPeriodo.dataInicio,
				dataFim: intervaloPeriodo.dataFim,
			});
			setEquipamentos(data);
		} catch {
			setEquipamentosError("Não foi possível carregar os equipamentos.");
		} finally {
			setLoadingEquipamentos(false);
		}
	}, [intervaloPeriodo]);

	useEffect(() => {
		if (aba === ABAS.EQUIPAMENTOS) carregarEquipamentos();
	}, [aba, carregarEquipamentos]);

	const handleAbrirEquipamento = (item) => {
		setEquipamentoModalError("");
		setEquipamentoModal({
			produto: item.produto,
			categoria: item.categoria || "",
			valor: item.valor ?? "",
		});
	};

	const handleSalvarEquipamento = async () => {
		if (!equipamentoModal) return;
		setSalvandoEquipamento(true);
		setEquipamentoModalError("");
		try {
			await salvarEquipamentoConfig({
				produtoNome: equipamentoModal.produto,
				categoria: equipamentoModal.categoria || null,
				valor: equipamentoModal.valor === "" ? null : equipamentoModal.valor,
			});
			setEquipamentoModal(null);
			carregarDashboard();
			if (aba === ABAS.EQUIPAMENTOS) carregarEquipamentos();
		} catch {
			setEquipamentoModalError("Não foi possível salvar a categoria/valor.");
		} finally {
			setSalvandoEquipamento(false);
		}
	};

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
						carregarCidades();
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
		[carregarDashboard, carregarLista, carregarCidades],
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

	const [atualizando, setAtualizando] = useState(false);

	const handleAtualizar = async () => {
		setAtualizando(true);
		try {
			await Promise.all([
				carregarDashboard(),
				carregarLista(),
				aba === ABAS.CIDADES ? carregarCidades() : Promise.resolve(),
			]);
		} finally {
			setAtualizando(false);
		}
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
							onClick={handleAtualizar}
							disabled={atualizando}
							title="Recarrega os dados já salvos, sem consultar o Portal de Movimentações."
							className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<RotateCw size={16} className={atualizando ? "animate-spin" : ""} />
							Atualizar
						</button>
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

			<div className="flex gap-2 border-b border-gray-200">
				<button
					type="button"
					onClick={() => setAba(ABAS.PAINEL)}
					className={`border-b-2 px-4 py-2 text-sm font-bold ${
						aba === ABAS.PAINEL
							? "border-blue-600 text-blue-700"
							: "border-transparent text-gray-500 hover:text-gray-700"
					}`}
				>
					Painel
				</button>
				<button
					type="button"
					onClick={() => setAba(ABAS.CIDADES)}
					className={`border-b-2 px-4 py-2 text-sm font-bold ${
						aba === ABAS.CIDADES
							? "border-blue-600 text-blue-700"
							: "border-transparent text-gray-500 hover:text-gray-700"
					}`}
				>
					Cidades
				</button>
				<button
					type="button"
					onClick={() => setAba(ABAS.EQUIPAMENTOS)}
					className={`border-b-2 px-4 py-2 text-sm font-bold ${
						aba === ABAS.EQUIPAMENTOS
							? "border-blue-600 text-blue-700"
							: "border-transparent text-gray-500 hover:text-gray-700"
					}`}
				>
					Equipamentos
				</button>
				<button
					type="button"
					onClick={() => setAba(ABAS.ORDENS_FECHADAS)}
					className={`border-b-2 px-4 py-2 text-sm font-bold ${
						aba === ABAS.ORDENS_FECHADAS
							? "border-blue-600 text-blue-700"
							: "border-transparent text-gray-500 hover:text-gray-700"
					}`}
				>
					Ordens Fechadas
				</button>
			</div>

			{aba === ABAS.PAINEL ? (
			<>
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

			<section>
				{loadingDashboard ? (
					<p className="text-sm text-gray-500">Carregando...</p>
				) : (
					<MovimentacoesCalendario
						resumoPorEmpresaDia={dashboard.resumoPorEmpresaDia}
						mes={mesCalendario}
						onMesChange={setMesCalendario}
						onSelecionarDia={handleSelecionarDia}
					/>
				)}
				{!loadingDashboard && !resumoPorDia.length ? (
					<p className="mt-3 text-sm text-gray-500">
						Nenhuma devolução encontrada ainda. Use "Varredura agora" para
						consultar o Portal de Movimentações.
					</p>
				) : null}
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
					<p className="mb-3 text-xs text-gray-500">
						Clique em um equipamento para definir a categoria e o valor.
					</p>
					<div className="space-y-2">
						{(dashboard.rankingProdutos || []).map((item, index) => (
							<button
								key={item.produto}
								type="button"
								onClick={() => handleAbrirEquipamento(item)}
								className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
							>
								<span className="flex min-w-0 items-center gap-2">
									<span className="truncate text-sm font-semibold text-gray-700">
										{index + 1}. {item.produto}
									</span>
									{item.categoria ? (
										<span
											className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
												CATEGORIA_STYLE[item.categoria] ||
												"border-gray-200 bg-gray-50 text-gray-600"
											}`}
										>
											{item.categoria}
										</span>
									) : null}
									{item.valor ? (
										<span className="text-[11px] font-semibold text-gray-500">
											{formatMoney(item.valor)}
										</span>
									) : null}
								</span>
								<span className="text-sm font-black text-gray-900">
									{item.total}
								</span>
							</button>
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
			</>
			) : aba === ABAS.CIDADES ? (
				<section className="space-y-5">
					{cidadesError ? (
						<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							{cidadesError}
						</p>
					) : null}

					<div className="grid gap-5 lg:grid-cols-3">
						<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
							<div className="mb-3 flex items-center gap-2">
								<MapPin size={18} className="text-red-500" />
								<h2 className="text-base font-bold text-gray-900">
									Cidades com mais retirada
								</h2>
							</div>
							<p className="mb-3 text-xs text-gray-500">
								Baseado na cidade da O.S. do cliente, quando a devolução casa
								com uma O.S.
							</p>
							<div className="space-y-2">
								{loadingCidades ? (
									<p className="text-sm text-gray-500">Carregando...</p>
								) : (
									(cidades.rankingCidadesRetiradas || []).map((item, index) => (
										<div
											key={item.cidade}
											className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
										>
											<span className="text-sm font-semibold text-gray-700">
												{index + 1}. {item.cidade}
											</span>
											<span className="text-sm font-black text-gray-900">
												{item.total}
											</span>
										</div>
									))
								)}
								{!loadingCidades && !cidades.rankingCidadesRetiradas?.length ? (
									<p className="text-sm text-gray-500">Sem dados no período.</p>
								) : null}
							</div>
						</div>

						<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
							<div className="mb-3 flex items-center gap-2">
								<Building2 size={18} className="text-green-600" />
								<h2 className="text-base font-bold text-gray-900">
									Cidades com devolução confirmada
								</h2>
							</div>
							<p className="mb-3 text-xs text-gray-500">
								Somente devoluções que já baixaram a O.S. do mapa/match.
							</p>
							<div className="space-y-2">
								{loadingCidades ? (
									<p className="text-sm text-gray-500">Carregando...</p>
								) : (
									(cidades.rankingCidadesDevolvidas || []).map((item, index) => (
										<div
											key={item.cidade}
											className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
										>
											<span className="text-sm font-semibold text-gray-700">
												{index + 1}. {item.cidade}
											</span>
											<span className="text-sm font-black text-gray-900">
												{item.total}
											</span>
										</div>
									))
								)}
								{!loadingCidades && !cidades.rankingCidadesDevolvidas?.length ? (
									<p className="text-sm text-gray-500">Sem dados no período.</p>
								) : null}
							</div>
						</div>

						<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
							<div className="mb-3 flex items-center gap-2">
								<Warehouse size={18} className="text-blue-600" />
								<h2 className="text-base font-bold text-gray-900">
									Estoques que mais receberam
								</h2>
							</div>
							<p className="mb-3 text-xs text-gray-500">
								Local de estoque de destino do equipamento devolvido.
							</p>
							<div className="space-y-2">
								{loadingCidades ? (
									<p className="text-sm text-gray-500">Carregando...</p>
								) : (
									(cidades.rankingEstoques || []).map((item, index) => (
										<div
											key={item.estoque}
											className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
										>
											<span className="text-sm font-semibold text-gray-700">
												{index + 1}. {item.estoque}
											</span>
											<span className="text-sm font-black text-gray-900">
												{item.total}
											</span>
										</div>
									))
								)}
								{!loadingCidades && !cidades.rankingEstoques?.length ? (
									<p className="text-sm text-gray-500">Sem dados no período.</p>
								) : null}
							</div>
						</div>
					</div>
				</section>
			) : aba === ABAS.EQUIPAMENTOS ? (
				<section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-base font-bold text-gray-900">
							Equipamentos rastreados
						</h2>
						<p className="text-xs text-gray-500">
							ONT/ONU, roteador e câmera de vídeo — clique para definir categoria
							e valor.
						</p>
					</div>

					{equipamentosError ? (
						<p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							{equipamentosError}
						</p>
					) : null}

					<div className="overflow-hidden rounded-lg border border-gray-100">
						<div className="overflow-x-auto">
							<table className="min-w-[640px] w-full divide-y divide-gray-100 text-sm">
								<thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
									<tr>
										<th className="px-4 py-3">Produto</th>
										<th className="px-4 py-3">Categoria</th>
										<th className="px-4 py-3">Valor</th>
										<th className="px-4 py-3">Devoluções</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100 bg-white">
									{loadingEquipamentos ? (
										<tr>
											<td colSpan={4} className="px-4 py-8 text-center text-gray-500">
												Carregando...
											</td>
										</tr>
									) : (
										(equipamentos.produtos || []).map((item) => (
											<tr
												key={item.produto}
												className="cursor-pointer hover:bg-gray-50"
												onClick={() => handleAbrirEquipamento(item)}
											>
												<td className="px-4 py-3 font-semibold text-gray-800">
													{item.produto}
												</td>
												<td className="px-4 py-3">
													{item.categoria ? (
														<span
															className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
																CATEGORIA_STYLE[item.categoria] ||
																"border-gray-200 bg-gray-50 text-gray-600"
															}`}
														>
															{item.categoria}
														</span>
													) : (
														<span className="text-xs text-gray-400">
															Não definida
														</span>
													)}
												</td>
												<td className="px-4 py-3 text-gray-700">
													{formatMoney(item.valor) || "-"}
												</td>
												<td className="px-4 py-3 font-bold text-gray-900">
													{item.total}
												</td>
											</tr>
										))
									)}
									{!loadingEquipamentos && !equipamentos.produtos?.length ? (
										<tr>
											<td colSpan={4} className="px-4 py-8 text-center text-gray-500">
												Nenhum equipamento encontrado no período.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					</div>
				</section>
			) : (
				<section className="space-y-5">
					<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
						<h2 className="mb-1 text-base font-bold text-gray-900">
							Conciliar O.S. fechadas x movimentações
						</h2>
						<p className="mb-4 text-sm text-gray-500">
							Suba a planilha com nome e cidade do cliente (mesmo formato do
							upload do Mapa), escolha o período e o sistema confronta cada
							linha com{" "}
							<strong>qualquer movimentação</strong> registrada no Portal de
							Movimentações no período — não só retirada/devolução de comodato.
						</p>

						{ofError ? (
							<p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{ofError}
							</p>
						) : null}

						<div className="grid gap-3 sm:grid-cols-4">
							<label className="block sm:col-span-2">
								<span className="mb-1.5 block text-xs font-semibold text-gray-600">
									Planilha (nome e cidade do cliente)
								</span>
								<input
									type="file"
									accept=".xlsx,.xls,.csv"
									onChange={(event) => setOfArquivo(event.target.files?.[0] || null)}
									className="input-field w-full"
								/>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-xs font-semibold text-gray-600">
									Data início
								</span>
								<input
									type="date"
									value={ofDataInicio}
									onChange={(event) => setOfDataInicio(event.target.value)}
									className="input-field w-full"
								/>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-xs font-semibold text-gray-600">
									Data fim
								</span>
								<input
									type="date"
									value={ofDataFim}
									onChange={(event) => setOfDataFim(event.target.value)}
									className="input-field w-full"
								/>
							</label>
						</div>

						<button
							type="button"
							onClick={handleConciliarOrdensFechadas}
							disabled={ofProcessando}
							className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<RefreshCw size={16} className={ofProcessando ? "animate-spin" : ""} />
							{ofProcessando ? "Conciliando..." : "Conciliar"}
						</button>

						{ofJob && ofJob.status !== "completed" ? (
							<div className="mt-4">
								<div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
									<div
										className="h-full bg-blue-600 transition-all"
										style={{ width: `${ofJob.percent || 0}%` }}
									/>
								</div>
								<p className="mt-2 text-sm text-gray-600">{ofJob.stage}</p>
								{ofJob.status === "failed" ? (
									<p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
										{ofJob.error || "Falha na conciliação."}
									</p>
								) : null}
							</div>
						) : null}
					</div>

					{ofJob?.status === "completed" ? (
						<>
							<div className="grid gap-3 sm:grid-cols-3">
								<div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
										O.S. analisadas
									</p>
									<p className="mt-1 text-2xl font-black text-gray-900">
										{ofJob.total}
									</p>
								</div>
								<div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-green-600">
										Entregues
									</p>
									<p className="mt-1 text-2xl font-black text-green-800">
										{ofJob.entregues}
									</p>
								</div>
								<div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-red-600">
										Não entregues
									</p>
									<p className="mt-1 text-2xl font-black text-red-700">
										{ofJob.naoEntregues}
									</p>
								</div>
							</div>

							<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
								<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<h2 className="text-base font-bold text-gray-900">
										Detalhamento (para análise dos não entregues)
									</h2>
									<select
										value={ofFiltro}
										onChange={(event) => {
											setOfFiltro(event.target.value);
											setOfPage(1);
										}}
										className="input-field sm:w-auto"
									>
										<option value="todos">Todas</option>
										<option value="entregues">Entregues</option>
										<option value="nao_entregues">Não entregues</option>
									</select>
								</div>

								<div className="overflow-hidden rounded-lg border border-gray-100">
									<div className="overflow-x-auto">
										<table className="min-w-[640px] w-full divide-y divide-gray-100 text-sm">
											<thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
												<tr>
													<th className="px-4 py-3">Cliente</th>
													<th className="px-4 py-3">Cidade</th>
													<th className="px-4 py-3">Status</th>
													<th className="px-4 py-3">Movimentação encontrada</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-gray-100 bg-white">
												{ofItensPaginados.map((item, index) => (
													<tr key={`${item.nome}-${index}`}>
														<td className="px-4 py-3 font-semibold text-gray-900">
															{item.nome}
														</td>
														<td className="px-4 py-3 text-gray-600">
															{item.cidade || "-"}
														</td>
														<td className="px-4 py-3">
															<span
																className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
																	item.entregue
																		? "border-green-200 bg-green-50 text-green-700"
																		: "border-red-200 bg-red-50 text-red-700"
																}`}
															>
																{item.entregue ? (
																	<CheckCircle2 size={13} />
																) : (
																	<AlertTriangle size={13} />
																)}
																{item.entregue ? "Entregue" : "Não entregue"}
															</span>
														</td>
														<td className="px-4 py-3 text-xs text-gray-500">
															{item.movimentacao
																? `${item.movimentacao.tipoOperacao || "-"} · ${formatDateTime(item.movimentacao.emitidoEm)}`
																: "Nenhuma movimentação encontrada no período"}
														</td>
													</tr>
												))}
												{!ofItensPaginados.length ? (
													<tr>
														<td colSpan={4} className="px-4 py-8 text-center text-gray-500">
															Nenhum item para este filtro.
														</td>
													</tr>
												) : null}
											</tbody>
										</table>
									</div>
								</div>

								<div className="mt-4 flex items-center justify-between text-sm text-gray-500">
									<span>
										Página {ofPageSegura} de {ofTotalPages} ·{" "}
										{ofItensFiltrados.length} registro(s)
									</span>
									<div className="flex gap-2">
										<button
											type="button"
											disabled={ofPageSegura <= 1}
											onClick={() => setOfPage((current) => Math.max(1, current - 1))}
											className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
										>
											Anterior
										</button>
										<button
											type="button"
											disabled={ofPageSegura >= ofTotalPages}
											onClick={() => setOfPage((current) => current + 1)}
											className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
										>
											Próxima
										</button>
									</div>
								</div>
							</div>
						</>
					) : null}
				</section>
			)}

			{equipamentoModal ? (
				<ModalShell
					onClose={() => setEquipamentoModal(null)}
					showClose={false}
					size="md"
					bodyClassName="p-0"
				>
					<div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
						<div>
							<h2 className="text-base font-bold text-gray-900">
								{equipamentoModal.produto}
							</h2>
							<p className="text-sm text-gray-500">
								Categoria e valor de referência do equipamento.
							</p>
						</div>
						<button
							type="button"
							onClick={() => setEquipamentoModal(null)}
							className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
							aria-label="Fechar"
						>
							<X size={16} />
						</button>
					</div>

					<div className="space-y-4 p-5">
						{equipamentoModalError ? (
							<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{equipamentoModalError}
							</p>
						) : null}

						<label className="block">
							<span className="mb-1.5 block text-xs font-semibold text-gray-600">
								Categoria
							</span>
							<select
								value={equipamentoModal.categoria}
								onChange={(event) =>
									setEquipamentoModal((current) => ({
										...current,
										categoria: event.target.value,
									}))
								}
								className="input-field w-full"
							>
								<option value="">Não definida</option>
								{CATEGORIA_OPCOES.map((categoria) => (
									<option key={categoria} value={categoria}>
										{categoria}
									</option>
								))}
							</select>
						</label>

						<label className="block">
							<span className="mb-1.5 block text-xs font-semibold text-gray-600">
								Valor (R$)
							</span>
							<input
								type="number"
								min="0"
								step="0.01"
								value={equipamentoModal.valor}
								onChange={(event) =>
									setEquipamentoModal((current) => ({
										...current,
										valor: event.target.value,
									}))
								}
								className="input-field w-full"
								placeholder="0,00"
							/>
						</label>
					</div>

					<div className="flex justify-end gap-2 border-t border-gray-100 p-4">
						<button
							type="button"
							onClick={() => setEquipamentoModal(null)}
							className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
						>
							Cancelar
						</button>
						<button
							type="button"
							onClick={handleSalvarEquipamento}
							disabled={salvandoEquipamento}
							className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{salvandoEquipamento ? "Salvando..." : "Salvar"}
						</button>
					</div>
				</ModalShell>
			) : null}

			{diaSelecionado ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
					<div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
						<div className="mb-4 flex items-start justify-between gap-4">
							<div>
								<p className="text-base font-bold text-gray-900">
									Entregas de{" "}
									{new Date(`${diaSelecionado}T00:00:00`).toLocaleDateString("pt-BR")}
								</p>
								<p className="text-sm text-gray-500">
									{diaModalData.total} entrega(s)
								</p>
							</div>
							<button
								type="button"
								onClick={() => setDiaSelecionado(null)}
								className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
							>
								Fechar
							</button>
						</div>

						{diaModalError ? (
							<p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{diaModalError}
							</p>
						) : null}

						<div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
							{diaModalLoading ? (
								<p className="py-6 text-center text-sm text-gray-500">
									Carregando...
								</p>
							) : (
								diaModalData.items.map((item) => {
									const StatusIcon = STATUS_ICON[item.statusMatch] || AlertTriangle;
									return (
										<div key={item.id} className="rounded-xl bg-gray-50 p-3">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div className="min-w-0">
													<p className="truncate text-sm font-bold text-gray-800">
														{item.parceiroNome || "-"}
													</p>
													<p className="mt-0.5 text-xs text-gray-500">
														{item.empresaNome || "-"} · {item.registradoPor || "-"}
													</p>
												</div>
												<span
													className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
														STATUS_STYLE[item.statusMatch] || STATUS_STYLE.pendente
													}`}
												>
													<StatusIcon size={13} />
													{STATUS_LABEL[item.statusMatch] || item.statusMatch}
												</span>
											</div>
											<p className="mt-1 text-xs text-gray-500">
												{item.produtoNome || "-"} ·{" "}
												<span className="font-mono">{item.serie}</span>
												{item.osNumero ? ` · O.S. ${item.osNumero}` : ""}
											</p>
										</div>
									);
								})
							)}
							{!diaModalLoading && !diaModalData.items.length ? (
								<p className="py-6 text-center text-sm text-gray-500">
									Nenhuma entrega encontrada neste dia.
								</p>
							) : null}
						</div>

						{diaModalData.totalPages > 1 ? (
							<div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-sm text-gray-500">
									Página {diaModalData.page} de {diaModalData.totalPages}
								</p>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setDiaModalPage((current) => Math.max(1, current - 1))}
										disabled={diaModalData.page <= 1}
										className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
									>
										Anterior
									</button>
									<button
										type="button"
										onClick={() =>
											setDiaModalPage((current) =>
												Math.min(diaModalData.totalPages, current + 1),
											)
										}
										disabled={diaModalData.page >= diaModalData.totalPages}
										className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
									>
										Próxima
									</button>
								</div>
							</div>
						) : null}
					</div>
				</div>
			) : null}

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

								{scanJob.status === "completed" && scanJob.resultado?.limiteAtingido ? (
									<p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
										Atenção: o período escolhido tem mais páginas de movimentações
										do que a varredura conseguiu consultar desta vez (
										{scanJob.resultado.paginasConsultadas} de{" "}
										{scanJob.resultado.totalPaginasNoPeriodo}). Rode a varredura
										novamente para continuar cobrindo o restante.
									</p>
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
