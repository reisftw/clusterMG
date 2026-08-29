import { CalendarDays, X } from "lucide-react";
import { useState } from "react";

const FeriasLancamentoForm = ({ colaboradores, onSubmit, onClose }) => {
	const [colaboradorId, setColaboradorId] = useState("");
	const [dataInicio, setDataInicio] = useState("");
	const [dataFim, setDataFim] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [erro, setErro] = useState("");

	const calcularDias = () => {
		if (!dataInicio || !dataFim) return 0;
		const diff = new Date(dataFim) - new Date(dataInicio);
		return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setErro("");
		if (!colaboradorId) {
			setErro("Selecione um colaborador.");
			return;
		}
		if (new Date(dataFim) < new Date(dataInicio)) {
			setErro("Data de fim anterior ao inicio.");
			return;
		}

		setIsSubmitting(true);
		try {
			await onSubmit({
				colaborador_id: colaboradorId,
				data_inicio: dataInicio,
				data_fim: dataFim,
				dias_gozados: calcularDias(),
			});
			onClose();
		} catch {
			setErro("Erro ao lancar ferias.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const inputClass =
		"w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
						<CalendarDays size={20} /> Lancar Ferias
					</h2>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
					>
						<X size={20} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Colaborador
						</label>
						<select
							value={colaboradorId}
							onChange={(e) => setColaboradorId(e.target.value)}
							required
							className={inputClass}
						>
							<option value="">Selecione o colaborador...</option>
							{colaboradores.map((c) => (
								<option key={c.id} value={c.id}>
									{c.nome} — {c.cargo}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Data de Inicio
						</label>
						<input
							type="date"
							value={dataInicio}
							onChange={(e) => setDataInicio(e.target.value)}
							required
							className={inputClass}
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Data de Fim
						</label>
						<input
							type="date"
							value={dataFim}
							onChange={(e) => setDataFim(e.target.value)}
							required
							className={inputClass}
						/>
					</div>

					{dataInicio && dataFim && (
						<p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
							Total: {calcularDias()} dias
						</p>
					)}

					{erro && <p className="text-sm text-red-500">{erro}</p>}

					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
						>
							Cancelar
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-60"
						>
							{isSubmitting ? "Salvando..." : "Lancar"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default FeriasLancamentoForm;
