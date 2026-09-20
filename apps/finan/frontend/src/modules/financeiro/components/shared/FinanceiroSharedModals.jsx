// Componentes extraídos de FinanceiroSharedHelpers.jsx (react-refresh/
// only-export-components não permite misturar componentes com helpers
// não-componente no mesmo arquivo). Comportamento idêntico ao que estava
// lá — só mudou de arquivo.
import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import ModalShell from "../../../../components/ModalShell";

export function FeedbackModal({ feedback, onClose }) {
	if (!feedback) return null;
	const isError = feedback.type === "error";
	return (
		<ModalShell
			title={feedback.title || (isError ? "Erro na operação" : "Aviso")}
			description={feedback.description}
			icon={isError ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
			onClose={onClose}
			size="lg"
			footer={
				<button
					type="button"
					onClick={onClose}
					className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
				>
					Entendi
				</button>
			}
		>
			<div
				className={`rounded-2xl border p-4 text-sm font-bold ${isError ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}
			>
				{feedback.message}
			</div>
			{feedback.details ? (
				<pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs font-semibold text-slate-100">
					{feedback.details}
				</pre>
			) : null}
		</ModalShell>
	);
}

export function BudgetDateRangeModal({ value, onClose, onApply }) {
	const today = new Date();
	const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
		.toISOString()
		.slice(0, 10);
	const currentDay = today.toISOString().slice(0, 10);
	const [form, setForm] = useState({
		startDate: value?.startDate || firstDay,
		endDate: value?.endDate || currentDay,
	});
	const [error, setError] = useState("");

	const updateField = (field, fieldValue) => {
		setError("");
		setForm((current) => ({ ...current, [field]: fieldValue }));
	};

	const submit = () => {
		if (!form.startDate || !form.endDate) {
			setError("Informe a data inicial e a data final.");
			return;
		}
		if (form.startDate > form.endDate) {
			setError("A data inicial não pode ser maior que a data final.");
			return;
		}
		onApply(form);
	};

	return (
		<ModalShell
			title="Selecionar datas"
			description="Filtre a gestão orçamentária por um intervalo específico."
			icon={<CalendarClock size={20} />}
			onClose={onClose}
			size="md"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={submit}
						className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
					>
						Aplicar
					</button>
				</div>
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Data inicial
					<input
						type="date"
						value={form.startDate}
						onChange={(event) => updateField("startDate", event.target.value)}
						className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					/>
				</label>
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Data final
					<input
						type="date"
						value={form.endDate}
						onChange={(event) => updateField("endDate", event.target.value)}
						className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					/>
				</label>
			</div>
			{error ? (
				<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}
		</ModalShell>
	);
}
