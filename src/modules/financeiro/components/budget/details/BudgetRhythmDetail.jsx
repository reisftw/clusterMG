import { Line } from "react-chartjs-2";
import FinancialKpiCard from "../../kpi/FinancialKpiCard";
import { brl } from "../../../utils/financeiroFormatters";

export default function BudgetRhythmDetail({ insights, lineOptions }) {
	return (
		<div className="space-y-4">
			<div className="h-[420px] rounded-2xl border border-slate-200 p-4">
				<Line
					data={{
						labels: ["Ideal hoje", "Realizado + comprometido"],
						datasets: [
							{
								label: "Consumo %",
								data: [insights.idealPercent, insights.usedPercent],
								borderColor: "#2563eb",
								backgroundColor: "rgba(37,99,235,.16)",
								fill: true,
								tension: 0.35,
							},
						],
					}}
					options={lineOptions()}
				/>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<FinancialKpiCard
					item={{
						title: "Ideal do período",
						value: insights.idealPercent,
						type: "percent",
						helper: insights.periodDisplayLabel,
						icon: "TrendingUp",
					}}
				/>
				<FinancialKpiCard
					item={{
						title: "Consumido",
						value: insights.usedPercent,
						type: "percent",
						helper: brl.format(insights.realizedMonth + insights.committedMonth),
						icon: "Wallet",
					}}
				/>
				<FinancialKpiCard
					item={{
						title: "Saldo",
						value: insights.availableMonth,
						type: "currency",
						helper:
							insights.availableMonth >= 0 ? "Dentro do orçamento" : "Estourado",
						icon: "CircleDollarSign",
					}}
				/>
			</div>
		</div>
	);
}
