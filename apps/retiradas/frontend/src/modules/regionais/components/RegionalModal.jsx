import { MapPin, Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { TIPOS_CIDADE } from "../hooks/useRegionais";
import PessoaFields from "./PessoaFields";

const emptyPessoa = () => ({ nome: "", telefone: "", email: "" });
const OPERATIONAL_AREAS = [
	{ value: "delivery", label: "Delivery" },
	{ value: "field_service", label: "Field Service" },
];

const emptyOperationalGroup = () => ({
	lider: emptyPessoa(),
	backoffices: [emptyPessoa()],
	supervisor: emptyPessoa(),
});

const normalizePessoa = (pessoa = {}) => ({
	nome: pessoa?.nome || "",
	telefone: pessoa?.telefone || "",
	email: pessoa?.email || "",
});

const hasNamedPessoa = (pessoa) => Boolean(pessoa?.nome);

const normalizePessoas = (pessoas = []) => pessoas.map(normalizePessoa);

const resolveBackoffices = (group = {}, fallbackRegional = {}) => {
	if (Array.isArray(group.backoffices) && group.backoffices.length) {
		return group.backoffices;
	}
	if (hasNamedPessoa(group.backoffice)) {
		return [group.backoffice];
	}
	if (
		Array.isArray(fallbackRegional.backoffices) &&
		fallbackRegional.backoffices.length
	) {
		return fallbackRegional.backoffices;
	}
	if (hasNamedPessoa(fallbackRegional.backoffice)) {
		return [fallbackRegional.backoffice];
	}
	return [emptyPessoa()];
};

const buildOperationalGroup = (group = {}, fallback = {}) => ({
	lider: normalizePessoa(group.lider || fallback.lider),
	backoffices: normalizePessoas(resolveBackoffices(group, fallback)),
	supervisor: normalizePessoa(group.supervisor || fallback.supervisor),
});

const buildOperationalGroups = (regional) => {
	const groups =
		regional?.gruposOperacionais || regional?.grupos_operacionais || {};
	return {
		delivery: buildOperationalGroup(groups.delivery, regional),
		field_service: buildOperationalGroup(groups.field_service),
	};
};

const buildInitialState = (regional) => {
	return {
		nome: regional?.nome || "",
		cidades: regional?.cidades?.length
			? regional.cidades
			: [{ nome: "", tipo: "Comum" }],
		supervisor: regional?.supervisor || emptyPessoa(),
		lider: regional?.lider || emptyPessoa(),
		gruposOperacionais: buildOperationalGroups(regional),
	};
};

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveSalvarButtonLabel(saving, editando) {
	if (saving) return "Salvando...";
	return editando ? "Salvar alteracoes" : "Cadastrar";
}

const RegionalModalContent = ({ regional, onSalvar, onClose }) => {
	const editando = !!regional;
	const initialState = buildInitialState(regional);

	const [nome, setNome] = useState(initialState.nome);
	const nomeInputId = useId();
	const [cidades, setCidades] = useState(initialState.cidades);
	const [supervisor] = useState(initialState.supervisor);
	const [lider] = useState(initialState.lider);
	const [gruposOperacionais, setGruposOperacionais] = useState(
		initialState.gruposOperacionais,
	);
	const [saving, setSaving] = useState(false);
	const [aba, setAba] = useState("info");

	const addCidade = () =>
		setCidades((c) => [...c, { nome: "", tipo: "Comum" }]);
	const removeCidade = (i) =>
		setCidades((c) => c.filter((_, idx) => idx !== i));
	const setCidadeField = (i, field, val) =>
		setCidades((c) =>
			c.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)),
		);

	const setGroupPessoa = (area, role, value) =>
		setGruposOperacionais((current) => ({
			...current,
			[area]: {
				...(current[area] || emptyOperationalGroup()),
				[role]: value,
			},
		}));

	const setGroupBackoffice = (area, index, value) =>
		setGruposOperacionais((current) => {
			const group = current[area] || emptyOperationalGroup();
			const backoffices =
				Array.isArray(group.backoffices) && group.backoffices.length
					? group.backoffices
					: [emptyPessoa()];
			return {
				...current,
				[area]: {
					...group,
					backoffices: backoffices.map((item, idx) =>
						idx === index ? value : item,
					),
				},
			};
		});

	const addGroupBackoffice = (area) =>
		setGruposOperacionais((current) => {
			const group = current[area] || emptyOperationalGroup();
			const backoffices =
				Array.isArray(group.backoffices) && group.backoffices.length
					? group.backoffices
					: [emptyPessoa()];
			return {
				...current,
				[area]: {
					...group,
					backoffices: [...backoffices, emptyPessoa()],
				},
			};
		});

	const removeGroupBackoffice = (area, index) =>
		setGruposOperacionais((current) => {
			const group = current[area] || emptyOperationalGroup();
			const backoffices =
				Array.isArray(group.backoffices) && group.backoffices.length
					? group.backoffices
					: [emptyPessoa()];
			return {
				...current,
				[area]: {
					...group,
					backoffices:
						backoffices.length > 1
							? backoffices.filter((_, idx) => idx !== index)
							: backoffices,
				},
			};
		});

	const handleSalvar = async () => {
		if (!nome.trim()) return;
		setSaving(true);
		const deliveryGroup =
			gruposOperacionais.delivery || emptyOperationalGroup();
		const deliveryBackoffices = (
			Array.isArray(deliveryGroup.backoffices) ? deliveryGroup.backoffices : []
		).filter((b) => b?.nome?.trim());
		await onSalvar({
			nome: nome.trim().toUpperCase(),
			cidades: cidades.filter((c) => c.nome.trim()),
			supervisor: deliveryGroup.supervisor?.nome
				? deliveryGroup.supervisor
				: supervisor,
			lider: deliveryGroup.lider?.nome ? deliveryGroup.lider : lider,
			backoffices: deliveryBackoffices,
			backoffice: deliveryBackoffices[0] || emptyPessoa(),
			gruposOperacionais,
		});
		setSaving(false);
		onClose();
	};

	const tabClass = (t) =>
		`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
			aba === t
				? "bg-blue-600 text-white shadow-sm"
				: "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
		}`;

	const cidadesValidas = cidades.filter((c) => c.nome.trim()).length;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 flex flex-col max-h-[92vh]">
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
							<MapPin size={16} className="text-blue-600" />
						</div>
						<h3 className="text-base font-bold text-gray-900">
							{editando ? "Editar Regional" : "Nova Regional"}
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

				<div className="flex gap-1 px-5 pt-4 bg-gray-50/50">
					<button className={tabClass("info")} onClick={() => setAba("info")}>
						type="button"
						Informacoes
					</button>
					<button
						type="button"
						className={tabClass("cidades")}
						onClick={() => setAba("cidades")}
					>
						Cidades
						<span
							className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${
								aba === "cidades" ? "bg-white/20" : "bg-gray-200 text-gray-500"
							}`}
						>
							{cidadesValidas}
						</span>
					</button>
					<button
						type="button"
						className={tabClass("equipe")}
						onClick={() => setAba("equipe")}
					>
						Equipe
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
					{aba === "info" && (
						<div>
							<label
								htmlFor={nomeInputId}
								className="block text-xs font-semibold text-gray-600 mb-1.5"
							>
								Nome da Regional *
							</label>
							<input
								id={nomeInputId}
								type="text"
								value={nome}
								onChange={(e) => setNome(e.target.value)}
								placeholder="Ex: CENTRAL MINEIRA"
								className="input-field"
							/>
						</div>
					)}

					{aba === "cidades" && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<p className="text-xs font-semibold text-gray-500">
									{cidadesValidas} cidade(s)
								</p>
								<button
									type="button"
									onClick={addCidade}
									className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
								>
									<Plus size={13} /> Adicionar cidade
								</button>
							</div>
							<div className="space-y-2 max-h-72 overflow-y-auto pr-1">
								{cidades.map((cidade, i) => (
									<div key={i} className="flex gap-2 items-center">
										<input
											type="text"
											value={cidade.nome}
											onChange={(e) =>
												setCidadeField(i, "nome", e.target.value.toUpperCase())
											}
											placeholder="Nome da cidade"
											className="input-field flex-1"
										/>
										<select
											value={cidade.tipo}
											onChange={(e) =>
												setCidadeField(i, "tipo", e.target.value)
											}
											className="input-field w-auto shrink-0 text-xs"
										>
											{TIPOS_CIDADE.map((t) => (
												<option key={t} value={t}>
													{t}
												</option>
											))}
										</select>
										<button
											type="button"
											onClick={() => removeCidade(i)}
											disabled={cidades.length === 1}
											className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors shrink-0"
										>
											<Trash2 size={14} />
										</button>
									</div>
								))}
							</div>
						</div>
					)}

					{aba === "equipe" && (
						<div className="space-y-5">
							<div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-800">
								Use os grupos abaixo para separar a regional. O grupo Delivery
								também alimenta os campos antigos usados em fluxos legados.
							</div>

							{OPERATIONAL_AREAS.map((area) => {
								const group =
									gruposOperacionais[area.value] || emptyOperationalGroup();
								return (
									<div
										key={area.value}
										className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-4"
									>
										<div>
											<p className="text-sm font-black text-gray-900">
												{area.label}
											</p>
											<p className="text-[11px] font-semibold text-gray-400">
												Líder, BackOffices e Supervisor deste grupo dentro da
												regional.
											</p>
										</div>
										<PessoaFields
											label="Líder"
											value={group.lider}
											onChange={(value) =>
												setGroupPessoa(area.value, "lider", value)
											}
										/>
										<div className="space-y-2">
											<div className="flex items-center justify-between gap-3">
												<p className="text-xs font-bold uppercase tracking-wider text-gray-500">
													BackOffices (
													{
														(group.backoffices || []).filter((b) =>
															b.nome?.trim(),
														).length
													}
													)
												</p>
												<button
													type="button"
													onClick={() => addGroupBackoffice(area.value)}
													className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
												>
													<Plus size={13} /> Adicionar
												</button>
											</div>
											{(Array.isArray(group.backoffices) &&
											group.backoffices.length
												? group.backoffices
												: [emptyPessoa()]
											).map((b, i) => (
												<div
													key={i}
													className="relative rounded-xl border border-gray-100 bg-white p-3"
												>
													{group.backoffices?.length > 1 ? (
														<button
															type="button"
															onClick={() =>
																removeGroupBackoffice(area.value, i)
															}
															className="absolute right-3 top-3 rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
															aria-label="Remover BackOffice"
														>
															<Trash2 size={13} />
														</button>
													) : null}
													<p className="mb-2 text-[11px] font-semibold text-gray-400">
														BackOffice {String(i + 1).padStart(2, "0")}
													</p>
													<input
														type="text"
														placeholder="Nome completo"
														value={b.nome || ""}
														onChange={(e) =>
															setGroupBackoffice(area.value, i, {
																...b,
																nome: e.target.value,
															})
														}
														className="input-field"
													/>
													<div className="mt-2 grid grid-cols-2 gap-2">
														<input
															type="text"
															placeholder="Telefone"
															value={b.telefone || ""}
															onChange={(e) =>
																setGroupBackoffice(area.value, i, {
																	...b,
																	telefone: e.target.value,
																})
															}
															className="input-field"
														/>
														<input
															type="email"
															placeholder="E-mail"
															value={b.email || ""}
															onChange={(e) =>
																setGroupBackoffice(area.value, i, {
																	...b,
																	email: e.target.value,
																})
															}
															className="input-field"
														/>
													</div>
												</div>
											))}
										</div>
										<PessoaFields
											label="Supervisor"
											value={group.supervisor}
											onChange={(value) =>
												setGroupPessoa(area.value, "supervisor", value)
											}
										/>
									</div>
								);
							})}
						</div>
					)}
				</div>

				<div className="flex gap-3 px-6 py-4 border-t border-gray-100">
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
						disabled={saving || !nome.trim()}
						className="flex-1 btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{resolveSalvarButtonLabel(saving, editando)}
					</button>
				</div>
			</div>
		</div>
	);
};

const RegionalModal = (props) => (
	<RegionalModalContent
		key={props.regional?.id ?? "nova-regional"}
		{...props}
	/>
);

export default RegionalModal;
