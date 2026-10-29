import { CalendarClock, Link2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ROLES } from "../../../constants/roles";
import { listarVinculosTecnicosAdmin } from "../services/technicianBindingsService";

const EMPTY_OPTIONS = { metas: [], agendamentos: [], hubsoft: [] };

export default function TechnicianBindingFields({
	form,
	setForm,
	fieldClass,
	labelClass,
}) {
	const [options, setOptions] = useState(EMPTY_OPTIONS);
	const hubsoftSelectId = useId();
	const appointmentsListId = useId();

	useEffect(() => {
		let active = true;
		listarVinculosTecnicosAdmin({ includeOperationalNames: form.role === ROLES.TECNICO })
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

	const set = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));
	const selectedHubsoftId = String(form.hubsoftTecnicoId || "");
	const hasLegacyName = !selectedHubsoftId && Boolean(form.metasTecnicoNome);
	const handleHubsoftChange = (event) => {
		const id = event.target.value;
		const technician = options.hubsoft.find((item) => String(item.id) === id);
		setForm((current) => ({
			...current,
			hubsoftTecnicoId: id,
			metasTecnicoNome: technician?.name || "",
		}));
	};

	return (
		<section className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 sm:p-5">
			<div className="mb-4">
				<h3 className="text-sm font-black text-slate-950">Vínculo com o HubSoft</h3>
				<p className="mt-1 text-xs font-semibold text-slate-500">
					Associe esta conta do sistema ao cadastro correspondente no HubSoft. O
					vínculo é opcional e não altera o cargo nem as permissões do usuário.
				</p>
			</div>
			<div className={`grid gap-4 ${form.role === ROLES.TECNICO ? "lg:grid-cols-2" : ""}`}>
				<div>
					<label htmlFor={hubsoftSelectId} className={labelClass}>
						<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
							<Link2 size={16} />
						</span>
						Conta técnica no HubSoft
					</label>
					<select
						id={hubsoftSelectId}
						value={selectedHubsoftId}
						onChange={handleHubsoftChange}
						className={fieldClass}
					>
						<option value="">Selecione um técnico</option>
						{hasLegacyName ? (
							<option value="">Vínculo atual: {form.metasTecnicoNome}</option>
						) : null}
						{options.hubsoft.map((technician) => (
							<option key={technician.id} value={String(technician.id)}>
								{technician.displayName || technician.name}
							</option>
						))}
					</select>
					<p className="mt-2 text-xs font-semibold text-slate-500">
						{form.metasTecnicoNome
							? `Vinculado a ${form.metasTecnicoNome}.`
							: `${options.hubsoft.length} técnico(s) disponível(is) no HubSoft.`}
					</p>
				</div>
				{form.role === ROLES.TECNICO ? <div>
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
				</div> : null}
			</div>
		</section>
	);
}
