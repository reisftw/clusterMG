// Sistema de toast único do Finan — UX_AUDIT.md, Top 10 #4 / Fase 3
// (Padronização): não havia NENHUMA lib de toast no projeto (confirmado
// via grep) — todo feedback de sucesso/erro era um <div> ad-hoc que cada
// tela posicionava onde quisesse, ou window.confirm() nativo pras
// confirmações (já corrigido na Fase 1 com ConfirmDialog.jsx). Isso cria
// um único provider + hook (useFinanToast) pra reposta transitória de
// ações ("Conta criada.", "Falha ao salvar.") — sem substituir banners de
// erro PERSISTENTES de carregamento de página (esses continuam como
// <div> fixo no topo da tela, porque representam um estado, não um evento
// pontual).
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { FinanToastContext } from "./finanToastContextObject";

const TONE_STYLES = {
	success: { icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
	error: { icon: AlertTriangle, className: "border-red-200 bg-red-50 text-red-800" },
	info: { icon: Info, className: "border-blue-200 bg-blue-50 text-blue-800" },
};

const DEFAULT_DURATION_MS = 5000;

export function FinanToastProvider({ children }) {
	const [toasts, setToasts] = useState([]);
	const idRef = useRef(0);

	const dismiss = useCallback((id) => {
		setToasts((current) => current.filter((toast) => toast.id !== id));
	}, []);

	const push = useCallback(
		(tone, message, { duration = DEFAULT_DURATION_MS } = {}) => {
			if (!message) return;
			idRef.current += 1;
			const id = idRef.current;
			setToasts((current) => [...current, { id, tone, message }]);
			if (duration) {
				window.setTimeout(() => dismiss(id), duration);
			}
		},
		[dismiss],
	);

	const value = useMemo(
		() => ({
			success: (message, options) => push("success", message, options),
			error: (message, options) => push("error", message, options),
			info: (message, options) => push("info", message, options),
			dismiss,
		}),
		[push, dismiss],
	);

	return (
		<FinanToastContext.Provider value={value}>
			{children}
			<div className="pointer-events-none fixed inset-x-0 bottom-4 z-layout-notification flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
				{toasts.map((toast) => {
					const { icon: Icon, className } = TONE_STYLES[toast.tone] || TONE_STYLES.info;
					return (
						<div
							key={toast.id}
							role={toast.tone === "error" ? "alert" : "status"}
							aria-live={toast.tone === "error" ? "assertive" : "polite"}
							className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${className}`}
						>
							<Icon size={18} className="mt-0.5 shrink-0" />
							<p className="flex-1 text-sm font-bold">{toast.message}</p>
							<button
								type="button"
								onClick={() => dismiss(toast.id)}
								aria-label="Fechar aviso"
								className="shrink-0 rounded-full p-1 hover:bg-black/5"
							>
								<X size={14} />
							</button>
						</div>
					);
				})}
			</div>
		</FinanToastContext.Provider>
	);
}
