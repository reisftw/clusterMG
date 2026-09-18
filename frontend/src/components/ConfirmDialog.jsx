// Diálogo de confirmação padrão do Finan (UX_AUDIT.md, Fase 1 — Correções
// críticas: "confirmação real, não window.confirm, antes de marcar conta a
// pagar/receber como paga" e itens semelhantes). Usa o mesmo ModalShell.jsx
// que já resolve foco/ESC/aria-modal — não reimplementa nada disso.
//
// Diferente de window.confirm(), mostra um resumo do que vai acontecer
// (`items`) em vez de um texto genérico, e o botão de confirmação nomeia a
// consequência real da ação (ex.: "Marcar como paga", não "OK"/"Confirmar").
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import ModalShell from "./ModalShell";

const TONE_STYLES = {
	danger: { icon: AlertTriangle, iconWrap: "bg-red-50 text-red-600", button: "bg-red-600 hover:bg-red-700" },
	success: { icon: CheckCircle2, iconWrap: "bg-emerald-50 text-emerald-600", button: "bg-emerald-600 hover:bg-emerald-700" },
	default: { icon: Info, iconWrap: "bg-blue-50 text-blue-600", button: "bg-blue-600 hover:bg-blue-700" },
};

export default function ConfirmDialog({
	open,
	tone = "default",
	title,
	description,
	items = [],
	confirmLabel = "Confirmar",
	cancelLabel = "Cancelar",
	loading = false,
	error = "",
	onConfirm,
	onCancel,
}) {
	if (!open) return null;
	const { icon: ToneIcon, iconWrap, button } = TONE_STYLES[tone] || TONE_STYLES.default;

	return (
		<ModalShell
			open={open}
			onClose={loading ? undefined : onCancel}
			size="sm"
			title={title}
			description={description}
			icon={
				<span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconWrap}`}>
					<ToneIcon size={22} />
				</span>
			}
			footer={
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						disabled={loading}
						className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={loading}
						className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-black text-white shadow-sm disabled:opacity-60 ${button}`}
					>
						{loading ? "Aguarde..." : confirmLabel}
					</button>
				</div>
			}
		>
			{items.length ? (
				<dl className="space-y-2 rounded-xl bg-slate-50 p-3">
					{items.map((item) => (
						<div key={item.label} className="flex items-center justify-between gap-3 text-sm">
							<dt className="font-bold text-slate-500">{item.label}</dt>
							<dd className="truncate font-black text-slate-950">{item.value}</dd>
						</div>
					))}
				</dl>
			) : null}
			{error ? (
				<p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>
			) : null}
		</ModalShell>
	);
}
