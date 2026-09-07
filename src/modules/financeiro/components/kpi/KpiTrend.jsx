import { decimal } from "../../utils/financeiroFormatters";
import { getKpiTrendClass } from "./financialKpiStyles";

function trendText(trend, label) {
	if (!trend) return "";
	const arrow = trend.direction === "up" ? "↑" : "↓";
	return `${arrow} ${decimal.format(Number(trend.percent || 0))}% ${label || ""}`.trim();
}

export default function KpiTrend({ item }) {
	if (item.hideTrend) return null;
	if (!item.trend) return null;

	return (
		<p
			className={`mt-3 inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${getKpiTrendClass(item.trend)}`}
		>
			{trendText(item.trend, item.trendLabel)}
		</p>
	);
}
