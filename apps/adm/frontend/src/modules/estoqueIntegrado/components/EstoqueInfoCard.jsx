export default function EstoqueInfoCard({
	icon: Icon,
	label,
	value,
	helper,
	tone = "slate",
}) {
	const tones = {
		slate: "border-slate-200 bg-white text-slate-800",
		green: "border-emerald-200 bg-emerald-50 text-emerald-900",
		blue: "border-blue-200 bg-blue-50 text-blue-900",
		orange: "border-orange-200 bg-orange-50 text-orange-900",
		red: "border-red-200 bg-red-50 text-red-900",
	};

	return (
		<div
			className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}
		>
			<div className="flex items-start gap-3">
				<span className="rounded-xl bg-white/80 p-2 shadow-sm">
					<Icon size={18} />
				</span>
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide opacity-70">
						{label}
					</p>
					<p className="mt-1 break-words text-base font-black">
						{value ?? "-"}
					</p>
					{helper ? (
						<p className="mt-1 text-xs font-semibold opacity-70">{helper}</p>
					) : null}
				</div>
			</div>
		</div>
	);
}
