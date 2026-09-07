import { Line } from "react-chartjs-2";

export default function BudgetForecastDetail({ forecastChart, barOptions }) {
	return (
		<div className="h-[520px]">
			<Line data={forecastChart} options={barOptions()} />
		</div>
	);
}
