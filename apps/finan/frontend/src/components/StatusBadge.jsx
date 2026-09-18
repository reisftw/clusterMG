// StatusBadge — UX_AUDIT.md, Fase 2 (Quick Win): status financeiro
// (vencido/pago/pendente/estourado...) era comunicado só por cor em várias
// telas (ex.: FinanContasPagarPage.jsx antes desta correção), sem ícone nem
// texto redundante — daltônicos (~8% dos homens) não distinguem "vencida"
// de "pendente" só pela cor, e cada tela tinha uma paleta levemente
// diferente pro mesmo significado. Este componente padroniza o par
// ícone+cor+texto que `FinanOrcamentoCentrosCustoPage.jsx` já usava pros
// badges de centro de custo (estourado/na média/sem orçamento).
import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";

const TONES = {
	danger: { className: "bg-red-50 text-red-700", icon: AlertTriangle },
	success: { className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
	warning: { className: "bg-amber-50 text-amber-700", icon: AlertTriangle },
	neutral: { className: "bg-slate-100 text-slate-600", icon: Circle },
	canceled: { className: "bg-slate-100 text-slate-400", icon: XCircle },
};

export default function StatusBadge({ label, tone = "neutral", className = "" }) {
	const { className: toneClassName, icon: Icon } = TONES[tone] || TONES.neutral;
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${toneClassName} ${className}`}
		>
			<Icon size={12} />
			{label}
		</span>
	);
}
