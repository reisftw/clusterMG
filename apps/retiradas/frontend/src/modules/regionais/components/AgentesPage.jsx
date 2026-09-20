import {
	ChevronDown,
	ChevronRight,
	Pencil,
	Plus,
	RefreshCw,
	Star,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { useAgentes } from "../hooks/useAgentes";
import { useRegionais } from "../hooks/useRegionais";
import AgenteModal from "./AgenteModal";
import ContactCard from "./ContactCard";

const AgentesPage = () => {
	const { currentUser } = useAuthContext();
	const { agentes, loading, carregar, criar, atualizar, excluir } =
		useAgentes();
	useRegionais();

	const [expandidos, setExpandidos] = useState({});
	const [modal, setModal] = useState(null);
	const [confirmarExcluir, setConfirmarExcluir] = useState(null);

	const podeEditar = hasPermission(currentUser?.role, "manage_agentes");
	const toggle = (id) => setExpandidos((p) => ({ ...p, [id]: !p[id] }));

	const porRegional = useMemo(() => {
		const mapa = {};
		agentes.forEach((a) => {
			const key = a.regional_nome || "Sem Regional";
			if (!mapa[key]) mapa[key] = [];
			mapa[key].push(a);
		});
		return mapa;
	}, [agentes]);

	const handleSalvar = async (dados) => {
		if (modal?.id) await atualizar(modal.id, dados);
		else await criar(dados);
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			{/* Header */}
			<div className="flex items-center justify-between flex-wrap gap-3">
				<div className="flex items-center gap-2">
					<div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
						<Star size={18} className="text-amber-500" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-gray-900">
							Agentes Autorizados
						</h2>
						<p className="text-xs text-gray-400">
							{agentes.length} cidade(s) com agente autorizado
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={carregar}
						className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-amber-50 hover:text-amber-500 hover:border-amber-200 transition-colors"
					>
						<RefreshCw size={16} />
					</button>
					{podeEditar && (
						<button
							type="button"
							onClick={() => setModal("novo")}
							className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors"
						>
							<Plus size={16} /> Novo Agente
						</button>
					)}
				</div>
			</div>

			{/* Grupos por regional */}
			<div className="space-y-2">
				{Object.entries(porRegional).map(([nomeRegional, lista]) => {
					const aberto = !!expandidos[nomeRegional];
					return (
						<div
							key={nomeRegional}
							className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
						>
							<div
								className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
								onClick={() => toggle(nomeRegional)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										toggle(nomeRegional);
									}
								}}
								role="button"
								tabIndex={0}
							>
								<div className="flex items-center gap-3 flex-wrap">
									<span className="text-gray-400">
										{aberto ? (
											<ChevronDown size={16} />
										) : (
											<ChevronRight size={16} />
										)}
									</span>
									<span className="font-bold text-gray-900 tracking-wide">
										{nomeRegional}
									</span>
									<span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-100">
										⭐ {lista.length} agente{lista.length > 1 ? "s" : ""}
									</span>
								</div>
							</div>

							{aberto && (
								<div className="border-t border-gray-100 p-5">
									<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
										{lista.map((agente) => (
											<div
												key={agente.id}
												className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3"
											>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<Star
															size={13}
															className="text-amber-500 shrink-0"
														/>
														<span className="font-bold text-sm text-gray-900">
															{agente.cidade}
														</span>
													</div>
													{podeEditar && (
														<div className="flex gap-1">
															<button
																type="button"
																onClick={() => setModal(agente)}
																className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-orange-500 transition-colors"
															>
																<Pencil size={13} />
															</button>
															<button
																type="button"
																onClick={() => setConfirmarExcluir(agente)}
																className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-red-500 transition-colors"
															>
																<Trash2 size={13} />
															</button>
														</div>
													)}
												</div>
												<ContactCard
													label="Responsavel"
													pessoa={agente.responsavel}
												/>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{agentes.length === 0 && (
				<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
					<Star size={28} className="text-amber-200 mx-auto mb-2" />
					<p className="text-sm text-gray-400">
						Nenhum agente autorizado cadastrado.
					</p>
				</div>
			)}

			{modal && (
				<AgenteModal
					agente={modal === "novo" ? null : modal}
					onSalvar={handleSalvar}
					onClose={() => setModal(null)}
				/>
			)}

			{confirmarExcluir && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
					<div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm">
						<div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
							<Trash2 size={18} className="text-red-500" />
						</div>
						<h3 className="text-base font-bold text-gray-900 text-center mb-1">
							Excluir agente?
						</h3>
						<p className="text-sm text-gray-500 text-center mb-6">
							Agente de{" "}
							<span className="font-semibold text-gray-700">
								{confirmarExcluir.cidade}
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
								onClick={async () => {
									await excluir(confirmarExcluir.id);
									setConfirmarExcluir(null);
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

export default AgentesPage;
