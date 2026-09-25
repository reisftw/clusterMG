import {
	CalendarClock,
	CalendarDays,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Clock,
	Copy,
	PackageCheck,
	PackageX,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";
import { getConfig } from "../../ferramentas/services/ferramentasService";
import { buscarRegionais } from "../../regionais/services/regionaisService";
import { AGENDAMENTO_STATUS, STATUS_STYLES } from "../constants";
import { useAgendamentos } from "../hooks/useAgendamentos";
import {
	buscarLogsAgendamentos,
	buscarResumoMatchAtual,
} from "../services/agendamentosService";
import {
	registrarNaoRecolhido,
	registrarRecolhido,
} from "../services/agendamentoCommandsService";
import AgendamentoModal from "./AgendamentoModal";

const parseLocal = (str) => {
	if (!str) return null;
	const [year, month, day] = str.split("-").map(Number);
	return new Date(year, month - 1, day);
};

const formatData = (str) => {
	const date = parseLocal(str);
	return date
		? date.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			})
		: "-";
};

const todayKey = () => {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const queryDateKey = () => {
	if (typeof window === "undefined") return "";
	const value = new URLSearchParams(window.location.search).get("data");
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
};

const dateKeyFromDate = (date) =>
	[
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");

const yesterdayKey = () => {
	const date = new Date();
	date.setDate(date.getDate() - 1);
	return dateKeyFromDate(date);
};

const formatDateTime = (value) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const uniqueSorted = (items) =>
	[...new Set(items.filter(Boolean))].sort((a, b) =>
		a.localeCompare(b, "pt-BR"),
	);

const formatNumber = (value) => Number(value || 0).toLocaleString("pt-BR");

const normalizeLocation = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const findRegionalByCity = (regionais, cidade) => {
	const cityKey = normalizeLocation(cidade);
	return (
		regionais.find((regional) =>
			(regional.cidades || []).some(
				(item) => normalizeLocation(item?.nome || item) === cityKey,
			),
		)?.nome || ""
	);
};

const getLogDateKey = (log) =>
	String(
		log?.data_agendamento || log?.data || log?.agendamento_data || "",
	).slice(0, 10);

const getLogCreatedTime = (log) => {
	const createdAt = new Date(
		log?.criado_em || log?.created_at || log?.createdAt || 0,
	);
	return Number.isNaN(createdAt.getTime()) ? 0 : createdAt.getTime();
};

const getLogRunKey = (log) => {
	const explicitKey =
		log?.lote_id ||
		log?.batch_id ||
		log?.execucao_id ||
		log?.importacao_id ||
		log?.mapa_import_id ||
		log?.run_id;

	if (explicitKey) return String(explicitKey);

	const rawCreatedAt =
		log?.criado_em || log?.created_at || log?.createdAt || "";
	if (rawCreatedAt) return String(rawCreatedAt);

	const createdAt = new Date(0);
	if (Number.isNaN(createdAt.getTime())) return "sem-rodada";

	return createdAt.toISOString().slice(0, 16);
};

const filterLatestMapCheckLogs = (logs) => {
	const targetDate = yesterdayKey();
	const dailyLogs = logs
		.filter((item) => item.tipo === "verificacao_mapa")
		.filter((item) => getLogDateKey(item) === targetDate)
		.sort((a, b) => getLogCreatedTime(b) - getLogCreatedTime(a));

	const latestRunKey = getLogRunKey(dailyLogs[0]);
	if (!latestRunKey) return [];

	return dailyLogs.filter((item) => getLogRunKey(item) === latestRunKey);
};

const formatMonthTitle = (date) =>
	date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const buildCalendarDays = (monthDate) => {
	const year = monthDate.getFullYear();
	const month = monthDate.getMonth();
	const first = new Date(year, month, 1);
	const start = new Date(first);
	start.setDate(first.getDate() - first.getDay());

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, "0"),
			String(date.getDate()).padStart(2, "0"),
		].join("-");
		return {
			key,
			date,
			day: date.getDate(),
			currentMonth: date.getMonth() === month,
		};
	});
};

const isTecnicoAtivo = (colaborador) => {
	const status = String(colaborador?.status || "").toLowerCase();
	const cargo = String(colaborador?.cargo || "").toLowerCase();
	return (
		(status === "ativo" || status.includes("exper")) &&
		(cargo.includes("tecnico") || cargo.includes("técnico"))
	);
};

const StatusBadge = ({ status }) => (
	<span
		className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
			STATUS_STYLES[status] || "border-gray-200 bg-gray-100 text-gray-600"
		}`}
	>
		{status || "Aguardando dia"}
	</span>
);

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveCalendarDayClass(isToday, currentMonth) {
	if (isToday) return "border-blue-300 bg-blue-50";
	return currentMonth
		? "border-gray-100 bg-gray-50 hover:bg-blue-50"
		: "border-gray-50 bg-gray-50/50 text-gray-300";
}

const AgendamentosCalendar = ({
	agendamentos,
	mes,
	onMesChange,
	canEdit = false,
	onEdit,
}) => {
	const [diaSelecionado, setDiaSelecionado] = useState(() => queryDateKey() || null);
	const [modalPage, setModalPage] = useState(1);
	const dias = useMemo(() => buildCalendarDays(mes), [mes]);
	const porData = useMemo(() => {
		const grouped = {};
		agendamentos.forEach((item) => {
			if (!item.data) return;
			grouped[item.data] = [...(grouped[item.data] || []), item];
		});
		return grouped;
	}, [agendamentos]);
	const itensSelecionados = diaSelecionado ? porData[diaSelecionado] || [] : [];
	const modalTotalPages = Math.max(1, Math.ceil(itensSelecionados.length / 10));
	const modalSafePage = Math.min(modalPage, modalTotalPages);
	const itensPaginados = itensSelecionados.slice(
		(modalSafePage - 1) * 10,
		modalSafePage * 10,
	);

	return (
		<>
			<div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
							<CalendarDays size={16} className="text-blue-600" />
						</div>
						<p className="text-sm font-bold capitalize text-gray-900">
							{formatMonthTitle(mes)}
						</p>
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() =>
								onMesChange(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))
							}
							className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
							title="Mes anterior"
						>
							<ChevronLeft size={15} />
						</button>
						<button
							type="button"
							onClick={() =>
								onMesChange(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))
							}
							className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
							title="Proximo mes"
						>
							<ChevronRight size={15} />
						</button>
					</div>
				</div>

				<div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-gray-400">
					{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((dia) => (
						<div key={dia} className="py-1">
							{dia}
						</div>
					))}
				</div>

				<div className="mt-1 grid grid-cols-7 gap-1">
					{dias.map((dia) => {
						const itens = porData[dia.key] || [];
						const isToday = dia.key === todayKey();
						return (
							<button
								key={dia.key}
								type="button"
								onClick={() => {
									if (!itens.length) return;
									setDiaSelecionado(dia.key);
									setModalPage(1);
								}}
								disabled={!itens.length}
								className={`min-h-16 rounded-xl border p-2 text-left transition-colors disabled:cursor-default ${resolveCalendarDayClass(isToday, dia.currentMonth)} ${itens.length ? "cursor-pointer" : ""}`}
							>
								<div className="flex items-center justify-between gap-1">
									<span
										className={`text-xs font-semibold ${
											dia.currentMonth ? "text-gray-700" : "text-gray-300"
										}`}
									>
										{dia.day}
									</span>
									{itens.length > 0 && (
										<span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
											{itens.length}
										</span>
									)}
								</div>
								<div className="mt-2 flex flex-wrap gap-1">
									{itens.slice(0, 3).map((item) => (
										<span
											key={item.id}
											className="h-1.5 w-1.5 rounded-full bg-blue-500"
											title={item.codigo_cliente}
										/>
									))}
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{diaSelecionado && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
					<div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
						<div className="mb-4 flex items-start justify-between gap-4">
							<div>
								<p className="text-base font-bold text-gray-900">
									Agendamentos de {formatData(diaSelecionado)}
								</p>
								<p className="text-sm text-gray-500">
									{itensSelecionados.length} agendamento(s)
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

						<div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
							{itensPaginados.map((item) => (
								<div key={item.id} className="rounded-xl bg-gray-50 p-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate text-sm font-bold text-gray-800">
												{item.cliente_nome ||
													`Cliente ${item.codigo_cliente || "-"}`}
											</p>
											<p className="mt-0.5 text-xs text-gray-500">
												Codigo {item.codigo_cliente || "-"} /{" "}
												{item.cidade || "Cidade nao informada"}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<StatusBadge status={item.status} />
											{canEdit && (
												<button
													type="button"
													onClick={() => {
														setDiaSelecionado(null);
														onEdit?.(item);
													}}
													className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:border-blue-200 hover:text-blue-600"
													title="Editar agendamento"
												>
													<Pencil size={14} />
												</button>
											)}
										</div>
									</div>
									<p className="mt-1 text-xs text-gray-500">
										{item.tecnico_nome || "-"} / {item.turno || "-"}
										{item.hora ? ` / ${item.hora}` : ""}
									</p>
									{item.observacao && (
										<p className="mt-2 text-sm text-gray-500">
											{item.observacao}
										</p>
									)}
								</div>
							))}
						</div>

						{itensSelecionados.length > 10 && (
							<div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-sm text-gray-500">
									Mostrando {(modalSafePage - 1) * 10 + 1}-
									{Math.min(modalSafePage * 10, itensSelecionados.length)} de{" "}
									{itensSelecionados.length}
								</p>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() =>
											setModalPage((current) => Math.max(1, current - 1))
										}
										disabled={modalSafePage === 1}
										className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
									>
										Anterior
									</button>
									<span className="text-sm font-semibold text-gray-500">
										{modalSafePage} / {modalTotalPages}
									</span>
									<button
										type="button"
										onClick={() =>
											setModalPage((current) =>
												Math.min(modalTotalPages, current + 1),
											)
										}
										disabled={modalSafePage === modalTotalPages}
										className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
									>
										Proxima
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
};

const AgendamentosPage = () => {
	const { currentUser } = useAuthContext();
	const { colaboradores } = useColaboradores();
	const {
		agendamentos,
		loading,
		error,
		carregar,
		criar,
		atualizar,
		excluir,
		aplicarAtualizacaoLocal,
	} = useAgendamentos();
	const [tecnicosConfig, setTecnicosConfig] = useState([]);
	const [modal, setModal] = useState(null);
	const [confirmar, setConfirmar] = useState(null);
	const [desfecho, setDesfecho] = useState(null);
	const [savingDesfecho, setSavingDesfecho] = useState(false);
	const [desfechoErro, setDesfechoErro] = useState("");
	const [copiadoId, setCopiadoId] = useState(null);
	const [filtroPeriodo, setFiltroPeriodo] = useState("hoje");
	const [filtroStatus, setFiltroStatus] = useState("todos");
	const [filtroTecnico, setFiltroTecnico] = useState("todos");
	const [busca, setBusca] = useState("");
	const [page, setPage] = useState(1);
	const [logsMapa, setLogsMapa] = useState([]);
	const [matchResumo, setMatchResumo] = useState(null);
	const [logsMapaOpen, setLogsMapaOpen] = useState(false);
	const [mesCalendario, setMesCalendario] = useState(() => {
		const selected = parseLocal(queryDateKey());
		if (selected) return new Date(selected.getFullYear(), selected.getMonth(), 1);
		const hoje = new Date();
		return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
	});
	const [diaOperacao, setDiaOperacao] = useState(todayKey);

	const podeEditar = hasPermission(currentUser?.role, "manage_agendamentos");

	useEffect(() => {
		let mounted = true;
		getConfig()
			.then((config) => {
				if (!mounted) return;
				setTecnicosConfig(
					(config?.tecnicos || []).map((item) => item?.nome).filter(Boolean),
				);
			})
			.catch(() => {
				if (mounted) setTecnicosConfig([]);
			});
		return () => {
			mounted = false;
		};
	}, []);

	const carregarLogsMapa = async () => {
		try {
			const [logs, resumoMatch] = await Promise.all([
				buscarLogsAgendamentos({ max: 3000 }),
				buscarResumoMatchAtual(),
			]);
			setLogsMapa(filterLatestMapCheckLogs(logs));
			setMatchResumo(resumoMatch);
		} catch {
			setLogsMapa([]);
			setMatchResumo(null);
		}
	};

	useEffect(() => {
		carregarLogsMapa();
	}, []);

	const tecnicos = useMemo(() => {
		const fallback = colaboradores
			.filter(isTecnicoAtivo)
			.map((item) => item.nome);
		return uniqueSorted(tecnicosConfig.length > 0 ? tecnicosConfig : fallback);
	}, [colaboradores, tecnicosConfig]);

	const opcoesTecnico = useMemo(
		() =>
			uniqueSorted([
				...tecnicos,
				...agendamentos.map((item) => item.tecnico_nome),
			]),
		[agendamentos, tecnicos],
	);

	const resumo = useMemo(() => {
		const hoje = todayKey();
		return {
			hoje: agendamentos.filter((item) => item.data === hoje).length,
			pendentes: agendamentos.filter((item) =>
				["Aguardando dia", "Enviado ao tecnico"].includes(item.status),
			).length,
			concluidos: agendamentos.filter((item) =>
				["Entregue", "Concluido"].includes(item.status),
			).length,
		};
	}, [agendamentos]);

	const listaFiltrada = useMemo(() => {
		const hoje = todayKey();
		const termo = busca.trim().toLowerCase();

		return agendamentos.filter((item) => {
			const data = String(item.data || "");
			// Extraido pra achado javascript:S3358 (ternario aninhado).
			let periodoOk = true;
			if (filtroPeriodo === "hoje") periodoOk = data === hoje;
			else if (filtroPeriodo === "proximos")
				periodoOk = data >= hoje && item.status !== "Cancelado";
			const statusOk = filtroStatus === "todos" || item.status === filtroStatus;
			const tecnicoOk =
				filtroTecnico === "todos" || item.tecnico_nome === filtroTecnico;
			const textoOk =
				!termo ||
				`${item.codigo_cliente || ""} ${item.tecnico_nome || ""} ${item.observacao || ""}`
					.toLowerCase()
					.includes(termo);
			return periodoOk && statusOk && tecnicoOk && textoOk;
		});
	}, [agendamentos, busca, filtroPeriodo, filtroStatus, filtroTecnico]);

	const totalPages = Math.max(1, Math.ceil(listaFiltrada.length / 10));
	const safePage = Math.min(page, totalPages);
	const listaPaginada = useMemo(
		() => listaFiltrada.slice((safePage - 1) * 10, safePage * 10),
		[listaFiltrada, safePage],
	);
	const agendamentosDoDia = useMemo(
		() =>
			agendamentos
				.filter((item) => item.data === diaOperacao)
				.sort((a, b) =>
					String(a.hora || a.turno || "").localeCompare(
						String(b.hora || b.turno || ""),
						"pt-BR",
					),
				),
		[agendamentos, diaOperacao],
	);

	const handleSalvar = async (dados) => {
		if (modal?.id) {
			await atualizar(modal.id, dados);
		} else {
			await criar(dados);
		}
	};

	const handleRetirado = async () => {
		if (!desfecho?.agendamento) return;
		setSavingDesfecho(true);
		setDesfechoErro("");
		try {
			await registrarRecolhido({
				agendamento: desfecho.agendamento,
				usuario: currentUser,
			});
			aplicarAtualizacaoLocal(desfecho.agendamento.id, {
				status: "Concluido",
				equipamento_retirado: true,
				motivo_nao_recolhimento: "",
				desfecho_por_id: currentUser?.id,
				desfecho_por_nome: currentUser?.nome,
			});
			setDesfecho(null);
		} catch {
			setDesfechoErro("Nao foi possivel registrar a retirada.");
		} finally {
			setSavingDesfecho(false);
		}
	};

	const handleNaoRecolhido = async () => {
		const motivo = desfecho?.motivo?.trim();
		if (!motivo) {
			setDesfechoErro("Informe o motivo da nao recolha.");
			return;
		}
		setSavingDesfecho(true);
		setDesfechoErro("");
		try {
			const agendamento = desfecho.agendamento;
			let regional = agendamento.regional || "";
			if (!regional) {
				const regionais = await buscarRegionais();
				regional = findRegionalByCity(regionais, agendamento.cidade);
			}
			if (!regional) {
				throw new Error("Cidade sem regional cadastrada.");
			}
			await registrarNaoRecolhido({
				agendamento,
				motivo,
				regional,
				usuario: currentUser,
			});
			aplicarAtualizacaoLocal(agendamento.id, {
				status: "Nao recolhido",
				equipamento_retirado: false,
				motivo_nao_recolhimento: motivo,
				enviado_reagendamento: true,
				desfecho_por_id: currentUser?.id,
				desfecho_por_nome: currentUser?.nome,
			});
			setDesfecho(null);
		} catch (error) {
			setDesfechoErro(
				error.message || "Nao foi possivel enviar para reagendamento.",
			);
		} finally {
			setSavingDesfecho(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-sm text-gray-400">
						{listaFiltrada.length} agendamento(s) exibido(s)
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => {
							carregar();
							carregarLogsMapa();
						}}
						className="rounded-xl border border-gray-200 p-2 text-gray-400 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
						title="Atualizar"
					>
						<RefreshCw size={16} />
					</button>
					{podeEditar && (
						<button
							type="button"
							onClick={() => setModal({})}
							className="btn-primary flex items-center gap-2"
						>
							<Plus size={16} />
							Novo Agendamento
						</button>
					)}
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
							<CalendarClock size={18} />
						</div>
						<div>
							<p className="text-xs font-semibold text-gray-400">Hoje</p>
							<p className="text-xl font-bold text-gray-900">{resumo.hoje}</p>
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
							<Clock size={18} />
						</div>
						<div>
							<p className="text-xs font-semibold text-gray-400">Pendentes</p>
							<p className="text-xl font-bold text-gray-900">
								{resumo.pendentes}
							</p>
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
							<CheckCircle2 size={18} />
						</div>
						<div>
							<p className="text-xs font-semibold text-gray-400">Concluidos</p>
							<p className="text-xl font-bold text-gray-900">
								{resumo.concluidos}
							</p>
						</div>
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="text-sm font-bold text-blue-950">
						Match atual e verificação automática
					</h2>
					<div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
						<span className="rounded-full bg-white px-3 py-1 text-blue-800 shadow-sm">
							Match atual:{" "}
							{matchResumo
								? `${formatNumber(matchResumo.totalMatches)} match(es)`
								: "carregando"}
						</span>
						{matchResumo?.totalAgentesMatches ? (
							<span className="rounded-full bg-white px-3 py-1 text-blue-700 shadow-sm">
								Agentes: {formatNumber(matchResumo.totalAgentesMatches)}
							</span>
						) : null}
						<span className="rounded-full bg-white px-3 py-1 text-blue-700 shadow-sm">
							Verificação ontem:{" "}
							{formatNumber(logsMapa.length)} alteração(ões)
						</span>
					</div>
					<p className="mt-2 text-xs text-blue-700">
						O match atual usa a mesma fonte do painel. As alterações são apenas
						o resultado da última conferência dos agendamentos de ontem.
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						carregarLogsMapa();
						setLogsMapaOpen(true);
					}}
					className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
				>
					<CalendarClock size={16} />
					Ver logs do mapa
				</button>
			</div>

			{logsMapaOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
					<div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
						<div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h2 className="text-lg font-bold text-gray-900">
									Verificação automática pelo mapa
								</h2>
								<p className="text-sm text-gray-500">
									Apenas a última rodada do mapa para os agendamentos do dia
									anterior.
								</p>
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={carregarLogsMapa}
									className="inline-flex items-center gap-2 rounded-xl border border-blue-100 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
								>
									<RefreshCw size={14} />
									Atualizar logs
								</button>
								<button
									type="button"
									onClick={() => setLogsMapaOpen(false)}
									className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
								>
									Fechar
								</button>
							</div>
						</div>

						<div className="overflow-y-auto p-5">
							{!logsMapa.length ? (
								<p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
									Nenhuma alteração do dia anterior foi registrada na última
									verificação.
								</p>
							) : (
								<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
									{logsMapa.map((log) => {
										const recolhido = log.resultado === "recolhido";
										return (
											<div
												key={log.id}
												className={`rounded-xl border p-4 ${
													recolhido
														? "border-emerald-100 bg-emerald-50/50"
														: "border-orange-100 bg-orange-50/60"
												}`}
											>
												<div className="flex items-start justify-between gap-3">
													<div className="min-w-0">
														<p className="truncate text-sm font-bold text-gray-900">
															{log.cliente_nome || "Cliente sem nome"}
														</p>
														<p className="text-xs text-gray-500">
															Código {log.codigo_cliente || "-"} •{" "}
															{formatData(log.data_agendamento)}
															{log.hora ? ` às ${log.hora}` : ""}
														</p>
													</div>
													<span
														className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
															recolhido
																? "bg-emerald-100 text-emerald-700"
																: "bg-orange-100 text-orange-700"
														}`}
													>
														{recolhido ? (
															<CheckCircle2 size={12} />
														) : (
															<PackageX size={12} />
														)}
														{log.status_novo}
													</span>
												</div>
												<p className="mt-3 text-xs text-gray-600">
													{log.motivo}
												</p>
												<p className="mt-2 text-[11px] font-semibold text-gray-400">
													{formatDateTime(log.criado_em)}
													{log.os_encontrada
														? ` • O.S. ${log.os_encontrada}`
														: ""}
												</p>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			<div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
				<div className="flex flex-wrap gap-2">
					{[
						{ key: "hoje", label: "Hoje" },
						{ key: "proximos", label: "Proximos" },
						{ key: "todos", label: "Todos" },
					].map((item) => (
						<button
							key={item.key}
							type="button"
							onClick={() => {
								setFiltroPeriodo(item.key);
								setPage(1);
							}}
							className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
								filtroPeriodo === item.key
									? "border-blue-600 bg-blue-600 text-white shadow-sm"
									: "border-gray-200 bg-white text-gray-500 hover:border-blue-300 hover:text-blue-600"
							}`}
						>
							{item.label}
						</button>
					))}
				</div>

				<div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
					<label className="relative block">
						<Search
							size={16}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
						/>
						<input
							value={busca}
							onChange={(event) => {
								setBusca(event.target.value);
								setPage(1);
							}}
							placeholder="Buscar por codigo, tecnico ou observacao"
							className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
						/>
					</label>

					<select
						value={filtroStatus}
						onChange={(event) => {
							setFiltroStatus(event.target.value);
							setPage(1);
						}}
						className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
					>
						<option value="todos">Todos os status</option>
						{AGENDAMENTO_STATUS.map((status) => (
							<option key={status} value={status}>
								{status}
							</option>
						))}
					</select>

					<select
						value={filtroTecnico}
						onChange={(event) => {
							setFiltroTecnico(event.target.value);
							setPage(1);
						}}
						className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
					>
						<option value="todos">Todos os tecnicos</option>
						{opcoesTecnico.map((tecnico) => (
							<option key={tecnico} value={tecnico}>
								{tecnico}
							</option>
						))}
					</select>
				</div>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					{error}
				</div>
			)}

			<AgendamentosCalendar
				agendamentos={agendamentos}
				mes={mesCalendario}
				onMesChange={setMesCalendario}
				canEdit={podeEditar}
				onEdit={setModal}
			/>

			{!listaFiltrada.length ? (
				<div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
					<CalendarClock size={32} className="mx-auto mb-3 text-gray-200" />
					<p className="text-sm text-gray-400">
						Nenhum agendamento encontrado.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{listaPaginada.map((agendamento) => (
						<div
							key={agendamento.id}
							className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
						>
							<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
								<div className="min-w-0 flex-1">
									<div className="mb-2 flex flex-wrap items-center gap-2">
										<h3 className="text-base font-bold text-gray-900">
											Codigo do Cliente: {agendamento.codigo_cliente}
										</h3>
										<button
											type="button"
											onClick={async () => {
												await navigator.clipboard?.writeText(
													agendamento.codigo_cliente || "",
												);
												setCopiadoId(agendamento.id);
												window.setTimeout(() => setCopiadoId(null), 1200);
											}}
											className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
											title="Copiar codigo do cliente"
										>
											<Copy size={14} />
										</button>
										<StatusBadge status={agendamento.status} />
										{copiadoId === agendamento.id && (
											<span className="text-[10px] font-semibold text-blue-600">
												Codigo copiado
											</span>
										)}
									</div>
									<div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
										<span className="flex items-center gap-1">
											<UserRound size={12} />
											{agendamento.tecnico_nome || "-"}
										</span>
										<span className="flex items-center gap-1">
											<CalendarClock size={12} />
											{formatData(agendamento.data)}
										</span>
										<span className="flex items-center gap-1">
											<Clock size={12} />
											{agendamento.hora || agendamento.turno}
										</span>
										<span className="flex items-center gap-1">
											<UserRound size={12} />
											{agendamento.cliente_nome ||
												`Cliente ${agendamento.codigo_cliente}`}
										</span>
										<span>{agendamento.cidade || "Cidade nao informada"}</span>
									</div>
									{agendamento.observacao && (
										<p className="mt-3 text-sm text-gray-500">
											{agendamento.observacao}
										</p>
									)}
								</div>

								{podeEditar && (
									<div className="flex shrink-0 flex-wrap items-center gap-2">
										{agendamento.origem === "esteira_backoffice" &&
											![
												"Entregue",
												"Concluido",
												"Nao recolhido",
												"Cancelado",
											].includes(agendamento.status) && (
												<button
													type="button"
													onClick={() =>
														setDesfecho({
															agendamento,
															tipo: "",
															motivo: "",
														})
													}
													className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100"
												>
													<PackageCheck size={15} /> Informar recolha
												</button>
											)}
										<select
											value={agendamento.status || "Aguardando dia"}
											onChange={(event) =>
												atualizar(agendamento.id, {
													...agendamento,
													status: event.target.value,
												})
											}
											className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
										>
											{AGENDAMENTO_STATUS.filter(
												(status) =>
													agendamento.origem !== "esteira_backoffice" ||
													!["Concluido", "Nao recolhido"].includes(status),
											).map((status) => (
												<option key={status} value={status}>
													{status}
												</option>
											))}
										</select>
										<button
											type="button"
											onClick={() => setModal(agendamento)}
											className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
											title="Editar"
										>
											<Pencil size={14} />
										</button>
										<button
											type="button"
											onClick={() => setConfirmar(agendamento)}
											className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
											title="Excluir"
										>
											<Trash2 size={14} />
										</button>
									</div>
								)}
							</div>
						</div>
					))}

					{listaFiltrada.length > 10 && (
						<div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
							<p className="text-sm text-gray-500">
								Mostrando {(safePage - 1) * 10 + 1}-
								{Math.min(safePage * 10, listaFiltrada.length)} de{" "}
								{listaFiltrada.length} agendamentos
							</p>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setPage((current) => Math.max(1, current - 1))}
									disabled={safePage === 1}
									className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
								>
									<ChevronLeft size={15} />
									Anterior
								</button>
								<span className="text-sm font-semibold text-gray-500">
									{safePage} / {totalPages}
								</span>
								<button
									type="button"
									onClick={() =>
										setPage((current) => Math.min(totalPages, current + 1))
									}
									disabled={safePage === totalPages}
									className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
								>
									Proxima
									<ChevronRight size={15} />
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			<section className="border border-gray-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 className="text-base font-bold text-gray-900">
							Recolhimentos por dia
						</h2>
						<p className="mt-1 text-xs text-gray-500">
							Consulte os agendamentos e registre o resultado da retirada.
						</p>
					</div>
					<label className="text-xs font-semibold text-gray-600">
						<span>Dia dos agendamentos</span>
						<input
							type="date"
							value={diaOperacao}
							onChange={(event) => setDiaOperacao(event.target.value)}
							className="mt-1 block rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
						/>
					</label>
				</div>

				<div className="mt-4 divide-y divide-gray-100">
					{!agendamentosDoDia.length ? (
						<p className="py-10 text-center text-sm text-gray-400">
							Nenhum agendamento neste dia.
						</p>
					) : (
						agendamentosDoDia.map((agendamento) => {
							const classified = [
								"Entregue",
								"Concluido",
								"Nao recolhido",
							].includes(agendamento.status);
							return (
								<div
									key={`operacao-${agendamento.id}`}
									className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<p className="text-sm font-bold text-gray-900">
												{agendamento.cliente_nome ||
													`Cliente ${agendamento.codigo_cliente}`}
											</p>
											<StatusBadge status={agendamento.status} />
										</div>
										<p className="mt-1 text-xs text-gray-500">
											Codigo {agendamento.codigo_cliente} /{" "}
											{agendamento.cidade || "Cidade nao informada"} /{" "}
											{agendamento.hora || agendamento.turno || "Sem horario"}
										</p>
										{agendamento.motivo_nao_recolhimento && (
											<p className="mt-2 text-xs font-medium text-orange-700">
												Motivo: {agendamento.motivo_nao_recolhimento}
											</p>
										)}
									</div>
									{podeEditar &&
										agendamento.origem === "esteira_backoffice" &&
										!classified &&
										agendamento.status !== "Cancelado" && (
											<button
												type="button"
												onClick={() =>
													setDesfecho({
														agendamento,
														tipo: "",
														motivo: "",
													})
												}
												className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white"
											>
												<PackageCheck size={16} /> Classificar recolhimento
											</button>
										)}
								</div>
							);
						})
					)}
				</div>
			</section>

			{modal !== null && (
				<AgendamentoModal
					agendamento={Object.keys(modal).length > 0 ? modal : null}
					tecnicos={tecnicos}
					onSalvar={handleSalvar}
					onClose={() => setModal(null)}
					onExcluir={(agendamento) => {
						setModal(null);
						setConfirmar(agendamento);
					}}
				/>
			)}

			{confirmar && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
					<div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
						<div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
							<Trash2 size={18} className="text-red-500" />
						</div>
						<h3 className="mb-1 text-center text-base font-bold text-gray-900">
							Excluir agendamento?
						</h3>
						<p className="mb-6 text-center text-sm text-gray-500">
							Codigo do Cliente:{" "}
							<span className="font-semibold text-gray-700">
								{confirmar.codigo_cliente}
							</span>{" "}
							será removido permanentemente.
						</p>
						<div className="flex gap-3">
							<button
								type="button"
								onClick={() => setConfirmar(null)}
								className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={async () => {
									await excluir(confirmar.id);
									setConfirmar(null);
								}}
								className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
							>
								Excluir
							</button>
						</div>
					</div>
				</div>
			)}

			{desfecho && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
					<div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
						<div className="border-b border-gray-100 p-5">
							<h2 className="text-base font-bold text-gray-900">
								Resultado da retirada
							</h2>
							<p className="mt-1 text-sm text-gray-500">
								Cliente {desfecho.agendamento.codigo_cliente}
								{desfecho.agendamento.cliente_nome
									? ` - ${desfecho.agendamento.cliente_nome}`
									: ""}
							</p>
						</div>
						<div className="space-y-4 p-5">
							<div className="grid grid-cols-2 gap-3">
								<button
									type="button"
									onClick={() =>
										setDesfecho((current) => ({ ...current, tipo: "retirado" }))
									}
									className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border text-sm font-bold ${
										desfecho.tipo === "retirado"
											? "border-green-500 bg-green-50 text-green-700"
											: "border-gray-200 text-gray-600 hover:bg-gray-50"
									}`}
								>
									<PackageCheck size={24} /> Equipamento retirado
								</button>
								<button
									type="button"
									onClick={() =>
										setDesfecho((current) => ({
											...current,
											tipo: "nao_recolhido",
										}))
									}
									className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border text-sm font-bold ${
										desfecho.tipo === "nao_recolhido"
											? "border-orange-500 bg-orange-50 text-orange-700"
											: "border-gray-200 text-gray-600 hover:bg-gray-50"
									}`}
								>
									<PackageX size={24} /> Nao recolhido
								</button>
							</div>

							{desfecho.tipo === "nao_recolhido" && (
								<label className="block text-xs font-semibold text-gray-600">
									<span>Motivo da nao recolha *</span>
									<textarea
										rows={3}
										value={desfecho.motivo}
										onChange={(event) =>
											setDesfecho((current) => ({
												...current,
												motivo: event.target.value,
											}))
										}
										placeholder="Descreva o motivo informado pelo tecnico ou cliente"
										className="mt-1.5 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:bg-white"
									/>
								</label>
							)}

							{desfechoErro && (
								<div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
									{desfechoErro}
								</div>
							)}
						</div>
						<div className="flex justify-end gap-2 border-t border-gray-100 p-4">
							<button
								type="button"
								disabled={savingDesfecho}
								onClick={() => setDesfecho(null)}
								className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								disabled={
									savingDesfecho ||
									!desfecho.tipo ||
									(desfecho.tipo === "nao_recolhido" && !desfecho.motivo.trim())
								}
								onClick={
									desfecho.tipo === "retirado"
										? handleRetirado
										: handleNaoRecolhido
								}
								className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
									desfecho.tipo === "nao_recolhido"
										? "bg-orange-600"
										: "bg-green-600"
								}`}
							>
								{savingDesfecho ? "Salvando..." : "Confirmar resultado"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default AgendamentosPage;
