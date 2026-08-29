import {
	BookMarked,
	CalendarDays,
	Globe,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { useFeriados } from "../hooks/useFeriados";

const TIPO_BADGE = {
	manual: "bg-purple-50 text-purple-700 border-purple-200",
	estadual: "bg-blue-50   text-blue-700   border-blue-200",
	municipal: "bg-green-50  text-green-700  border-green-200",
	national: "bg-blue-50   text-blue-700   border-blue-200",
	optional: "bg-gray-100  text-gray-600   border-gray-200",
};

const TipoBadge = ({ tipo }) => (
	<span
		className={`text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${TIPO_BADGE[tipo] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}
	>
		{tipo}
	</span>
);

/* --- FeriadoForm ------------------------------------------- */
const FeriadoForm = ({ onSubmit, onClose }) => {
	const [form, setForm] = useState({
		nome: "",
		data: "",
		tipo: "manual",
		estado: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handle = (e) =>
		setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

	const handleSubmit = async (e) => {
		e.preventDefault();
		setIsSubmitting(true);
		try {
			await onSubmit(form);
			onClose();
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
							<CalendarDays size={16} className="text-blue-600" />
						</div>
						<h3 className="text-base font-bold text-gray-900">
							Cadastrar Feriado
						</h3>
					</div>
				</div>

				<form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
					<div>
						<label className="block text-xs font-semibold text-gray-600 mb-1.5">
							Nome
						</label>
						<input
							name="nome"
							value={form.nome}
							onChange={handle}
							required
							placeholder="Ex: Aniversario da cidade"
							className="input-field"
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className="block text-xs font-semibold text-gray-600 mb-1.5">
								Data
							</label>
							<input
								name="data"
								type="date"
								value={form.data}
								onChange={handle}
								required
								className="input-field"
							/>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-600 mb-1.5">
								Tipo
							</label>
							<select
								name="tipo"
								value={form.tipo}
								onChange={handle}
								className="input-field"
							>
								<option value="manual">Manual</option>
								<option value="estadual">Estadual</option>
								<option value="municipal">Municipal</option>
							</select>
						</div>
					</div>

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
							disabled={isSubmitting}
							className="flex-1 btn-primary disabled:opacity-50"
						>
							{isSubmitting ? "Salvando..." : "Salvar"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

/* --- FeriadosPage ------------------------------------------ */
const FeriadosPage = () => {
	const { currentUser } = useAuthContext();
	const {
		feriados,
		feriadosApi,
		loading,
		error,
		cadastrar,
		deletar,
		carregar,
	} = useFeriados();
	const [showForm, setShowForm] = useState(false);
	const [aba, setAba] = useState("nacionais");
	const [confirmarDel, setConfirmarDel] = useState(null);

	const podeGerenciar = hasPermission(currentUser?.role, "manage_feriados");

	const formatarData = (data) =>
		data
			? new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" })
			: "—";

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			{/* Header */}
			<div className="flex items-center justify-between flex-wrap gap-3">
				<div className="flex items-center gap-2">
					<div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
						<CalendarDays size={18} className="text-blue-600" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-gray-900">
							Feriados e Calendario
						</h2>
						<p className="text-xs text-gray-400">{new Date().getFullYear()}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={carregar}
						className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
					>
						<RefreshCw size={16} />
					</button>
					{podeGerenciar && (
						<button
							onClick={() => setShowForm(true)}
							className="btn-primary flex items-center gap-2"
						>
							<Plus size={16} /> Cadastrar
						</button>
					)}
				</div>
			</div>

			{/* Abas */}
			<div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 w-fit">
				{[
					{ key: "nacionais", label: "Nacionais", icon: Globe },
					{ key: "manuais", label: "Cadastrados", icon: BookMarked },
				].map(({ key, label, icon: Icon }) => (
					<button
						key={key}
						onClick={() => setAba(key)}
						className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
							aba === key
								? "bg-white text-gray-900 shadow-sm"
								: "text-gray-500 hover:text-gray-700"
						}`}
					>
						<Icon size={14} /> {label}
						<span
							className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded-md ${
								aba === key
									? "bg-blue-100 text-blue-700"
									: "bg-gray-200 text-gray-500"
							}`}
						>
							{key === "nacionais" ? feriadosApi.length : feriados.length}
						</span>
					</button>
				))}
			</div>

			{/* Erro */}
			{error && (
				<div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
					{error}
				</div>
			)}

			{/* Tabela */}
			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				{/* Nacionais */}
				{aba === "nacionais" &&
					(feriadosApi.length === 0 ? (
						<div className="py-12 text-center">
							<Globe size={28} className="text-gray-200 mx-auto mb-2" />
							<p className="text-sm text-gray-400">
								Nenhum feriado nacional encontrado.
							</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-gray-100 bg-gray-50">
										{["Data", "Nome", "Tipo"].map((h) => (
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
									{feriadosApi.map((f, i) => (
										<tr
											key={i}
											className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
										>
											<td className="px-5 py-3 text-sm font-medium text-gray-700">
												{formatarData(f.date)}
											</td>
											<td className="px-5 py-3 text-sm text-gray-800">
												{f.name}
											</td>
											<td className="px-5 py-3">
												<TipoBadge tipo={f.type} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					))}

				{/* Manuais */}
				{aba === "manuais" &&
					(feriados.length === 0 ? (
						<div className="py-12 text-center">
							<BookMarked size={28} className="text-gray-200 mx-auto mb-2" />
							<p className="text-sm text-gray-400">
								Nenhum feriado cadastrado manualmente.
							</p>
							{podeGerenciar && (
								<button
									onClick={() => setShowForm(true)}
									className="mt-4 btn-primary inline-flex items-center gap-2 text-sm"
								>
									<Plus size={14} /> Cadastrar feriado
								</button>
							)}
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-gray-100 bg-gray-50">
										{[
											"Data",
											"Nome",
											"Tipo",
											...(podeGerenciar ? ["Acoes"] : []),
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
									{feriados.map((f) => (
										<tr
											key={f.id}
											className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
										>
											<td className="px-5 py-3 text-sm font-medium text-gray-700">
												{formatarData(f.data)}
											</td>
											<td className="px-5 py-3 text-sm text-gray-800 font-semibold">
												{f.nome}
											</td>
											<td className="px-5 py-3">
												<TipoBadge tipo={f.tipo} />
											</td>
											{podeGerenciar && (
												<td className="px-5 py-3">
													<button
														onClick={() => setConfirmarDel(f)}
														className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
													>
														<Trash2 size={14} />
													</button>
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					))}
			</div>

			{/* Modal novo feriado */}
			{showForm && (
				<FeriadoForm onSubmit={cadastrar} onClose={() => setShowForm(false)} />
			)}

			{/* Modal exclusao */}
			{confirmarDel && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
					<div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm">
						<div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
							<Trash2 size={18} className="text-red-500" />
						</div>
						<h3 className="text-base font-bold text-gray-900 text-center mb-1">
							Excluir feriado?
						</h3>
						<p className="text-sm text-gray-500 text-center mb-6">
							<span className="font-semibold text-gray-700">
								{confirmarDel.nome}
							</span>{" "}
							({formatarData(confirmarDel.data)}) sera removido permanentemente.
						</p>
						<div className="flex gap-3">
							<button
								onClick={() => setConfirmarDel(null)}
								className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
							>
								Cancelar
							</button>
							<button
								onClick={async () => {
									await deletar(confirmarDel.id);
									setConfirmarDel(null);
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

export default FeriadosPage;
