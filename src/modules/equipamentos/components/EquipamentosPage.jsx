import { Package, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { TIPOS_EQUIPAMENTO, useEquipamentos } from "../hooks/useEquipamentos";
import EquipamentoModal from "./EquipamentoModal";

const STATUS_BADGE = {
	"EM USO": "bg-green-50 text-green-700 border-green-200",
	DISPONIVEL: "bg-blue-50 text-blue-700 border-blue-200",
	"EM MANUTENCAO": "bg-yellow-50 text-yellow-700 border-yellow-200",
	EXTRAVIADO: "bg-red-50 text-red-600 border-red-200",
	DESCARTADO: "bg-gray-100 text-gray-500 border-gray-200",
};

const EquipamentosPage = () => {
	const { currentUser } = useAuthContext();
	const { equipamentos, loading, carregar, criar, atualizar, excluir } =
		useEquipamentos();

	const [modal, setModal] = useState(null);
	const [busca, setBusca] = useState("");
	const [filtroTipo, setFiltroTipo] = useState("");
	const [filtroStatus, setFiltroStatus] = useState("");
	const [confirmarExcluir, setConfirmarExcluir] = useState(null);

	const podeEditar = hasPermission(currentUser?.role, "manage_equipamentos");

	const lista = useMemo(
		() =>
			equipamentos.filter((e) => {
				const q = busca.toLowerCase();
				const matchBusca =
					!busca ||
					e.modelo?.toLowerCase().includes(q) ||
					e.patrimonio?.toString().includes(q) ||
					e.responsavel?.toLowerCase().includes(q);
				const matchTipo = !filtroTipo || e.tipo === filtroTipo;
				const matchStatus = !filtroStatus || e.status === filtroStatus;
				return matchBusca && matchTipo && matchStatus;
			}),
		[equipamentos, busca, filtroTipo, filtroStatus],
	);

	const resumo = useMemo(() => {
		const r = { "EM USO": 0, DISPONIVEL: 0, "EM MANUTENCAO": 0, EXTRAVIADO: 0 };
		equipamentos.forEach((e) => {
			if (r[e.status] !== undefined) r[e.status]++;
		});
		return r;
	}, [equipamentos]);

	const handleSalvar = async (dados) => {
		if (dados.id) {
			const { id, ...rest } = dados;
			await atualizar(id, rest);
		} else {
			await criar(dados);
		}
	};

	const handleExcluir = async (id) => {
		await excluir(id);
		setConfirmarExcluir(null);
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			{/* Header */}
			<div className="flex items-center justify-between flex-wrap gap-3">
				<div className="flex items-center gap-2">
					<div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
						<Package size={18} className="text-blue-600" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-gray-900">Equipamentos</h2>
						<p className="text-xs text-gray-400">
							{equipamentos.length} equipamento(s) cadastrado(s)
						</p>
					</div>
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
							onClick={() => setModal("novo")}
							className="btn-primary flex items-center gap-2"
						>
							<Plus size={16} /> Novo Equipamento
						</button>
					)}
				</div>
			</div>

			{/* Cards resumo */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
				{[
					{
						label: "Em Uso",
						key: "EM USO",
						bg: "bg-green-50  border-green-100",
						text: "text-green-700",
					},
					{
						label: "Disponivel",
						key: "DISPONIVEL",
						bg: "bg-blue-50   border-blue-100",
						text: "text-blue-700",
					},
					{
						label: "Manutencao",
						key: "EM MANUTENCAO",
						bg: "bg-yellow-50 border-yellow-100",
						text: "text-yellow-700",
					},
					{
						label: "Extraviado",
						key: "EXTRAVIADO",
						bg: "bg-red-50    border-red-100",
						text: "text-red-600",
					},
				].map(({ label, key, bg, text }) => (
					<div key={key} className={`rounded-2xl border p-4 text-center ${bg}`}>
						<p className={`text-2xl font-extrabold ${text}`}>{resumo[key]}</p>
						<p className={`text-xs font-medium mt-0.5 ${text} opacity-80`}>
							{label}
						</p>
					</div>
				))}
			</div>

			{/* Filtros */}
			<div className="flex flex-wrap gap-3">
				<div className="relative flex-1 min-w-[200px]">
					<Search
						size={14}
						className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
					/>
					<input
						type="text"
						value={busca}
						onChange={(e) => setBusca(e.target.value)}
						placeholder="Buscar modelo, patrimonio ou responsavel..."
						className="input-field pl-9"
					/>
				</div>
				<select
					value={filtroTipo}
					onChange={(e) => setFiltroTipo(e.target.value)}
					className="input-field w-auto"
				>
					<option value="">Todos os tipos</option>
					{TIPOS_EQUIPAMENTO.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
				<select
					value={filtroStatus}
					onChange={(e) => setFiltroStatus(e.target.value)}
					className="input-field w-auto"
				>
					<option value="">Todos os status</option>
					<option value="EM USO">Em Uso</option>
					<option value="DISPONIVEL">Disponivel</option>
					<option value="EM MANUTENCAO">Em Manutencao</option>
					<option value="EXTRAVIADO">Extraviado</option>
					<option value="DESCARTADO">Descartado</option>
				</select>
			</div>

			{/* Tabela */}
			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-100 bg-gray-50">
								{[
									"Tipo",
									"Modelo",
									"Patrimonio",
									"Responsavel",
									"Status",
									"Observacao",
									...(podeEditar ? ["Acoes"] : []),
								].map((h) => (
									<th
										key={h}
										className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
									>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{lista.length === 0 ? (
								<tr>
									<td
										colSpan={podeEditar ? 7 : 6}
										className="px-5 py-12 text-center"
									>
										<Package size={28} className="text-gray-200 mx-auto mb-2" />
										<p className="text-sm text-gray-400">
											Nenhum equipamento encontrado.
										</p>
									</td>
								</tr>
							) : (
								lista.map((eq) => (
									<tr
										key={eq.id}
										className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
									>
										<td className="px-5 py-3">
											<span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg border border-gray-200">
												{eq.tipo}
											</span>
										</td>
										<td className="px-5 py-3 font-semibold text-gray-800">
											{eq.modelo}
										</td>
										<td className="px-5 py-3 font-mono text-xs text-gray-500">
											{eq.patrimonio || "—"}
										</td>
										<td className="px-5 py-3">
											{eq.responsavel ? (
												<div className="flex items-center gap-2">
													<div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
														<span className="text-white text-[9px] font-bold">
															{eq.responsavel.charAt(0).toUpperCase()}
														</span>
													</div>
													<span className="text-sm text-gray-700">
														{eq.responsavel}
													</span>
												</div>
											) : (
												<span className="text-gray-400 text-xs">—</span>
											)}
										</td>
										<td className="px-5 py-3">
											<span
												className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_BADGE[eq.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}
											>
												{eq.status}
											</span>
										</td>
										<td className="px-5 py-3 text-xs text-gray-400 italic max-w-[180px] truncate">
											{eq.observacao || "—"}
										</td>
										{podeEditar && (
											<td className="px-5 py-3">
												<div className="flex items-center gap-1">
													<button
														type="button"
														onClick={() => setModal(eq)}
														className="p-1.5 rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors"
													>
														<Pencil size={14} />
													</button>
													<button
														type="button"
														onClick={() => setConfirmarExcluir(eq)}
														className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
													>
														<Trash2 size={14} />
													</button>
												</div>
											</td>
										)}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				{lista.length > 0 && (
					<div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-400">
						{lista.length} resultado(s) de {equipamentos.length} total
					</div>
				)}
			</div>

			{/* Modal novo/editar */}
			{modal && (
				<EquipamentoModal
					equipamento={modal === "novo" ? null : modal}
					onSalvar={handleSalvar}
					onClose={() => setModal(null)}
				/>
			)}

			{/* Modal exclusao */}
			{confirmarExcluir && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
					<div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm">
						<div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
							<Trash2 size={18} className="text-red-500" />
						</div>
						<h3 className="text-base font-bold text-gray-900 text-center mb-1">
							Excluir equipamento?
						</h3>
						<p className="text-sm text-gray-500 text-center mb-6">
							<span className="font-semibold text-gray-700">
								{confirmarExcluir.modelo}
							</span>{" "}
							sera removido permanentemente.
						</p>
						<div className="flex gap-3">
							<button
								type="button"
								onClick={() => setConfirmarExcluir(null)}
								className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={() => handleExcluir(confirmarExcluir.id)}
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

export default EquipamentosPage;
