import {
	Calendar,
	Clock,
	MapPin,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/useAuthContext";
import { useAgenda } from "../hooks/useAgenda";
import AgendaModal from "./AgendaModal";

const TIPO_COLORS = {
	Viagem: "bg-blue-50 text-blue-700 border-blue-200",
	Reuniao: "bg-purple-50 text-purple-700 border-purple-200",
	Reunião: "bg-purple-50 text-purple-700 border-purple-200",
	"Visita Tecnica": "bg-green-50 text-green-700 border-green-200",
	"Visita Técnica": "bg-green-50 text-green-700 border-green-200",
	Treinamento: "bg-amber-50 text-amber-700 border-amber-200",
	Outro: "bg-gray-100 text-gray-700 border-gray-200",
};

const TIPO_DOT = {
	Viagem: "bg-blue-500",
	Reuniao: "bg-purple-500",
	Reunião: "bg-purple-500",
	"Visita Tecnica": "bg-green-500",
	"Visita Técnica": "bg-green-500",
	Treinamento: "bg-amber-500",
	Outro: "bg-gray-400",
};

const parseLocal = (str) => {
	if (!str) return null;
	const [y, m, d] = str.split("-").map(Number);
	return new Date(y, m - 1, d);
};

const formatData = (str) => {
	const d = parseLocal(str);
	return d
		? d.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			})
		: "-";
};

const diffDias = (str) => {
	const d = parseLocal(str);
	if (!d) return null;
	const hoje = new Date();
	hoje.setHours(0, 0, 0, 0);
	return Math.ceil((d - hoje) / 86400000);
};

const StatusBadge = ({ dataInicio, dataFim }) => {
	const hoje = useMemo(() => {
		const data = new Date();
		data.setHours(0, 0, 0, 0);
		return data;
	}, []);
	const ini = parseLocal(dataInicio);
	const fim = parseLocal(dataFim || dataInicio);

	if (!ini) return null;

	if (hoje >= ini && hoje <= fim) {
		return (
			<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
				Em andamento
			</span>
		);
	}

	if (hoje > fim) {
		return (
			<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
				Concluido
			</span>
		);
	}

	const diff = diffDias(dataInicio);
	if (diff <= 7) {
		return (
			<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">
				Em {diff} dia{diff !== 1 ? "s" : ""}
			</span>
		);
	}

	return (
		<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
			{formatData(dataInicio)}
		</span>
	);
};

const AgendaPage = () => {
	const { currentUser } = useAuthContext();
	const { eventos, loading, carregar, criar, atualizar, excluir } = useAgenda();
	const [modal, setModal] = useState(null);
	const [filtro, setFiltro] = useState("proximos");
	const [confirmar, setConfirmar] = useState(null);
	const [busca, setBusca] = useState("");
	const [filtroTipo, setFiltroTipo] = useState("todos");
	const [filtroCidade, setFiltroCidade] = useState("todas");

	const podeEditar = hasPermission(currentUser?.role, "manage_agenda");
	const hoje = useMemo(() => {
		const data = new Date();
		data.setHours(0, 0, 0, 0);
		return data;
	}, []);

	const opcoesTipo = useMemo(
		() =>
			[...new Set(eventos.map((e) => e.tipo).filter(Boolean))].sort((a, b) =>
				a.localeCompare(b, "pt-BR"),
			),
		[eventos],
	);

	const opcoesCidade = useMemo(
		() =>
			[...new Set(eventos.map((e) => e.cidade).filter(Boolean))].sort((a, b) =>
				a.localeCompare(b, "pt-BR"),
			),
		[eventos],
	);

	const listaFiltrada = useMemo(() => {
		const termo = busca.trim().toLowerCase();

		return eventos.filter((e) => {
			const fim = parseLocal(e.data_fim || e.data_inicio);
			const periodoOk =
				filtro === "proximos"
					? fim >= hoje
					: filtro === "passados"
						? fim < hoje
						: true;
			const textoOk = !termo
				? true
				: `${e.atividade || ""} ${e.cidade || ""} ${e.descricao || ""}`
						.toLowerCase()
						.includes(termo);
			const tipoOk = filtroTipo === "todos" ? true : e.tipo === filtroTipo;
			const cidadeOk =
				filtroCidade === "todas" ? true : e.cidade === filtroCidade;

			return periodoOk && textoOk && tipoOk && cidadeOk;
		});
	}, [eventos, filtro, hoje, busca, filtroTipo, filtroCidade]);

	const handleSalvar = async (dados) => {
		if (modal?.id) await atualizar(modal.id, dados);
		else await criar(dados);
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm text-gray-400">
						{listaFiltrada.length} evento(s) exibido(s)
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={carregar}
						className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
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
							Novo Evento
						</button>
					)}
				</div>
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
				<div className="flex gap-2 flex-wrap">
					{[
						{ key: "proximos", label: "Proximos" },
						{ key: "todos", label: "Todos" },
						{ key: "passados", label: "Passados" },
					].map(({ key, label }) => (
						<button
							key={key}
							type="button"
							onClick={() => setFiltro(key)}
							className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
								filtro === key
									? "bg-blue-600 text-white border-blue-600 shadow-sm"
									: "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					<label className="relative block">
						<span className="sr-only">Buscar evento</span>
						<Search
							size={16}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
						/>
						<input
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder="Buscar por atividade, cidade ou descricao"
							className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
						/>
					</label>

					<select
						value={filtroTipo}
						onChange={(e) => setFiltroTipo(e.target.value)}
						className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
					>
						<option value="todos">Todos os tipos</option>
						{opcoesTipo.map((tipo) => (
							<option key={tipo} value={tipo}>
								{tipo}
							</option>
						))}
					</select>

					<select
						value={filtroCidade}
						onChange={(e) => setFiltroCidade(e.target.value)}
						className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
					>
						<option value="todas">Todas as cidades</option>
						{opcoesCidade.map((cidade) => (
							<option key={cidade} value={cidade}>
								{cidade}
							</option>
						))}
					</select>
				</div>
			</div>

			{!listaFiltrada.length ? (
				<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
					<Calendar size={32} className="text-gray-200 mx-auto mb-3" />
					<p className="text-gray-400 text-sm">Nenhum evento encontrado.</p>
				</div>
			) : (
				<div className="space-y-3">
					{listaFiltrada.map((evento) => (
						<div
							key={evento.id}
							className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="flex items-start gap-3 flex-1 min-w-0">
									<div
										className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
											TIPO_DOT[evento.tipo] ?? "bg-gray-400"
										}`}
									/>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 flex-wrap mb-1">
											<h3 className="text-sm font-bold text-gray-900">
												{evento.atividade}
											</h3>
											<span
												className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${
													TIPO_COLORS[evento.tipo] ?? TIPO_COLORS.Outro
												}`}
											>
												{evento.tipo}
											</span>
											<StatusBadge
												dataInicio={evento.data_inicio}
												dataFim={evento.data_fim}
											/>
										</div>

										<div className="flex items-center gap-4 flex-wrap">
											<span className="flex items-center gap-1 text-xs text-gray-400">
												<Clock size={11} />
												{formatData(evento.data_inicio)}
												{evento.data_fim &&
													evento.data_fim !== evento.data_inicio && (
														<>
															{" -> "}
															{formatData(evento.data_fim)}
														</>
													)}
											</span>
											{evento.cidade && (
												<span className="flex items-center gap-1 text-xs text-gray-400">
													<MapPin size={11} /> {evento.cidade}
												</span>
											)}
											{evento.participantes?.length > 0 && (
												<span className="flex items-center gap-1 text-xs text-gray-400">
													<Users size={11} /> {evento.participantes.length}{" "}
													pessoa(s)
												</span>
											)}
										</div>

										{evento.descricao && (
											<p className="text-xs text-gray-400 mt-2 line-clamp-2">
												{evento.descricao}
											</p>
										)}

										{evento.participantes?.length > 0 && (
											<div className="flex -space-x-1.5 mt-3">
												{evento.participantes.slice(0, 5).map((p) => (
													<div
														key={p.id}
														title={p.nome}
														className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white flex items-center justify-center"
													>
														<span className="text-white text-[9px] font-bold">
															{p.nome.charAt(0)}
														</span>
													</div>
												))}
												{evento.participantes.length > 5 && (
													<div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
														<span className="text-gray-500 text-[9px] font-bold">
															+{evento.participantes.length - 5}
														</span>
													</div>
												)}
											</div>
										)}
									</div>
								</div>

								{podeEditar && (
									<div className="flex items-center gap-1 shrink-0">
										<button
											type="button"
											onClick={() => setModal(evento)}
											className="p-2 rounded-xl text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
										>
											<Pencil size={14} />
										</button>
										<button
											type="button"
											onClick={() => setConfirmar(evento)}
											className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
										>
											<Trash2 size={14} />
										</button>
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			{modal !== null && (
				<AgendaModal
					evento={Object.keys(modal).length > 0 ? modal : null}
					onSalvar={handleSalvar}
					onClose={() => setModal(null)}
				/>
			)}

			{confirmar && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
					<div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm">
						<div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
							<Trash2 size={18} className="text-red-500" />
						</div>
						<h3 className="text-base font-bold text-gray-900 text-center mb-1">
							Excluir evento?
						</h3>
						<p className="text-sm text-gray-500 text-center mb-6">
							<span className="font-semibold text-gray-700">
								"{confirmar.atividade}"
							</span>{" "}
							será removido permanentemente.
						</p>
						<div className="flex gap-3">
							<button
								type="button"
								onClick={() => setConfirmar(null)}
								className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={async () => {
									await excluir(confirmar.id);
									setConfirmar(null);
								}}
								className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
							>
								Excluir
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default AgendaPage;
