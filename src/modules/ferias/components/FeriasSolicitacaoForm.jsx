import { CalendarDays, User, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

const isColaboradorAtivo = (colaborador) => {
	const status = String(colaborador?.status || "").toLowerCase();
	return (
		status === "ativo" ||
		status === "em experiencia" ||
		status === "em experiencia" ||
		status === "em_experiencia"
	);
};

const FeriasSolicitacaoForm = ({
	onSubmit,
	onClose,
	colaboradores = [],
	permitirEscolherColaborador = false,
	titulo = "Solicitar Ferias",
	textoAcao = "Solicitar",
}) => {
	const [colaboradorId, setColaboradorId] = useState("");
	const [dataInicio, setDataInicio] = useState("");
	const [dataFim, setDataFim] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [erro, setErro] = useState("");
	const colaboradorInputId = useId();
	const dataInicioInputId = useId();
	const dataFimInputId = useId();

	const colaboradoresAtivos = useMemo(
		() =>
			colaboradores
				.filter((item) => isColaboradorAtivo(item))
				.sort((a, b) =>
					String(a?.nome ?? "").localeCompare(String(b?.nome ?? "")),
				),
		[colaboradores],
	);

	const calcularDias = () => {
		if (!dataInicio || !dataFim) return 0;
		const diff = new Date(dataFim) - new Date(dataInicio);
		return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
	};

	const dias = calcularDias();

	const handleSubmit = async (event) => {
		event.preventDefault();
		setErro("");

		if (permitirEscolherColaborador && !colaboradorId) {
			setErro("Selecione um colaborador.");
			return;
		}

		if (!dataInicio || !dataFim) {
			setErro("Preencha as duas datas.");
			return;
		}

		if (new Date(dataFim) < new Date(dataInicio)) {
			setErro("A data de fim nao pode ser anterior a data de inicio.");
			return;
		}

		setIsSubmitting(true);
		try {
			await onSubmit({
				...(permitirEscolherColaborador
					? { colaborador_id: colaboradorId }
					: {}),
				data_inicio: dataInicio,
				data_fim: dataFim,
				dias_gozados: dias,
			});
			onClose();
		} catch {
			setErro(`Erro ao ${textoAcao.toLowerCase()}.`);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100">
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
							<CalendarDays size={16} className="text-orange-500" />
						</div>
						<h3 className="text-base font-bold text-gray-900">{titulo}</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
					>
						<X size={18} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
					{permitirEscolherColaborador && (
						<div>
							<label
								htmlFor={colaboradorInputId}
								className="block text-xs font-semibold text-gray-600 mb-1.5"
							>
								<span className="inline-flex items-center gap-1">
									<User size={12} /> Colaborador
								</span>
							</label>
							<select
								id={colaboradorInputId}
								value={colaboradorId}
								onChange={(event) => setColaboradorId(event.target.value)}
								className="input-field"
							>
								<option value="">Selecione...</option>
								{colaboradoresAtivos.map((colaborador) => (
									<option key={colaborador.id} value={colaborador.id}>
										{colaborador.nome} ({colaborador.cargo || "Sem cargo"})
									</option>
								))}
							</select>
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor={dataInicioInputId}
								className="block text-xs font-semibold text-gray-600 mb-1.5"
							>
								Data de Inicio
							</label>
							<input
								id={dataInicioInputId}
								type="date"
								value={dataInicio}
								onChange={(event) => setDataInicio(event.target.value)}
								className="input-field"
								required
							/>
						</div>
						<div>
							<label
								htmlFor={dataFimInputId}
								className="block text-xs font-semibold text-gray-600 mb-1.5"
							>
								Data de Fim
							</label>
							<input
								id={dataFimInputId}
								type="date"
								value={dataFim}
								min={dataInicio}
								onChange={(event) => setDataFim(event.target.value)}
								className="input-field"
								required
							/>
						</div>
					</div>

					{dias > 0 && (
						<div className="flex items-center justify-center gap-3 py-3 bg-orange-50 rounded-xl border border-orange-100">
							<CalendarDays size={18} className="text-orange-500" />
							<span className="text-sm font-bold text-orange-700">
								{dias} dia{dias !== 1 ? "s" : ""} de ferias
							</span>
						</div>
					)}

					{erro && (
						<div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
							{erro}
						</div>
					)}

					<div className="flex gap-3 pt-1">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
						>
							Cancelar
						</button>
						<button
							type="submit"
							disabled={isSubmitting || !dataInicio || !dataFim}
							className="flex-1 btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{isSubmitting ? "Enviando..." : textoAcao}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default FeriasSolicitacaoForm;
