import { MapPin, ShieldCheck } from "lucide-react";

const findBaseByNameOrId = (bases = [], value = "") =>
	bases.find(
		(item) =>
			String(item.nome || "").toLowerCase() ===
				String(value || "").toLowerCase() || item.id === value,
	);

export default function UserInsumosScopeFields({
	form,
	setForm,
	insumosConfig,
	fieldClass,
	labelClass,
	datalistId,
}) {
	const handleBaseChange = (value) => {
		const base = findBaseByNameOrId(insumosConfig.bases || [], value);
		setForm((current) => ({
			...current,
			insumosBaseId: base?.id || "",
			insumosBaseNome: base?.nome || value,
		}));
	};

	const toggleCategoria = (field, categoria) => {
		setForm((current) => {
			const values = current[field] || [];
			return {
				...current,
				[field]: values.includes(categoria)
					? values.filter((item) => item !== categoria)
					: [...values, categoria],
			};
		});
	};

	const categorias = insumosConfig.categorias || [];

	return (
		<div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
			<div className="grid gap-4 lg:grid-cols-2">
				<div>
					<label className={labelClass}>
						<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
							<MapPin size={18} />
						</span>
						<span>Base/Cidade de insumos</span>
					</label>
					<input
						list={datalistId}
						value={form.insumosBaseNome}
						onChange={(event) => handleBaseChange(event.target.value)}
						className={fieldClass}
						placeholder="Digite para selecionar a base"
					/>
					<datalist id={datalistId}>
						{(insumosConfig.bases || [])
							.filter((base) => base.ativo !== false)
							.map((base) => (
								<option key={base.id} value={base.nome} />
							))}
					</datalist>
					<p className="mt-2 text-xs text-slate-500">
						Usuários comuns ficam restritos ao estoque dessa base.
					</p>
				</div>
				<div>
					<p className={labelClass}>
						<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
							<ShieldCheck size={18} />
						</span>
						<span>Categorias de insumos</span>
					</p>
					<div className="max-h-36 overflow-y-auto rounded-xl border border-emerald-100 bg-white p-3">
						{categorias.map((categoria) => (
							<div
								key={categoria}
								className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 py-2 last:border-0"
							>
								<span className="text-xs font-bold text-slate-700">
									{categoria}
								</span>
								<div className="flex gap-2">
									<label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
										<input
											type="checkbox"
											checked={form.insumosCategoriasVer.includes(categoria)}
											onChange={() =>
												toggleCategoria("insumosCategoriasVer", categoria)
											}
										/>
										Ver
									</label>
									<label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
										<input
											type="checkbox"
											checked={form.insumosCategoriasSolicitar.includes(
												categoria,
											)}
											onChange={() =>
												toggleCategoria("insumosCategoriasSolicitar", categoria)
											}
										/>
										Solicitar
									</label>
								</div>
							</div>
						))}
						{categorias.length === 0 ? (
							<p className="text-xs font-semibold text-slate-400">
								Cadastre categorias em Administrativo → Insumos → Configurações.
							</p>
						) : null}
					</div>
					<p className="mt-2 text-xs text-slate-500">
						Se deixar vazio, o usuário segue a regra do perfil/grupo configurada
						em Insumos.
					</p>
				</div>
			</div>
		</div>
	);
}
