import { brl } from "../../../utils/financeiroFormatters";

export default function BudgetWaterfallDetail({ insights, budgetAccountLabel }) {
	return (
		<div className="space-y-3">
			<div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
				<p className="text-xs font-black uppercase text-emerald-700">
					Orçamento do período
				</p>
				<p className="mt-1 text-xl font-black text-emerald-950">
					{brl.format(insights.plannedMonth)}
				</p>
			</div>
			{insights.accountSummary.map((item) => {
				const width = insights.plannedMonth
					? Math.min(100, Math.max(4, (item.realized / insights.plannedMonth) * 100))
					: 4;
				return (
					<div
						key={item.id}
						className="rounded-xl border border-slate-100 bg-slate-50 p-3"
					>
						<div className="flex items-center justify-between gap-3 text-xs font-black">
							<span className="text-slate-700">
								{budgetAccountLabel(item.account, item.id)}
							</span>
							<span className="text-red-600">- {brl.format(item.realized)}</span>
						</div>
						<div className="mt-2 h-2 rounded-full bg-white">
							<div className="h-full rounded-full bg-red-400" style={{ width: `${width}%` }} />
						</div>
					</div>
				);
			})}
			<div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
				<p className="text-xs font-black uppercase text-blue-700">
					Saldo após realizados
				</p>
				<p className="mt-1 text-xl font-black text-blue-950">
					{brl.format(insights.availableMonth)}
				</p>
			</div>
		</div>
	);
}
