import { CalendarClock, Target } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ROLES } from "../../../constants/roles";
import { listarVinculosTecnicosAdmin } from "../services/technicianBindingsService";

const EMPTY_OPTIONS = { metas: [], agendamentos: [] };

export default function TechnicianBindingFields({
	form,
	setForm,
	fieldClass,
	labelClass,
}) {
	const [options, setOptions] = useState(EMPTY_OPTIONS);
	const metasListId = useId();
	const appointmentsListId = useId();

	useEffect(() => {
		if (form.role !== ROLES.TECNICO) return undefined;
		let active = true;
		listarVinculosTecnicosAdmin()
			.then((result) => {
				if (active) setOptions(result || EMPTY_OPTIONS);
			})
			.catch(() => {
				if (active) setOptions(EMPTY_OPTIONS);
			});
		return () => {
			active = false;
		};
	}, [form.role]);

	if (form.role !== ROLES.TECNICO) return null;

	const set = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));

	return (
		<section className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 sm:p-5">
			<div className="mb-4">
				<h3 className="text-sm font-black text-slate-950">Vínculos do técnico</h3>
				<p className="mt-1 text-xs font-semibold text-slate-500">
					Escolha os nomes exatamente como aparecem em cada origem. Esses vínculos
					filtram somente a dashboard deste usuário.
				</p>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<div>
					<label htmlFor={`${metasListId}-input`} className={labelClass}>
						<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
							<Target size={16} />
						</span>
						Nome no Metas
					</label>
					<input
						id={`${metasListId}-input`}
						list={metasListId}
						value={form.metasTecnicoNome || ""}
						onChange={(event) => set("metasTecnicoNome", event.target.value)}
						className={fieldClass}
						placeholder="Selecione ou digite o nome"
					/>
					<datalist id={metasListId}>
						{options.metas.map((name) => (
							<option key={name} value={name} />
						))}
					</datalist>
				</div>
				<div>
					<label htmlFor={`${appointmentsListId}-input`} className={labelClass}>
						<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
							<CalendarClock size={16} />
						</span>
						Nome nos Agendamentos
					</label>
					<input
						id={`${appointmentsListId}-input`}
						list={appointmentsListId}
						value={form.agendamentosTecnicoNome || ""}
						onChange={(event) =>
							set("agendamentosTecnicoNome", event.target.value)
						}
						className={fieldClass}
						placeholder="Selecione ou digite o nome"
					/>
					<datalist id={appointmentsListId}>
						{options.agendamentos.map((name) => (
							<option key={name} value={name} />
						))}
					</datalist>
				</div>
			</div>
		</section>
	);
}
