import { Bar, Doughnut, Line } from "react-chartjs-2";
import { brl, integer } from "../../utils/financeiroFormatters";

function ChartCard({ title, children, empty }) {
	return (
		<section className="flex h-full min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2 className="text-sm font-bold text-slate-950">{title}</h2>
			</div>
			{empty ? (
				<div className="flex min-h-[250px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
					Nenhum dado encontrado para o período selecionado.
				</div>
			) : (
				<div className="min-h-[250px] flex-1">{children}</div>
			)}
		</section>
	);
}

function barOptions(formatter = brl.format) {
	return {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				labels: { boxWidth: 10, font: { weight: "bold" } },
			},
			tooltip: {
				callbacks: {
					label: (context) =>
						`${context.dataset.label}: ${formatter(Number(context.raw || 0))}`,
				},
			},
		},
		scales: {
			x: { grid: { display: false } },
			y: { ticks: { callback: (value) => formatter(Number(value)) } },
		},
	};
}

export default function TariffsDetailCharts({
	onSelectInvoiceMetric,
	viewModel,
}) {
	const isInvoices = viewModel.type === "faturas";
	return (
		<section className="grid gap-4 xl:grid-cols-2">
			<ChartCard
				title={`Evolução mensal ${viewModel.year}`}
				empty={viewModel.monthlyEmpty}
			>
				{viewModel.monthlyChartType === "bar" ? (
					<Bar
						data={viewModel.monthlyChart}
						options={barOptions((value) => integer.format(Number(value || 0)))}
					/>
				) : (
					<Line data={viewModel.monthlyChart} options={barOptions()} />
				)}
			</ChartCard>
			<ChartCard title={viewModel.rankingTitle} empty={!viewModel.doughnutRows.length}>
				<Doughnut
					data={viewModel.doughnutChart}
					options={{
						responsive: true,
						maintainAspectRatio: false,
						cutout: "58%",
						onClick: isInvoices ? onSelectInvoiceMetric : undefined,
						plugins: {
							centerText: viewModel.centerText,
							legend: {
								position: "bottom",
								labels: { boxWidth: 10, font: { weight: "bold" } },
							},
							tooltip: {
								callbacks: {
									label: (ctx) =>
										`${ctx.label}: ${isInvoices ? integer.format(Number(ctx.raw || 0)) : brl.format(Number(ctx.raw || 0))}`,
								},
							},
						},
					}}
				/>
			</ChartCard>
		</section>
	);
}
