import { Package, X } from "lucide-react";
import { useId, useState } from "react";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";
import {
	STATUS_EQUIPAMENTO,
	TIPOS_EQUIPAMENTO,
} from "../hooks/useEquipamentos";

const buildInitialForm = (equipamento) => ({
	tipo: equipamento?.tipo || "",
	modelo: equipamento?.modelo || "",
	patrimonio: equipamento?.patrimonio || "",
	responsavel: equipamento?.responsavel || "",
	status: equipamento?.status || "EM USO",
	observacao: equipamento?.observacao || "",
});

const EquipamentoModalContent = ({ equipamento, onSalvar, onClose }) => {
	const { colaboradores } = useColaboradores();
	const ativos = colaboradores.filter(
		(c) => c.status === "Ativo" || c.status === "Em Experiencia",
	);
	const editando = !!equipamento;
	const [form, setForm] = useState(() => buildInitialForm(equipamento));
	const [saving, setSaving] = useState(false);
	const tipoInputId = useId();
	const statusInputId = useId();
	const modeloInputId = useId();
	const patrimonioInputId = useId();
	const responsavelInputId = useId();
	const observacaoInputId = useId();

	const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

	const handleSalvar = async () => {
		if (!form.tipo || !form.modelo) return;
		setSaving(true);
		await onSalvar(form);
		setSaving(false);
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
							<Package size={16} className="text-blue-600" />
						</div>
						<h3 className="text-base font-bold text-gray-900">
							{editando ? "Editar Equipamento" : "Novo Equipamento"}
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
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor={tipoInputId}
								className="block text-xs font-semibold text-gray-600 mb-1.5"
							>
								Tipo *
							</label>
							<select
								id={tipoInputId}
								value={form.tipo}
								onChange={(e) => set("tipo", e.target.value)}
								className="input-field"
							>
								<option value="">Selecione...</option>
								{TIPOS_EQUIPAMENTO.map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</select>
						</div>
						<div>
							<label
								htmlFor={statusInputId}
								className="block text-xs font-semibold text-gray-600 mb-1.5"
							>
								Status *
							</label>
							<select
								id={statusInputId}
								value={form.status}
								onChange={(e) => set("status", e.target.value)}
								className="input-field"
							>
								{STATUS_EQUIPAMENTO.map((s) => (
									<option key={s} value={s}>
										{s}
									</option>
								))}
							</select>
						</div>
					</div>

					<div>
						<label
							htmlFor={modeloInputId}
							className="block text-xs font-semibold text-gray-600 mb-1.5"
						>
							Modelo *
						</label>
						<input
							id={modeloInputId}
							type="text"
							value={form.modelo}
							onChange={(e) => set("modelo", e.target.value)}
							placeholder="Ex: Galaxy A54 5G"
							className="input-field"
						/>
					</div>

					<div>
						<label
							htmlFor={patrimonioInputId}
							className="block text-xs font-semibold text-gray-600 mb-1.5"
						>
							Patrimonio
						</label>
						<input
							id={patrimonioInputId}
							type="text"
							value={form.patrimonio}
							onChange={(e) => set("patrimonio", e.target.value)}
							placeholder="Ex: 201343"
							className="input-field"
						/>
					</div>

					<div>
						<label
							htmlFor={responsavelInputId}
							className="block text-xs font-semibold text-gray-600 mb-1.5"
						>
							Responsavel
						</label>
						<select
							id={responsavelInputId}
							value={form.responsavel}
							onChange={(e) => set("responsavel", e.target.value)}
							className="input-field"
						>
							<option value="">— Sem responsavel —</option>
							{ativos.map((c) => (
								<option key={c.id} value={c.nome}>
									{c.nome}
								</option>
							))}
						</select>
					</div>

					<div>
						<label
							htmlFor={observacaoInputId}
							className="block text-xs font-semibold text-gray-600 mb-1.5"
						>
							Observacao (opcional)
						</label>
						<textarea
							id={observacaoInputId}
							value={form.observacao}
							onChange={(e) => set("observacao", e.target.value)}
							rows={2}
							placeholder="Ex: Tela trincada, aguardando peca..."
							className="input-field resize-none"
						/>
					</div>
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
						disabled={saving || !form.tipo || !form.modelo}
						className="flex-1 btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
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

const EquipamentoModal = (props) => (
	<EquipamentoModalContent
		key={props.equipamento?.id ?? "novo-equipamento"}
		{...props}
	/>
);

export default EquipamentoModal;
