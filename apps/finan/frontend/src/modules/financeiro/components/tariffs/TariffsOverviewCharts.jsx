import { Doughnut, Line } from "react-chartjs-2";
import { brl, integer } from "../../utils/financeiroFormatters";
import { formatTariffFee } from "../../utils/tariffsViewModels";

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

function BankBadge({ item = {} }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-white shadow-sm"
				style={{ backgroundColor: item.bankColor || "#0f766e" }}
			>
				{item.bankInitials || String(item.label || item.bank || "?").slice(0, 2)}
			</span>
			<span className="truncate">{item.label || item.bank || item.method || "-"}</span>
		</span>
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

export default function TariffsOverviewCharts({
	insights,
	monthlyTariffsChart,
	paymentChart,
}) {
	const paymentTotal = insights.pagamentoValor
		.slice(0, 6)
		.reduce((sum, item) => sum + Number(item.value || 0), 0);
	return (
		<>
			<section className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					title="Tarifas de boletos por banco/forma de cobrança"
					empty={!insights.tarifasBoletos.length}
				>
					<div className="grid max-h-[320px] gap-2 overflow-auto pr-1">
						{insights.tarifasBoletos.map((item) => (
							<div
								key={item.id || item.bank}
								className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm md:grid-cols-[1fr_auto_1fr] md:items-center"
							>
								<BankBadge item={item} />
								<span className="rounded-full bg-white px-3 py-1 text-center font-black text-slate-950 shadow-sm">
									{formatTariffFee(item)}
								</span>
								<span className="text-xs font-black uppercase tracking-normal text-slate-500 md:text-right">
									{item.paymentTypes || "-"}
								</span>
							</div>
						))}
					</div>
				</ChartCard>
				<ChartCard title="Tarifas mensais" empty={!insights.tarifasPorMes.length}>
					<Line data={monthlyTariffsChart} options={barOptions()} />
				</ChartCard>
				<ChartCard
					title="Formas de pagamento por valor"
					empty={!insights.pagamentoValor.length}
				>
					<Doughnut
						data={paymentChart}
						options={{
							responsive: true,
							maintainAspectRatio: false,
							cutout: "62%",
							plugins: {
								centerText: {
									title: "Total",
									value: brl.format(paymentTotal),
								},
								legend: {
									position: "bottom",
									labels: { boxWidth: 10, font: { weight: "bold" } },
								},
								tooltip: {
									callbacks: {
										label: (ctx) =>
											`${ctx.label}: ${brl.format(Number(ctx.raw || 0))}`,
									},
								},
							},
						}}
					/>
				</ChartCard>
				<ChartCard
					title="Clientes por forma de cobrança"
					empty={!insights.cobrancaClientes.length}
				>
					<div className="space-y-3 overflow-auto pr-1">
						{insights.cobrancaClientes.slice(0, 8).map((item) => (
							<div
								key={item.label}
								className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
							>
								<BankBadge item={item} />
								<span className="shrink-0 text-right">
									<span className="block font-black text-slate-950">
										{integer.format(item.customers || item.value)}
									</span>
									<span className="block text-xs font-black text-emerald-700">
										{brl.format(Number(item.estimatedValue || 0))}
									</span>
								</span>
							</div>
						))}
					</div>
				</ChartCard>
			</section>
			<section className="grid gap-4 xl:grid-cols-2">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h3 className="text-lg font-black text-slate-950">
						Bancos com maior tarifa
					</h3>
					<div className="mt-4 space-y-2">
						{insights.bancos.slice(0, 10).map((item) => (
							<div
								key={item.label}
								className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
							>
								<BankBadge item={item} />
								<span className="font-black text-slate-950">
									{brl.format(item.value)}
								</span>
							</div>
						))}
					</div>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h3 className="text-lg font-black text-slate-950">
						Top clientes por receita
					</h3>
					<div className="mt-4 space-y-2">
						{insights.topClientes.slice(0, 10).map((item) => (
							<div
								key={item.label}
								className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm"
							>
								<span className="truncate font-bold text-slate-700">
									{item.label}
								</span>
								<span className="font-black text-slate-950">
									{brl.format(item.value)}
								</span>
							</div>
						))}
					</div>
				</section>
			</section>
		</>
	);
}
