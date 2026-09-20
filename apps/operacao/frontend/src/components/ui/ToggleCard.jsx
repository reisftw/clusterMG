export default function ToggleCard({ icon, label, description, checked, onChange, hint }) {
	return (
		<div className={`rounded-2xl border p-4 transition ${checked ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"}`}>
			<button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-3 text-left">
				<div className="flex items-start gap-2.5">
					<span className="mt-0.5 text-base leading-none">{icon}</span>
					<div>
						<p className="text-sm font-black text-slate-900">{label}</p>
						<p className="text-xs font-semibold text-slate-500">{description}</p>
					</div>
				</div>
				<span className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}>
					<span className={`block h-5 w-5 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
				</span>
			</button>
			{checked && hint ? <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700">{hint}</p> : null}
		</div>
	);
}
