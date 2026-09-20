export function ActionBar({ children, className = "", align = "between" }) {
	const alignment = align === "end" ? "sm:justify-end" : "sm:justify-between";

	return (
		<div
			className={`flex flex-col gap-3 sm:flex-row sm:items-center ${alignment} ${className}`}
		>
			{children}
		</div>
	);
}

export default function PageHeader({
	eyebrow,
	title,
	description,
	icon,
	actions,
	className = "",
	contentClassName = "",
}) {
	return (
		<header
			className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className={`flex min-w-0 gap-3 ${contentClassName}`}>
					{icon ? <div className="shrink-0">{icon}</div> : null}
					<div className="min-w-0">
						{eyebrow ? (
							<p className="break-anywhere text-xs font-black uppercase tracking-[0.2em] text-blue-700">
								{eyebrow}
							</p>
						) : null}
						{title ? (
							<h1 className="break-anywhere text-2xl font-black text-slate-950">
								{title}
							</h1>
						) : null}
						{description ? (
							<p className="mt-1 break-anywhere text-sm leading-relaxed text-slate-500">
								{description}
							</p>
						) : null}
					</div>
				</div>
				{actions ? (
					<div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
				) : null}
			</div>
		</header>
	);
}
