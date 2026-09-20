export default function KpiCard({
	label,
	value,
	sub,
	color = "orange",
	trendLabel = "vs mês anterior",
	trendValue = null,
	trendTone = "neutral",
}) {
	return (
		<div className={`kpi ${color}`}>
			<div className="kpi-label">
				<span>{label}</span>
				<span className="kpi-info" aria-hidden="true">
					i
				</span>
			</div>
			<div className="kpi-value">{value}</div>
			<div className="kpi-sub">{sub}</div>
			<div className="kpi-footer">
				<span>{trendLabel}</span>
				{trendValue ? (
					<strong className={`kpi-trend ${trendTone}`}>{trendValue}</strong>
				) : null}
			</div>
		</div>
	);
}
