import { getKpiColorVariant } from "./financialKpiStyles";
import KpiIcon from "./KpiIcon";
import KpiTrend from "./KpiTrend";
import KpiValue from "./KpiValue";

export default function FinancialKpiCard({
	item,
	loading,
	index,
	compact = false,
	centered = false,
}) {
	const colorVariant = getKpiColorVariant(item);

	return (
		<article
			className={`group relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 ${compact ? "min-h-[104px] p-3" : "min-h-[132px] p-4"} ${centered ? "flex items-center" : ""} ${colorVariant.hover}`}
		>
			<div
				className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${colorVariant.stripe}`}
			/>
			<div
				className={`w-full flex gap-3 ${centered ? "items-center justify-center text-center" : "items-start"}`}
			>
				<KpiIcon name={item.icon} compact={compact} colorVariant={colorVariant} />
				<div className={`min-w-0 flex-1 ${centered ? "flex flex-col items-center" : ""}`}>
					<p
						className={`break-words font-bold leading-tight text-slate-950 ${compact ? "text-[11px]" : "text-[12px]"}`}
					>
						{typeof index === "number" ? `${index + 1}. ` : ""}
						{item.title}
					</p>
					<KpiValue item={item} loading={loading} compact={compact} />
					<KpiTrend item={item} />
					{item.helper ? (
						<p className="mt-1 break-words text-xs font-bold text-slate-500">
							{item.helper}
						</p>
					) : null}
				</div>
			</div>
		</article>
	);
}
