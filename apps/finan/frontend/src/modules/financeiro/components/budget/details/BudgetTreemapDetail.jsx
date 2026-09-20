import { brl, decimal } from "../../../utils/financeiroFormatters";

function formatBudgetUsageLabel(percent = 0) {
	const safePercent = Number(percent || 0);
	if (safePercent > 100) {
		return `${decimal.format(safePercent - 100)}% acima`;
	}
	return `${decimal.format(safePercent)}% consumido`;
}

export default function BudgetTreemapDetail({
	fullTreemapItems,
	budgetConsumptionStatus,
	budgetCenterCompactLabel,
	EmptyState,
}) {
	return (
		<div className="grid auto-rows-[minmax(88px,auto)] grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{fullTreemapItems.map((item) => {
				const status = budgetConsumptionStatus(item.percent);
				return (
					<div
						key={item.center.id}
						className={`rounded-2xl p-3 text-white shadow-sm ${item.percent > 100 ? "bg-red-500" : item.percent >= 80 ? "bg-amber-400" : "bg-emerald-500"}`}
					>
						<p className="text-xs font-black uppercase">
							{budgetCenterCompactLabel(item.center)}
						</p>
						<p className="mt-2 text-lg font-black">{brl.format(item.realized)}</p>
						<p className="text-xs font-black opacity-90">
							{formatBudgetUsageLabel(item.percent)} · {status.label}
						</p>
					</div>
				);
			})}
			{!fullTreemapItems.length ? (
				<EmptyState text="Nenhum centro analítico com movimentação no período." />
			) : null}
		</div>
	);
}
