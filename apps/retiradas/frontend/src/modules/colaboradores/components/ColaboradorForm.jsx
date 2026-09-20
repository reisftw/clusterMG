import { UserPlus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";

const CARGOS = [
	"Tecnico I",
	"Tecnico II",
	"Tecnico III",
	"BackOffice I",
	"BackOffice II",
	"BackOffice III",
	"Lider Tecnico",
];

const STATUS_OPTIONS = ["Ativo", "Em Experiencia", "Desligado"];

const CAMPOS_INICIAIS = {
	nome: "",
	cargo: "",
	matricula: "",
	data_nascimento: "",
	endereco: "",
	data_contratacao: "",
	email: "",
	celular_pessoal: "",
	celular_corporativo: "",
	base_operacional: "",
	status: "Ativo",
	data_desligamento: "",
	motivo_desligamento: "",
};

const Field = ({
	label,
	name,
	value,
	onChange,
	type = "text",
	placeholder = "",
}) => {
	const inputId = useId();
	return (
		<div>
			<label
				htmlFor={inputId}
				className="block text-xs font-semibold text-gray-600 mb-1.5"
			>
				{label}
			</label>
			<input
				id={inputId}
				type={type}
				name={name}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				className="input-field"
			/>
		</div>
	);
};

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveSalvarButtonLabel(isSubmitting, inicial) {
	if (isSubmitting) return "Salvando...";
	return inicial ? "Salvar alteracoes" : "Cadastrar";
}

const ColaboradorForm = ({ onSubmit, onClose, inicial = null }) => {
	const [form, setForm] = useState(inicial ?? CAMPOS_INICIAIS);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [erro, setErro] = useState("");
	const cargoInputId = useId();
	const statusInputId = useId();
	const motivoInputId = useId();

	useEffect(() => {
		setForm(inicial ?? CAMPOS_INICIAIS);
	}, [inicial]);

	const handle = (event) => {
		const { name, value } = event.target;
		setForm((prev) => ({ ...prev, [name]: value }));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setErro("");

		if (form.status === "Desligado" && !form.data_desligamento) {
			setErro("Informe a data de desligamento.");
			return;
		}

		setIsSubmitting(true);

		try {
			const dados = { ...form };

			if (dados.status !== "Desligado") {
				dados.data_desligamento = "";
				dados.motivo_desligamento = "";
			}

			await onSubmit(dados);
			onClose();
		} catch {
			setErro("Erro ao salvar colaborador.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<ModalShell
			onClose={onClose}
			showClose={false}
			size="2xl"
			bodyClassName="p-0"
		>
			<div className="flex min-h-0 flex-col">
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
							<UserPlus size={16} className="text-blue-600" />
						</div>
						<h3 className="text-base font-bold text-gray-900">
							{inicial ? "Editar Colaborador" : "Novo Colaborador"}
						</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
					>
						<X size={18} />
					</button>
				</div>

				<form
					onSubmit={handleSubmit}
					className="flex-1 overflow-y-auto px-6 py-5"
				>
					<div className="space-y-5">
						<div>
							<p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
								Dados Basicos
							</p>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="sm:col-span-2">
									<Field
										label="Nome completo *"
										name="nome"
										value={form.nome}
										onChange={handle}
										placeholder="Nome do colaborador"
									/>
								</div>
								<div>
									<label
										htmlFor={cargoInputId}
										className="block text-xs font-semibold text-gray-600 mb-1.5"
									>
										Cargo *
									</label>
									<select
										id={cargoInputId}
										name="cargo"
										value={form.cargo}
										onChange={handle}
										className="input-field"
									>
										<option value="">Selecione...</option>
										{CARGOS.map((cargo) => (
											<option key={cargo} value={cargo}>
												{cargo}
											</option>
										))}
									</select>
								</div>
								<div>
									<label
										htmlFor={statusInputId}
										className="block text-xs font-semibold text-gray-600 mb-1.5"
									>
										Status
									</label>
									<select
										id={statusInputId}
										name="status"
										value={form.status}
										onChange={handle}
										className="input-field"
									>
										{STATUS_OPTIONS.map((status) => (
											<option key={status} value={status}>
												{status}
											</option>
										))}
									</select>
								</div>
								<Field
									label="Matricula"
									name="matricula"
									value={form.matricula}
									onChange={handle}
									placeholder="Ex: 001"
								/>
								<Field
									label="Base Operacional"
									name="base_operacional"
									value={form.base_operacional}
									onChange={handle}
									placeholder="Ex: BH"
								/>
							</div>
						</div>

						<div>
							<p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
								Datas
							</p>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<Field
									label="Data de Contratacao"
									name="data_contratacao"
									value={form.data_contratacao}
									onChange={handle}
									type="date"
								/>
								<Field
									label="Data de Nascimento"
									name="data_nascimento"
									value={form.data_nascimento}
									onChange={handle}
									type="date"
								/>
							</div>
						</div>

						<div>
							<p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
								Contato
							</p>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<Field
									label="E-mail"
									name="email"
									value={form.email}
									onChange={handle}
									type="email"
									placeholder="email@exemplo.com"
								/>
								<Field
									label="Celular Pessoal"
									name="celular_pessoal"
									value={form.celular_pessoal}
									onChange={handle}
									placeholder="(00) 00000-0000"
								/>
								<Field
									label="Celular Corporativo"
									name="celular_corporativo"
									value={form.celular_corporativo}
									onChange={handle}
									placeholder="(00) 00000-0000"
								/>
								<div className="sm:col-span-2">
									<Field
										label="Endereco"
										name="endereco"
										value={form.endereco}
										onChange={handle}
										placeholder="Rua, numero, bairro..."
									/>
								</div>
							</div>
						</div>

						{form.status === "Desligado" && (
							<div>
								<p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">
									Desligamento
								</p>
								<div className="bg-red-50 rounded-xl p-4 border border-red-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
									<Field
										label="Data de Desligamento *"
										name="data_desligamento"
										value={form.data_desligamento}
										onChange={handle}
										type="date"
									/>
									<div className="sm:col-span-2">
										<label
											htmlFor={motivoInputId}
											className="block text-xs font-semibold text-gray-600 mb-1.5"
										>
											Motivo
										</label>
										<textarea
											id={motivoInputId}
											name="motivo_desligamento"
											value={form.motivo_desligamento}
											onChange={handle}
											rows={2}
											placeholder="Motivo do desligamento..."
											className="input-field resize-none"
										/>
									</div>
								</div>
							</div>
						)}

						{erro && (
							<div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
								{erro}
							</div>
						)}
					</div>

					<div className="flex items-center justify-end gap-3 px-0 py-4 mt-6 border-t border-gray-100">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
						>
							Cancelar
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{resolveSalvarButtonLabel(isSubmitting, inicial)}
						</button>
					</div>
				</form>
			</div>
		</ModalShell>
	);
};

export default ColaboradorForm;
