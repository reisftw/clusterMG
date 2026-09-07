import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import Spinner from "../../../components/ui/Spinner";
import { useColaboradores } from "../hooks/useColaboradores";
import ColaboradorDetalheModal from "./ColaboradorDetalheModal";
import ColaboradorForm from "./ColaboradorForm";

const CARGO_COLOR = {
	"Tecnico I": "bg-blue-50 text-blue-700",
	"Tecnico II": "bg-blue-50 text-blue-700",
	"Tecnico III": "bg-blue-50 text-blue-700",
	"BackOffice I": "bg-purple-50 text-purple-700",
	"BackOffice II": "bg-purple-50 text-purple-700",
	"BackOffice III": "bg-purple-50 text-purple-700",
	"Lider Tecnico": "bg-orange-50 text-orange-700",
};

const STATUS_STYLES = {
	Ativo: "bg-green-100 text-green-700",
	"Em Experiencia": "bg-yellow-100 text-yellow-700",
	Desligado: "bg-red-100 text-red-600",
};

const FILTROS_STATUS = ["Todos", "Ativo", "Em Experiencia", "Desligado"];

const ColaboradoresPage = () => {
	const {
		colaboradores,
		loading,
		error,
		cadastrar,
		atualizar,
		deletar,
		carregar,
	} = useColaboradores();

	const [showForm, setShowForm] = useState(false);
	const [editando, setEditando] = useState(null);
	const [detalhe, setDetalhe] = useState(null);
	const [busca, setBusca] = useState("");
	const [filtroStatus, setFiltroStatus] = useState("Todos");
	const [confirmar, setConfirmar] = useState(null);

	const listaFiltrada = useMemo(
		() =>
			colaboradores
				.filter(
					(item) => filtroStatus === "Todos" || item.status === filtroStatus,
				)
				.filter(
					(item) =>
						item.nome?.toLowerCase().includes(busca.toLowerCase()) ||
						item.cargo?.toLowerCase().includes(busca.toLowerCase()) ||
						item.matricula?.toLowerCase().includes(busca.toLowerCase()),
				),
		[busca, colaboradores, filtroStatus],
	);

	const handleSubmit = async (dados) => {
		if (editando) await atualizar(editando.id, dados);
		else await cadastrar(dados);
		setEditando(null);
	};

	const handleEditar = (colaborador) => {
		setEditando(colaborador);
		setShowForm(true);
	};

	const formatarData = (data) =>
		data
			? new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" })
			: "—";

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<p className="text-sm text-gray-400">
					{colaboradores.length} colaborador(es) cadastrado(s)
				</p>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={carregar}
						className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
					>
						<RefreshCw size={16} />
					</button>
					<button
						type="button"
						onClick={() => {
							setEditando(null);
							setShowForm(true);
						}}
						className="btn-primary flex items-center gap-2"
					>
						<Plus size={16} />
						Novo Colaborador
					</button>
				</div>
			</div>

			{error && (
				<div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
					{error}
				</div>
			)}

			<div className="flex flex-col sm:flex-row gap-3">
				<div className="relative flex-1">
					<Search
						size={14}
						className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
					/>
					<input
						type="text"
						placeholder="Buscar por nome, cargo ou matricula..."
						value={busca}
						onChange={(event) => setBusca(event.target.value)}
						className="input-field pl-9"
					/>
				</div>
				<div className="flex gap-2 flex-wrap">
					{FILTROS_STATUS.map((filtro) => (
						<button
							type="button"
							key={filtro}
							onClick={() => setFiltroStatus(filtro)}
							className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
								filtroStatus === filtro
									? "bg-blue-600 text-white border-blue-600 shadow-sm"
									: "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
							}`}
						>
							{filtro}
						</button>
					))}
				</div>
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="min-w-[860px] w-full text-sm">
						<thead>
							<tr className="border-b border-gray-100 bg-gray-50">
								{[
									"Nome",
									"Cargo",
									"Matricula",
									"Base",
									"Status",
									"Contratacao",
									"Acoes",
								].map((header) => (
									<th
										key={header}
										className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
									>
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{listaFiltrada.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className="px-5 py-10 text-center text-sm text-gray-400"
									>
										Nenhum colaborador encontrado.
									</td>
								</tr>
							) : (
								listaFiltrada.map((colaborador) => (
									<tr
										key={colaborador.id}
										className="border-b border-gray-50 last:border-0 hover:bg-blue-50/40 transition-colors cursor-pointer"
										onClick={() => setDetalhe(colaborador)}
									>
										<td className="px-5 py-3">
											<div className="flex items-center gap-2">
												<div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
													<span className="text-white text-[10px] font-bold">
														{colaborador.nome?.charAt(0)?.toUpperCase()}
													</span>
												</div>
												<span className="font-medium text-gray-800">
													{colaborador.nome}
												</span>
											</div>
										</td>
										<td className="px-5 py-3">
											<span
												className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${
													CARGO_COLOR[colaborador.cargo] ??
													"bg-gray-100 text-gray-600"
												}`}
											>
												{colaborador.cargo}
											</span>
										</td>
										<td className="px-5 py-3 text-gray-500 text-xs">
											{colaborador.matricula}
										</td>
										<td className="px-5 py-3 text-gray-500 text-xs">
											{colaborador.base_operacional || "—"}
										</td>
										<td className="px-5 py-3">
											<span
												className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
													STATUS_STYLES[colaborador.status ?? "Ativo"]
												}`}
											>
												{colaborador.status ?? "Ativo"}
											</span>
										</td>
										<td className="px-5 py-3 text-gray-500 text-xs">
											{formatarData(colaborador.data_contratacao)}
										</td>
										<td
											className="px-5 py-3"
											onClick={(event) => event.stopPropagation()}
										>
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={() => handleEditar(colaborador)}
													className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-orange-50 hover:text-orange-500"
												>
													<Pencil size={14} />
												</button>
												<button
													type="button"
													onClick={() => setConfirmar(colaborador)}
													className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
												>
													<Trash2 size={14} />
												</button>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{showForm && (
				<ColaboradorForm
					onSubmit={handleSubmit}
					onClose={() => {
						setShowForm(false);
						setEditando(null);
					}}
					inicial={editando}
				/>
			)}

			{detalhe && (
				<ColaboradorDetalheModal
					colaborador={detalhe}
					onClose={() => setDetalhe(null)}
					onEditar={() => {
						handleEditar(detalhe);
						setDetalhe(null);
					}}
				/>
			)}

			{confirmar && (
				<ModalShell
					onClose={() => setConfirmar(null)}
					showClose={false}
					size="sm"
					bodyClassName="p-0"
				>
					<div className="p-6">
						<div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
							<Trash2 size={18} className="text-red-500" />
						</div>
						<h3 className="text-base font-bold text-gray-900 text-center mb-1">
							Excluir colaborador?
						</h3>
						<p className="text-sm text-gray-500 text-center mb-6">
							<span className="font-semibold text-gray-700">
								"{confirmar.nome}"
							</span>{" "}
							sera removido permanentemente.
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
									await deletar(confirmar.id);
									setConfirmar(null);
								}}
								className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
							>
								Excluir
							</button>
						</div>
					</div>
				</ModalShell>
			)}
		</div>
	);
};

export default ColaboradoresPage;
