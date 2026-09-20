import { Star, X } from "lucide-react";
import { useId, useState } from "react";
import { useRegionais } from "../hooks/useRegionais";
import PessoaFields from "./PessoaFields";

const emptyPessoa = () => ({ nome: "", telefone: "", email: "" });

const buildInitialState = (agente) => ({
	cidade: agente?.cidade || "",
	regionalId: agente?.regional_id || "",
	responsavel: agente?.responsavel || emptyPessoa(),
});

const AgenteModalContent = ({ agente, onSalvar, onClose }) => {
	const editando = !!agente;
	const { regionais } = useRegionais();
	const initialState = buildInitialState(agente);

	const [cidade, setCidade] = useState(initialState.cidade);
	const [regional_id, setRegionalId] = useState(initialState.regionalId);
	const cidadeInputId = useId();
	const regionalInputId = useId();
	const [responsavel, setResponsavel] = useState(initialState.responsavel);
	const [saving, setSaving] = useState(false);

	const handleSalvar = async () => {
		if (!cidade.trim()) return;
		setSaving(true);
		const reg = regionais.find((r) => r.id === regional_id);
		await onSalvar({
			cidade: cidade.trim().toUpperCase(),
			regional_id,
			regional_nome: reg?.nome || "",
			responsavel,
		});
		setSaving(false);
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
							<Star size={16} className="text-amber-500" />
						</div>
						<h3 className="text-base font-bold text-gray-900">
							{editando ? "Editar Agente Aut." : "Novo Agente Autorizado"}
						</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
					>
						<X size={18} />
					</button>
				</div>

				<div className="px-6 py-5 space-y-4">
					<div>
						<label
							htmlFor={cidadeInputId}
							className="block text-xs font-semibold text-gray-600 mb-1.5"
						>
							Cidade *
						</label>
						<input
							id={cidadeInputId}
							type="text"
							value={cidade}
							onChange={(e) => setCidade(e.target.value.toUpperCase())}
							placeholder="Nome da cidade"
							className="input-field"
						/>
					</div>

					<div>
						<label
							htmlFor={regionalInputId}
							className="block text-xs font-semibold text-gray-600 mb-1.5"
						>
							Regional
						</label>
						<select
							id={regionalInputId}
							value={regional_id}
							onChange={(e) => setRegionalId(e.target.value)}
							className="input-field"
						>
							<option value="">— Selecione a regional —</option>
							{regionais.map((r) => (
								<option key={r.id} value={r.id}>
									{r.nome}
								</option>
							))}
						</select>
					</div>

					<PessoaFields
						label="Responsavel"
						value={responsavel}
						onChange={setResponsavel}
					/>
				</div>

				<div className="flex gap-3 px-6 pb-5">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={handleSalvar}
						disabled={saving || !cidade.trim()}
						className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 transition-colors"
					>
						{saving
							? "Salvando..."
							: editando
								? "Salvar alteracoes"
								: "Cadastrar"}
					</button>
				</div>
			</div>
		</div>
	);
};

const AgenteModal = (props) => (
	<AgenteModalContent key={props.agente?.id ?? "novo-agente"} {...props} />
);

export default AgenteModal;
