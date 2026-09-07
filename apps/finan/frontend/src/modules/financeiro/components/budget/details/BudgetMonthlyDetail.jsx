import { Bar } from "react-chartjs-2";

export default function BudgetMonthlyDetail({ monthlyChart, barOptions }) {
	return (
		<div className="h-[520px]">
			<Bar data={monthlyChart} options={barOptions()} />
		</div>
	);
}
