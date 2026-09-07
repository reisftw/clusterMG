import { Bar } from "react-chartjs-2";

export default function BudgetAccountsDetail({
	insights,
	fullAccountChart,
	barOptions,
	detailChartHeight,
}) {
	return (
		<div style={{ height: detailChartHeight(insights.accountSummary.length) }}>
			<Bar data={fullAccountChart} options={{ ...barOptions(), indexAxis: "y" }} />
		</div>
	);
}
