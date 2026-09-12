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
	Upload,
	Warehouse,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import { useAuthContext } from "../../../context/AuthContext";
import { addClusterLogo } from "../../../utils/pdfBranding";
import MovimentacoesCalendario from "./MovimentacoesCalendario";
import {
	buscarCidadesMovimentacoes,
	buscarConfigMovimentacoes,
	buscarDashboardMovimentacoes,
	buscarResumoCategoriaEquipamentos,
	buscarEquipamentosMovimentacoes,
	buscarJobConciliacaoOrdensFechadas,
	buscarJobVarreduraMovimentacoes,
	buscarUltimaConciliacaoOrdensFechadas,
	iniciarConciliacaoOrdensFechadas,
	iniciarVarreduraMovimentacoes,
	listarMovimentacoes,
	salvarEquipamentoConfig,
} from "../services/movimentacoesService";
import {
	readRowsFromPlanilha,
	reduzirLinhasPlanilha,
} from "../utils/readPlanilhaOrdensFechadas";

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
// Varredura do ano todo: centenas de paginas por janela de 15 dias, dezenas
// de janelas — pode legitimamente levar mais de uma hora. Timeout de
// acompanhamento bem mais generoso (o job roda no backend de qualquer
// forma; isso so controla quando o front para de fazer polling sozinho).
const SCAN_POLL_TIMEOUT_ANO_TODO_MS = 3 * 60 * 60 * 1000;

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

// Pro PDF: "Todo o período" sozinho fica vago — troca pelas datas reais
// (primeiro e ultimo dia com devolução registrada), calculadas a partir do
// que ja esta carregado no painel. Quando ha filtro de periodo aplicado,
// usa descreverPeriodo normalmente.
function descreverPeriodoComDatas(tipo, valor, resumoPorEmpresaDia) {
	if (tipo !== PERIODO_TIPOS.TODOS) return descreverPeriodo(tipo, valor);
	const dias = [...new Set((resumoPorEmpresaDia || []).map((item) => String(item.dia || "").slice(0, 10)))]
		.filter(Boolean)
		.sort();
	if (!dias.length) return "Sem registros";
	const formatar = (data) => new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
	const inicio = formatar(dias[0]);
	const fim = formatar(dias[dias.length - 1]);
	return inicio === fim ? inicio : `${inicio} a ${fim}`;
}

// Extraido pra evitar ternario aninhado (mesmo padrao usado em Sidebar.jsx).
function resolveAnoTodoTitle(scanning, config) {
	if (scanning) {
		return "Já tem uma varredura em andamento — clique para reabrir o progresso.";
	}
	if (config?.backfillAnualConcluidoEm) {
		return `Admin — reprocessa o Portal de Movimentações desde 01/01/${ANO_ATUAL}. Última varredura completa em ${formatDateTime(config.backfillAnualConcluidoEm)}.`;
	}
	return `Admin — reprocessa o Portal de Movimentações desde 01/01/${ANO_ATUAL} (demorado: consulta todo o histórico do ano em janelas de 15 dias). Rode uma vez para coletar o histórico; depois disso o botão "Varredura agora" cobre o dia a dia.`;
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

// Card de ranking de Cidades: 10 itens por pagina (pedido explicito), cada
// linha clicavel abre o modal de detalhe (abrirDetalheCidade, na pagina).
function RankingCidadeCard({
	icon: Icon,
	iconClassName,
	titulo,
	descricao,
	loading,
	ranking,
	itemKey,
	page,
	onPageChange,
	onSelecionar,
}) {
	const items = ranking?.items || [];
	const totalPages = ranking?.totalPages || 1;
	return (
		<div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
			<div className="mb-3 flex items-center gap-2">
				<Icon size={18} className={iconClassName} />
				<h2 className="text-base font-bold text-gray-900">{titulo}</h2>
			</div>
			<p className="mb-3 text-xs text-gray-500">{descricao}</p>
			<div className="space-y-2">
				{loading ? (
					<p className="text-sm text-gray-500">Carregando...</p>
				) : (
					items.map((item, index) => (
						<button
							key={item[itemKey]}
							type="button"
							onClick={() => onSelecionar(item[itemKey])}
							className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
						>
							<span className="truncate text-sm font-semibold text-gray-700">
								{(page - 1) * (ranking?.limit || 10) + index + 1}. {item[itemKey]}
							</span>
							<span className="ml-2 shrink-0 text-sm font-black text-gray-900">
								{item.total}
							</span>
						</button>
					))
				)}
				{!loading && !items.length ? (
					<p className="text-sm text-gray-500">Sem dados no período.</p>
				) : null}
			</div>
			{!loading && totalPages > 1 ? (
				<div className="mt-3 flex items-center justify-between text-xs text-gray-500">
					<span>
						Página {page} de {totalPages}
					</span>
					<div className="flex gap-1">
						<button
							type="button"
							disabled={page <= 1}
							onClick={() => onPageChange(Math.max(1, page - 1))}
							className="rounded-md border border-gray-200 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Anterior
						</button>
						<button
							type="button"
							disabled={page >= totalPages}
							onClick={() => onPageChange(page + 1)}
							className="rounded-md border border-gray-200 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Próxima
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}

export default function MovimentacoesPage() {
	const { currentUser } = useAuthContext();
	const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";
	const [config, setConfig] = useState(null);

	useEffect(() => {
		let ativo = true;
		buscarConfigMovimentacoes()
			.then((data) => {
				if (ativo) setConfig(data);
			})
			.catch(() => {});
		return () => {
			ativo = false;
		};
	}, []);

	const [aba, setAba] = useState(ABAS.PAINEL);

	const [dashboard, setDashboard] = useState({
		resumoPorEmpresaDia: [],
		rankingTecnicos: [],
		rankingProdutos: [],
	});
	const [loadingDashboard, setLoadingDashboard] = useState(true);
	const [dashboardError, setDashboardError] = useState("");

	const CIDADES_VAZIO = {
		items: [],
		page: 1,
		totalPages: 1,
		total: 0,
	};
	const [cidades, setCidades] = useState({
		rankingCidadesRetiradas: CIDADES_VAZIO,
		rankingCidadesDevolvidas: CIDADES_VAZIO,
		rankingEstoques: CIDADES_VAZIO,
	});
	const [loadingCidades, setLoadingCidades] = useState(true);
	const [cidadesError, setCidadesError] = useState("");
	const [cidadesPageRetiradas, setCidadesPageRetiradas] = useState(1);
	const [cidadesPageDevolvidas, setCidadesPageDevolvidas] = useState(1);
	const [cidadesPageEstoques, setCidadesPageEstoques] = useState(1);
	// Filtro proprio da aba Cidades (independente do filtro geral da
	// pagina) — mesmo padrao do modal "Resumo por categoria" em Equipamentos.
	const [cidadesPeriodoTipo, setCidadesPeriodoTipo] = useState(PERIODO_TIPOS.TODOS);
	const [cidadesDia, setCidadesDia] = useState(hojeYMD());
	const [cidadesMes, setCidadesMes] = useState(mesAtualYM());
	const [cidadesAno, setCidadesAno] = useState(String(ANO_ATUAL));

	const [cidadeDetalhe, setCidadeDetalhe] = useState(null);
	const [cidadeDetalheData, setCidadeDetalheData] = useState({
		items: [],
		page: 1,
		totalPages: 1,
		total: 0,
	});
	const [cidadeDetalhePage, setCidadeDetalhePage] = useState(1);
	const [cidadeDetalheLoading, setCidadeDetalheLoading] = useState(false);
	const [cidadeDetalheError, setCidadeDetalheError] = useState("");

	const [equipamentos, setEquipamentos] = useState({ produtos: [] });
	const [loadingEquipamentos, setLoadingEquipamentos] = useState(true);
	const [equipamentosError, setEquipamentosError] = useState("");

	const [equipamentoModal, setEquipamentoModal] = useState(null);
	const [salvandoEquipamento, setSalvandoEquipamento] = useState(false);
	const [equipamentoModalError, setEquipamentoModalError] = useState("");

	const [showResumoCategoriaModal, setShowResumoCategoriaModal] = useState(false);
	const [resumoCategorias, setResumoCategorias] = useState([]);
	const [loadingResumoCategoria, setLoadingResumoCategoria] = useState(false);
	const [resumoCategoriaError, setResumoCategoriaError] = useState("");
	// Filtro proprio do modal (independente do filtro geral da pagina) —
	// pedido explicito: o resumo por categoria estava sempre herdando o
	// periodo do painel, entao trocar o filtro geral pra "Mes" fazia o
	// resumo tambem ficar preso no mes sem o usuario perceber.
	const [resumoCategoriaPeriodoTipo, setResumoCategoriaPeriodoTipo] = useState(
		PERIODO_TIPOS.TODOS,
	);
	const [resumoCategoriaDia, setResumoCategoriaDia] = useState(hojeYMD());
	const [resumoCategoriaMes, setResumoCategoriaMes] = useState(mesAtualYM());
	const [resumoCategoriaAno, setResumoCategoriaAno] = useState(String(ANO_ATUAL));

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

	const [showOfModal, setShowOfModal] = useState(false);
	const [ofArquivos, setOfArquivos] = useState([]);
	// "dia" = intervalo livre (dataInicio/dataFim escolhidos a dedo); "mes" =
	// escolhe so o mes e a gente calcula o 1o/ultimo dia — pedido explicito
	// pra facilitar rodar a conciliacao pro mes inteiro sem contar dias.
	const [ofPeriodoTipo, setOfPeriodoTipo] = useState(PERIODO_TIPOS.MES);
	const [ofDataInicio, setOfDataInicio] = useState(hojeYMD());
	const [ofDataFim, setOfDataFim] = useState(hojeYMD());
	const [ofMes, setOfMes] = useState(mesAtualYM());
	const [ofJob, setOfJob] = useState(null);
	const [ofProcessando, setOfProcessando] = useState(false);
	const [ofHidratando, setOfHidratando] = useState(true);
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
	// Varredura "ano todo" e sabidamente longa (centenas de paginas por
	// janela, dezenas de janelas) — usa um timeout de acompanhamento bem
	// maior do que a varredura normal (24h), que costuma terminar rapido.
	const [scanAnoTodoAtivo, setScanAnoTodoAtivo] = useState(false);
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

	const cidadesValorAtual = () => {
		if (cidadesPeriodoTipo === PERIODO_TIPOS.DIA) return cidadesDia;
		if (cidadesPeriodoTipo === PERIODO_TIPOS.MES) return cidadesMes;
		if (cidadesPeriodoTipo === PERIODO_TIPOS.ANO) return cidadesAno;
		return "";
	};

	const carregarCidades = useCallback(async () => {
		setLoadingCidades(true);
		setCidadesError("");
		try {
			const intervalo = calcularIntervaloPeriodo(cidadesPeriodoTipo, cidadesValorAtual());
			const data = await buscarCidadesMovimentacoes({
				dataInicio: intervalo.dataInicio,
				dataFim: intervalo.dataFim,
				pageRetiradas: cidadesPageRetiradas,
				pageDevolvidas: cidadesPageDevolvidas,
				pageEstoques: cidadesPageEstoques,
			});
			setCidades(data);
		} catch {
			setCidadesError("Não foi possível carregar o ranking de cidades.");
		} finally {
			setLoadingCidades(false);
		}
	}, [
		cidadesPeriodoTipo,
		cidadesDia,
		cidadesMes,
		cidadesAno,
		cidadesPageRetiradas,
		cidadesPageDevolvidas,
		cidadesPageEstoques,
	]);

	useEffect(() => {
		if (aba === ABAS.CIDADES) carregarCidades();
	}, [aba, carregarCidades]);

	const handleSelecionarDia = (diaChave) => {
		setDiaSelecionado(diaChave);
		setDiaModalPage(1);
	};

	// Abre o detalhe (clientes/movimentacoes) de uma linha do ranking de
	// Cidades — tipo "cidade" cobre os rankings de retiradas/devolvidas
	// (statusFiltro opcional restringe a "casada" no ranking de devolvidas),
	// tipo "estoque" cobre o ranking de estoques.
	const abrirDetalheCidade = ({ tipo, valor, statusFiltro }) => {
		setCidadeDetalhe({ tipo, valor, statusFiltro });
		setCidadeDetalhePage(1);
	};

	useEffect(() => {
		if (!cidadeDetalhe) return;
		let ativo = true;
		setCidadeDetalheLoading(true);
		setCidadeDetalheError("");
		listarMovimentacoes({
			page: cidadeDetalhePage,
			limit: 10,
			dataInicio: intervaloPeriodo.dataInicio,
			dataFim: intervaloPeriodo.dataFim,
			status: cidadeDetalhe.statusFiltro,
			...(cidadeDetalhe.tipo === "estoque"
				? { estoqueDestino: cidadeDetalhe.valor }
				: { cidade: cidadeDetalhe.valor }),
		})
			.then((data) => {
				if (ativo) setCidadeDetalheData(data);
			})
			.catch(() => {
				if (ativo) setCidadeDetalheError("Não foi possível carregar o detalhe.");
			})
			.finally(() => {
				if (ativo) setCidadeDetalheLoading(false);
			});
		return () => {
			ativo = false;
		};
	}, [cidadeDetalhe, cidadeDetalhePage, intervaloPeriodo]);

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

	// Re-hidrata a conciliacao ao abrir a pagina/aba — a conciliacao roda em
	// segundo plano no backend (setImmediate, igual o import do Mapa) e
	// sobrevive a pagina fechada/recarregada; o que faltava era o front
	// buscar esse resultado de novo em vez de depender so do estado do React
	// (perdido a cada remount). Sem isso o usuario sobe a planilha, sai da
	// aba, e quando volta parece que "nao fez nada" — o job so nao aparecia
	// mais em lugar nenhum.
	useEffect(() => {
		let ativo = true;
		buscarUltimaConciliacaoOrdensFechadas()
			.then((job) => {
				if (!ativo || !job) return;
				setOfJob(job);
				const emAndamento = job.status === "queued" || job.status === "running";
				if (emAndamento) {
					setOfProcessando(true);
					ofAcompanharJob(job.id, Date.now());
				}
			})
			.catch(() => {})
			.finally(() => {
				if (ativo) setOfHidratando(false);
			});
		return () => {
			ativo = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Resolve o periodo escolhido no modal pro par ISO que a API espera —
	// "mes" usa o mesmo calculo ja usado nos outros filtros de periodo da
	// pagina (1o ao ultimo dia do mes); "dia" mantem o intervalo livre.
	const resolverPeriodoOrdensFechadas = () => {
		if (ofPeriodoTipo === PERIODO_TIPOS.MES) {
			if (!ofMes) return null;
			return calcularIntervaloPeriodo(PERIODO_TIPOS.MES, ofMes);
		}
		if (!ofDataInicio || !ofDataFim) return null;
		return {
			dataInicio: new Date(`${ofDataInicio}T00:00:00`).toISOString(),
			dataFim: new Date(`${ofDataFim}T23:59:59.999`).toISOString(),
		};
	};

	const handleConciliarOrdensFechadas = async () => {
		if (!ofArquivos.length) {
			setOfError("Selecione ao menos uma planilha com nome e cidade do cliente.");
			return;
		}
		const periodo = resolverPeriodoOrdensFechadas();
		if (!periodo) {
			setOfError("Informe o período (mês, ou data início e fim).");
			return;
		}
		ofPararPolling();
		setOfError("");
		setOfProcessando(true);
		setOfJob(null);
		try {
			// Suporta mais de uma planilha: junta as linhas de todas antes de
			// mandar pro backend, que processa como uma conciliacao so.
			const rowsPorArquivo = await Promise.all(
				ofArquivos.map((arquivo) => readRowsFromPlanilha(arquivo)),
			);
			// So os 4 campos usados na conciliacao — a planilha real vem com
			// muito mais colunas, e mandar tudo infla o payload a toa (ja bateu
			// em limite de tamanho de requisicao com 10k+ linhas).
			const rows = reduzirLinhasPlanilha(rowsPorArquivo.flat());
			const job = await iniciarConciliacaoOrdensFechadas({
				rows,
				dataInicio: periodo.dataInicio,
				dataFim: periodo.dataFim,
			});
			setOfJob(job);
			ofAcompanharJob(job.id, Date.now());
			// Fecha o modal assim que o job comeca a rodar no backend — a
			// conciliacao continua em segundo plano e o usuario pode navegar
			// pelas outras abas de Movimentacoes enquanto isso.
			setShowOfModal(false);
			setOfArquivos([]);
		} catch (error) {
			setOfProcessando(false);
			setOfError(
				error?.message ||
					"Não foi possível ler a(s) planilha(s) ou iniciar a conciliação. Confira as colunas (nome e cidade).",
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

	const resumoCategoriaValorAtual = () => {
		if (resumoCategoriaPeriodoTipo === PERIODO_TIPOS.DIA) return resumoCategoriaDia;
		if (resumoCategoriaPeriodoTipo === PERIODO_TIPOS.MES) return resumoCategoriaMes;
		if (resumoCategoriaPeriodoTipo === PERIODO_TIPOS.ANO) return resumoCategoriaAno;
		return "";
	};

	const carregarResumoCategoria = async () => {
		setLoadingResumoCategoria(true);
		setResumoCategoriaError("");
		try {
			const intervalo = calcularIntervaloPeriodo(
				resumoCategoriaPeriodoTipo,
				resumoCategoriaValorAtual(),
			);
			const data = await buscarResumoCategoriaEquipamentos({
				dataInicio: intervalo.dataInicio,
				dataFim: intervalo.dataFim,
			});
			setResumoCategorias(data.categorias || []);
		} catch {
			setResumoCategoriaError("Não foi possível carregar o resumo por categoria.");
		} finally {
			setLoadingResumoCategoria(false);
		}
	};

	const handleAbrirResumoCategoria = async () => {
		setShowResumoCategoriaModal(true);
		await carregarResumoCategoria();
	};

	const handleGerarPdfResumoCategoria = async () => {
		const { default: jsPDF } = await import("jspdf");
		const { default: autoTable } = await import("jspdf-autotable");
		const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(15);
		pdf.text("Resumo de Equipamentos por Categoria", 40, 42);
		await addClusterLogo(pdf, { width: 76, height: 38, y: 22, marginRight: 40 });

		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(9);
		const periodoTexto = descreverPeriodoComDatas(
			resumoCategoriaPeriodoTipo,
			resumoCategoriaValorAtual(),
			dashboard.resumoPorEmpresaDia,
		);
		pdf.text(`Período: ${periodoTexto}`, 40, 62);

		const valorTotalGeral = resumoCategorias.reduce(
			(soma, item) => soma + Number(item.valorTotal || 0),
			0,
		);
		const quantidadeTotalGeral = resumoCategorias.reduce(
			(soma, item) => soma + Number(item.quantidade || 0),
			0,
		);

		autoTable(pdf, {
			startY: 80,
			head: [["Categoria", "Quantidade", "Valor total"]],
			body: resumoCategorias.map((item) => [
				item.categoria,
				item.quantidade,
				formatMoney(item.valorTotal) || "R$ 0,00",
			]),
			foot: [["Total", quantidadeTotalGeral, formatMoney(valorTotalGeral) || "R$ 0,00"]],
			theme: "grid",
			styles: { fontSize: 9, cellPadding: 6 },
			headStyles: { fillColor: [37, 99, 235], textColor: 255 },
			footStyles: { fillColor: [17, 24, 39], textColor: 255, fontStyle: "bold" },
		});

		pdf.save("resumo-equipamentos-por-categoria.pdf");
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
						setScanAnoTodoAtivo(false);
						carregarDashboard();
						carregarLista();
						carregarCidades();
						buscarConfigMovimentacoes()
							.then(setConfig)
							.catch(() => {});
						return;
					}
					const timeoutMs = scanAnoTodoAtivo
						? SCAN_POLL_TIMEOUT_ANO_TODO_MS
						: SCAN_POLL_TIMEOUT_MS;
					if (Date.now() - startedAt > timeoutMs) {
						// So para de acompanhar automaticamente — o job continua
						// rodando no backend. Nao mexe em "scanning" nem no job:
						// reabrir o modal (botao "Varredura em andamento") retoma
						// o polling de onde parou.
						setScanError(
							"Parou de atualizar sozinho, mas a varredura continua rodando no backend. Feche e reabra o modal para retomar o acompanhamento.",
						);
						return;
					}
					pollTimerRef.current = setTimeout(
						() => acompanharJob(jobId, startedAt),
						SCAN_POLL_INTERVAL_MS,
					);
				})
				.catch(() => {
					setScanError(
						"Não foi possível acompanhar a varredura agora. Feche e reabra o modal para tentar de novo.",
					);
				});
		},
		[carregarDashboard, carregarLista, carregarCidades, scanAnoTodoAtivo],
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
		setScanAnoTodoAtivo(anoTodo);
		setShowScanModal(true);
		try {
			const intervalo = anoTodo
				? {
						dataInicio: new Date(ANO_ATUAL, 0, 1, 0, 0, 0, 0).toISOString(),
						dataFim: new Date().toISOString(),
						anoTodo: true,
					}
				: {};
			const job = await iniciarVarreduraMovimentacoes(intervalo);
			setScanJob(job);
			acompanharJob(job.id, Date.now());
		} catch {
			setScanning(false);
			setScanAnoTodoAtivo(false);
			setScanError("Não foi possível iniciar a varredura.");
		}
	};

	// Reabre o modal de uma varredura que continua rodando no backend. Se o
	// polling automatico tinha parado (timeout do front), retoma dali —
	// senao so mostra o progresso que ja esta sendo acompanhado.
	const handleReabrirVarredura = () => {
		setShowScanModal(true);
		if (!pollTimerRef.current && scanJob?.id) {
			setScanError("");
			acompanharJob(scanJob.id, Date.now());
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
							onClick={() =>
								scanning ? handleReabrirVarredura() : handleIniciarVarredura()
							}
							title={
								scanning
									? "Já tem uma varredura em andamento — clique para reabrir o progresso."
									: undefined
							}
							className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
						>
							<RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
							{scanning ? "Varredura em andamento (ver progresso)" : "Varredura agora"}
						</button>
						{isAdmin ? (
							<button
								type="button"
								onClick={() =>
									scanning
										? handleReabrirVarredura()
										: handleIniciarVarredura({ anoTodo: true })
								}
								title={resolveAnoTodoTitle(scanning, config)}
								className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"
							>
								<CalendarRange size={13} />
								Ano todo (admin)
							</button>
						) : null}
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
					<div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
						<p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
							Filtrar período
						</p>
						<div className="flex flex-wrap items-center gap-2">
							{[
								{ tipo: PERIODO_TIPOS.TODOS, label: "Todos" },
								{ tipo: PERIODO_TIPOS.DIA, label: "Dia" },
								{ tipo: PERIODO_TIPOS.MES, label: "Mês" },
								{ tipo: PERIODO_TIPOS.ANO, label: "Ano" },
							].map((opcao) => (
								<button
									key={opcao.tipo}
									type="button"
									onClick={() => {
										setCidadesPeriodoTipo(opcao.tipo);
										setCidadesPageRetiradas(1);
										setCidadesPageDevolvidas(1);
										setCidadesPageEstoques(1);
									}}
									className={`rounded-lg border px-3 py-2 text-xs font-bold ${
										cidadesPeriodoTipo === opcao.tipo
											? "border-blue-500 bg-blue-50 text-blue-700"
											: "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
									}`}
								>
									{opcao.label}
								</button>
							))}

							{cidadesPeriodoTipo === PERIODO_TIPOS.DIA ? (
								<input
									type="date"
									value={cidadesDia}
									onChange={(event) => setCidadesDia(event.target.value)}
									className="input-field w-auto"
								/>
							) : null}
							{cidadesPeriodoTipo === PERIODO_TIPOS.MES ? (
								<input
									type="month"
									value={cidadesMes}
									onChange={(event) => setCidadesMes(event.target.value)}
									className="input-field w-auto"
								/>
							) : null}
							{cidadesPeriodoTipo === PERIODO_TIPOS.ANO ? (
								<select
									value={cidadesAno}
									onChange={(event) => setCidadesAno(event.target.value)}
									className="input-field w-auto"
								>
									{ANOS_DISPONIVEIS.map((ano) => (
										<option key={ano} value={ano}>
											{ano}
										</option>
									))}
								</select>
							) : null}
						</div>
					</div>

					{cidadesError ? (
						<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							{cidadesError}
						</p>
					) : null}

					<div className="grid gap-5 lg:grid-cols-3">
						<RankingCidadeCard
							icon={MapPin}
							iconClassName="text-red-500"
							titulo="Cidades com mais retirada"
							descricao="Baseado na cidade da O.S. do cliente, quando a devolução casa com uma O.S."
							loading={loadingCidades}
							ranking={cidades.rankingCidadesRetiradas}
							itemKey="cidade"
							page={cidadesPageRetiradas}
							onPageChange={setCidadesPageRetiradas}
							onSelecionar={(valor) => abrirDetalheCidade({ tipo: "cidade", valor })}
						/>

						<RankingCidadeCard
							icon={Building2}
							iconClassName="text-green-600"
							titulo="Cidades com devolução confirmada"
							descricao="Somente devoluções que já baixaram a O.S. do mapa/match."
							loading={loadingCidades}
							ranking={cidades.rankingCidadesDevolvidas}
							itemKey="cidade"
							page={cidadesPageDevolvidas}
							onPageChange={setCidadesPageDevolvidas}
							onSelecionar={(valor) =>
								abrirDetalheCidade({ tipo: "cidade", valor, statusFiltro: "casada" })
							}
						/>

						<RankingCidadeCard
							icon={Warehouse}
							iconClassName="text-blue-600"
							titulo="Estoques que mais receberam"
							descricao="Local de estoque de destino do equipamento devolvido."
							loading={loadingCidades}
							ranking={cidades.rankingEstoques}
							itemKey="estoque"
							page={cidadesPageEstoques}
							onPageChange={setCidadesPageEstoques}
							onSelecionar={(valor) => abrirDetalheCidade({ tipo: "estoque", valor })}
						/>
					</div>
				</section>
			) : aba === ABAS.EQUIPAMENTOS ? (
				<section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
					<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-base font-bold text-gray-900">
								Equipamentos rastreados
							</h2>
							<p className="text-xs text-gray-500">
								ONT/ONU, roteador e câmera de vídeo — clique para definir
								categoria e valor.
							</p>
						</div>
						<button
							type="button"
							onClick={handleAbrirResumoCategoria}
							className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
						>
							<Trophy size={16} />
							Resumo por categoria
						</button>
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
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h2 className="text-base font-bold text-gray-900">
									Conciliar O.S. fechadas x movimentações
								</h2>
								<p className="mt-1 text-sm text-gray-500">
									Sobe uma ou mais planilhas (nome e cidade do cliente, mesmo
									formato do upload do Mapa) e confronta com{" "}
									<strong>qualquer movimentação</strong> do Portal de
									Movimentações no período escolhido.
								</p>
							</div>
							<button
								type="button"
								onClick={() => {
									setOfError("");
									setShowOfModal(true);
								}}
								className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
							>
								<Upload size={16} />
								Nova conciliação
							</button>
						</div>

						{ofHidratando ? (
							<p className="mt-4 flex items-center gap-2 text-xs font-semibold text-gray-400">
								<RefreshCw size={12} className="animate-spin" />
								Verificando se há alguma conciliação em andamento ou recém-concluída...
							</p>
						) : null}

						{ofProcessando ? (
							<div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
								<p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
									<RefreshCw size={14} className="animate-spin" />
									Conciliação em andamento no backend — pode ficar à vontade
									para usar as outras abas enquanto isso. Pode navegar,
									recarregar ou fechar a página: quando voltar, o resultado
									estará aqui.
								</p>
								{ofJob ? (
									<>
										<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-100">
											<div
												className="h-full bg-blue-600 transition-all"
												style={{ width: `${ofJob.percent || 0}%` }}
											/>
										</div>
										<p className="mt-1 text-xs text-blue-600">{ofJob.stage}</p>
									</>
								) : null}
							</div>
						) : null}

						{ofJob?.status === "failed" ? (
							<p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{ofJob.error || "Falha na conciliação."}
							</p>
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
													<th className="px-4 py-3">Código</th>
													<th className="px-4 py-3">Cidade</th>
													<th className="px-4 py-3">Fechamento</th>
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
														<td className="px-4 py-3 font-mono text-xs text-gray-600">
															{item.codigo || "-"}
														</td>
														<td className="px-4 py-3 text-gray-600">
															{item.cidade || "-"}
														</td>
														<td className="px-4 py-3 text-gray-600">
															{item.fechamento || "-"}
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
														<td colSpan={6} className="px-4 py-8 text-center text-gray-500">
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

			{showResumoCategoriaModal ? (
				<ModalShell
					onClose={() => setShowResumoCategoriaModal(false)}
					showClose={false}
					size="lg"
					bodyClassName="p-0"
				>
					<div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
						<div>
							<h2 className="text-base font-bold text-gray-900">
								Resumo por categoria
							</h2>
							<p className="text-sm text-gray-500">
								Quantidade e valor total por categoria de equipamento no
								período selecionado.
							</p>
						</div>
						<button
							type="button"
							onClick={() => setShowResumoCategoriaModal(false)}
							className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
							aria-label="Fechar"
						>
							<X size={16} />
						</button>
					</div>

					<div className="space-y-4 p-5">
						<div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
							<p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
								Filtrar período
							</p>
							<div className="mb-2 grid grid-cols-4 gap-2">
								{[
									{ tipo: PERIODO_TIPOS.TODOS, label: "Todos" },
									{ tipo: PERIODO_TIPOS.DIA, label: "Dia" },
									{ tipo: PERIODO_TIPOS.MES, label: "Mês" },
									{ tipo: PERIODO_TIPOS.ANO, label: "Ano" },
								].map((opcao) => (
									<button
										key={opcao.tipo}
										type="button"
										onClick={() => {
											setResumoCategoriaPeriodoTipo(opcao.tipo);
										}}
										className={`rounded-lg border px-2 py-2 text-xs font-bold ${
											resumoCategoriaPeriodoTipo === opcao.tipo
												? "border-blue-500 bg-blue-50 text-blue-700"
												: "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
										}`}
									>
										{opcao.label}
									</button>
								))}
							</div>

							{resumoCategoriaPeriodoTipo === PERIODO_TIPOS.DIA ? (
								<input
									type="date"
									value={resumoCategoriaDia}
									onChange={(event) => setResumoCategoriaDia(event.target.value)}
									className="input-field mb-2 w-full"
								/>
							) : null}
							{resumoCategoriaPeriodoTipo === PERIODO_TIPOS.MES ? (
								<input
									type="month"
									value={resumoCategoriaMes}
									onChange={(event) => setResumoCategoriaMes(event.target.value)}
									className="input-field mb-2 w-full"
								/>
							) : null}
							{resumoCategoriaPeriodoTipo === PERIODO_TIPOS.ANO ? (
								<select
									value={resumoCategoriaAno}
									onChange={(event) => setResumoCategoriaAno(event.target.value)}
									className="input-field mb-2 w-full"
								>
									{ANOS_DISPONIVEIS.map((ano) => (
										<option key={ano} value={ano}>
											{ano}
										</option>
									))}
								</select>
							) : null}

							<button
								type="button"
								onClick={carregarResumoCategoria}
								className="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800"
							>
								Aplicar filtro
							</button>
						</div>

						{resumoCategoriaError ? (
							<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{resumoCategoriaError}
							</p>
						) : null}

						{loadingResumoCategoria ? (
							<p className="py-6 text-center text-sm text-gray-500">
								Carregando...
							</p>
						) : (
							<div className="overflow-hidden rounded-lg border border-gray-100">
								<table className="w-full divide-y divide-gray-100 text-sm">
									<thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
										<tr>
											<th className="px-4 py-3">Categoria</th>
											<th className="px-4 py-3">Quantidade</th>
											<th className="px-4 py-3">Valor total</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-gray-100 bg-white">
										{resumoCategorias.map((item) => (
											<tr key={item.categoria}>
												<td className="px-4 py-3">
													{CATEGORIA_OPCOES.includes(item.categoria) ? (
														<span
															className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
																CATEGORIA_STYLE[item.categoria] ||
																"border-gray-200 bg-gray-50 text-gray-600"
															}`}
														>
															{item.categoria}
														</span>
													) : (
														<span className="text-gray-600">
															{item.categoria}
														</span>
													)}
												</td>
												<td className="px-4 py-3 font-bold text-gray-900">
													{item.quantidade}
												</td>
												<td className="px-4 py-3 text-gray-700">
													{formatMoney(item.valorTotal) || "R$ 0,00"}
												</td>
											</tr>
										))}
										{!resumoCategorias.length ? (
											<tr>
												<td colSpan={3} className="px-4 py-8 text-center text-gray-500">
													Nenhum dado no período.
												</td>
											</tr>
										) : null}
									</tbody>
								</table>
							</div>
						)}
					</div>

					<div className="flex justify-end gap-2 border-t border-gray-100 p-4">
						<button
							type="button"
							onClick={() => setShowResumoCategoriaModal(false)}
							className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
						>
							Fechar
						</button>
						<button
							type="button"
							onClick={handleGerarPdfResumoCategoria}
							disabled={loadingResumoCategoria || !resumoCategorias.length}
							className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
						>
							Gerar PDF
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

			{cidadeDetalhe ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
					<div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
						<div className="mb-4 flex items-start justify-between gap-4">
							<div>
								<p className="text-base font-bold text-gray-900">
									{cidadeDetalhe.tipo === "estoque" ? "Estoque" : "Cidade"}:{" "}
									{cidadeDetalhe.valor}
								</p>
								<p className="text-sm text-gray-500">
									{cidadeDetalhe.statusFiltro === "casada"
										? "Devoluções confirmadas (O.S. baixada)"
										: "Clientes que entregaram"}{" "}
									· {cidadeDetalheData.total} registro(s)
								</p>
							</div>
							<button
								type="button"
								onClick={() => setCidadeDetalhe(null)}
								className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
							>
								Fechar
							</button>
						</div>

						{cidadeDetalheError ? (
							<p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{cidadeDetalheError}
							</p>
						) : null}

						<div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
							{cidadeDetalheLoading ? (
								<p className="py-6 text-center text-sm text-gray-500">
									Carregando...
								</p>
							) : (
								cidadeDetalheData.items.map((item) => {
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
												{item.osNumero ? ` · O.S. ${item.osNumero}` : ""} ·{" "}
												{formatDateTime(item.emitidoEm)}
											</p>
										</div>
									);
								})
							)}
							{!cidadeDetalheLoading && !cidadeDetalheData.items.length ? (
								<p className="py-6 text-center text-sm text-gray-500">
									Nenhum registro encontrado.
								</p>
							) : null}
						</div>

						{cidadeDetalheData.totalPages > 1 ? (
							<div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-sm text-gray-500">
									Página {cidadeDetalheData.page} de {cidadeDetalheData.totalPages}
								</p>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() =>
											setCidadeDetalhePage((current) => Math.max(1, current - 1))
										}
										disabled={cidadeDetalheData.page <= 1}
										className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
									>
										Anterior
									</button>
									<button
										type="button"
										onClick={() =>
											setCidadeDetalhePage((current) =>
												Math.min(cidadeDetalheData.totalPages, current + 1),
											)
										}
										disabled={cidadeDetalheData.page >= cidadeDetalheData.totalPages}
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

			{showOfModal ? (
				<ModalShell
					onClose={() => setShowOfModal(false)}
					showClose={false}
					size="lg"
					bodyClassName="p-0"
				>
					<div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
								<Upload size={18} />
							</div>
							<div>
								<h2 className="text-base font-bold text-gray-900">
									Nova conciliação de O.S. fechadas
								</h2>
								<p className="text-sm text-gray-500">
									Pode selecionar mais de uma planilha de uma vez.
								</p>
							</div>
						</div>
						<button
							type="button"
							onClick={() => setShowOfModal(false)}
							className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
							aria-label="Fechar"
						>
							<X size={16} />
						</button>
					</div>

					<div className="space-y-4 p-5">
						{ofError ? (
							<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{ofError}
							</p>
						) : null}

						<label className="block">
							<span className="mb-1.5 block text-xs font-semibold text-gray-600">
								Planilhas (nome e cidade do cliente)
							</span>
							<input
								type="file"
								multiple
								accept=".xlsx,.xls,.csv"
								onChange={(event) =>
									setOfArquivos(Array.from(event.target.files || []))
								}
								className="input-field w-full"
							/>
							{ofArquivos.length ? (
								<p className="mt-1.5 text-xs text-gray-500">
									{ofArquivos.length} planilha(s) selecionada(s):{" "}
									{ofArquivos.map((arquivo) => arquivo.name).join(", ")}
								</p>
							) : null}
						</label>

						<div>
							<span className="mb-1.5 block text-xs font-semibold text-gray-600">
								Período da conciliação
							</span>
							<div className="mb-3 inline-flex rounded-lg border border-gray-200 p-1">
								<button
									type="button"
									onClick={() => setOfPeriodoTipo(PERIODO_TIPOS.MES)}
									className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
										ofPeriodoTipo === PERIODO_TIPOS.MES
											? "bg-gray-900 text-white"
											: "text-gray-600 hover:bg-gray-50"
									}`}
								>
									Por mês
								</button>
								<button
									type="button"
									onClick={() => setOfPeriodoTipo(PERIODO_TIPOS.DIA)}
									className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
										ofPeriodoTipo === PERIODO_TIPOS.DIA
											? "bg-gray-900 text-white"
											: "text-gray-600 hover:bg-gray-50"
									}`}
								>
									Intervalo de datas
								</button>
							</div>

							{ofPeriodoTipo === PERIODO_TIPOS.MES ? (
								<label className="block">
									<span className="mb-1.5 block text-xs font-semibold text-gray-600">
										Mês
									</span>
									<input
										type="month"
										value={ofMes}
										onChange={(event) => setOfMes(event.target.value)}
										className="input-field w-full sm:w-56"
									/>
									<p className="mt-1.5 text-xs text-gray-500">
										Varre o mês inteiro, do dia 1 ao último dia.
									</p>
								</label>
							) : (
								<div className="grid gap-3 sm:grid-cols-2">
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
							)}
						</div>
					</div>

					<div className="flex justify-end gap-2 border-t border-gray-100 p-4">
						<button
							type="button"
							onClick={() => setShowOfModal(false)}
							className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
						>
							Cancelar
						</button>
						<button
							type="button"
							onClick={handleConciliarOrdensFechadas}
							className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
						>
							<Upload size={16} />
							Iniciar conciliação
						</button>
					</div>
				</ModalShell>
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
