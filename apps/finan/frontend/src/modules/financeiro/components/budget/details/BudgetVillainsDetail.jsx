import { brl, decimal } from "../../../utils/financeiroFormatters";

function formatBudgetUsageLabel(percent = 0) {
	const safePercent = Number(percent || 0);
	if (safePercent > 100) {
		return `${decimal.format(safePercent - 100)}% acima`;
	}
	return `${decimal.format(safePercent)}% consumido`;
}

export default function BudgetVillainsDetail({
	fullPareto,
	budgetConsumptionStatus,
	budgetCenterCompactLabel,
	EmptyState,
}) {
	return (
		<div className="space-y-3">
			{fullPareto.map(({ center, deviation, percent }) => {
				const status = budgetConsumptionStatus(percent);
				return (
					<div key={center.id} className="rounded-2xl border border-slate-200 p-3">
						<div className="flex flex-wrap items-center justify-between gap-3 text-sm font-black">
							<span className="text-slate-800">
								{budgetCenterCompactLabel(center)}
							</span>
							<span className={status.textClass}>
								{formatBudgetUsageLabel(percent)} · {brl.format(Math.abs(deviation))}
							</span>
						</div>
						<div className="mt-2 h-3 rounded-full bg-slate-100">
							<div
								className={`h-full rounded-full ${status.barClass}`}
								style={{ width: `${Math.min(100, Math.max(4, percent))}%` }}
							/>
						</div>
					</div>
				);
			})}
			{!fullPareto.length ? (
				<EmptyState text="Nenhum centro analítico encontrado no período." />
			) : null}
		</div>
	);
}
