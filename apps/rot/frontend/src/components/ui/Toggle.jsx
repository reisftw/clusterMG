export default function Toggle({ label, checked, onChange }) {
	return (
		<button type="button" onClick={() => onChange(!checked)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-black transition ${checked ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}>
			<span>{label}</span>
			<span className={`h-5 w-9 rounded-full p-0.5 transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}>
				<span className={`block h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-4" : ""}`} />
			</span>
		</button>
	);
}
