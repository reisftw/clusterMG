import { Bar } from "react-chartjs-2";
import { brl } from "../../../utils/financeiroFormatters";

export default function BudgetCentersDetail({
	insights,
	fullCenterChart,
	barOptions,
	detailChartHeight,
}) {
	return (
		<div style={{ height: detailChartHeight(insights.centerSummary.length) }}>
			<Bar
				data={fullCenterChart}
				options={{
					...barOptions(),
					indexAxis: "y",
					scales: {
						x: {
							stacked: true,
							ticks: { callback: (value) => brl.format(Number(value)) },
						},
						y: { stacked: true, grid: { display: false } },
					},
				}}
			/>
		</div>
	);
}
