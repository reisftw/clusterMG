import { AlertTriangle } from "lucide-react";

export default function Field({ label, children, className = "", required = false, hint = "", error = "" }) {
	return (
		<label className={`block ${className}`}>
			{label ? (
				<span className="mb-1.5 flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
					{label}{required ? <span className="text-red-500">*</span> : null}
				</span>
			) : null}
			{children}
			{hint && !error ? <span className="mt-1 block text-[11px] font-semibold text-slate-400">{hint}</span> : null}
			{error ? <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-600"><AlertTriangle size={11} /> {error}</span> : null}
		</label>
	);
}
