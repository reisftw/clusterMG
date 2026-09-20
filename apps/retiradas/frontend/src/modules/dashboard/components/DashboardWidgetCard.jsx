export default function DashboardWidgetCard({
	icon: Icon,
	iconClassName = "bg-blue-50 text-blue-600",
	title,
	subtitle,
	children,
}) {
	return (
		<div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
			<div className="mb-5 flex items-center gap-2">
				<div
					className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClassName}`}
				>
					<Icon size={16} />
				</div>
				<div>
					<p className="text-sm font-bold text-gray-900">{title}</p>
					{subtitle ? (
						<p className="text-xs text-gray-400">{subtitle}</p>
					) : null}
				</div>
			</div>
			{children}
		</div>
	);
}
