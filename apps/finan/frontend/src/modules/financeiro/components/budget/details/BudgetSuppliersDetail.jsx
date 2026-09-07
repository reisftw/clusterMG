import { Bar } from "react-chartjs-2";
import { brl, integer } from "../../../utils/financeiroFormatters";

export default function BudgetSuppliersDetail({
	insights,
	fullSupplierChart,
	centerById,
	accountById,
	smartCurrencyStep,
	supplierBarOptions,
	supplierChartHeight,
	renderSupplierDetailTable,
}) {
	return (
		<div className="space-y-4">
			<div className="rounded-2xl border border-slate-200 bg-white p-4">
				<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
					<p className="text-xs font-black uppercase text-slate-500">
						{integer.format(insights.supplierSummary.length)} fornecedor(es) ·
						maior para menor
					</p>
					<p className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
						Escala automática em{" "}
						{brl.format(
							smartCurrencyStep(
								Math.max(
									...insights.supplierSummary.map((item) => Number(item.value || 0)),
									0,
								),
							),
						)}
					</p>
				</div>
				<div style={{ height: supplierChartHeight(insights.supplierSummary.length) }}>
					<Bar
						data={fullSupplierChart}
						options={supplierBarOptions(
							insights.supplierSummary.map((item) => item.supplier),
							insights.supplierSummary.map((item) => item.value),
						)}
					/>
				</div>
			</div>
			{renderSupplierDetailTable(insights.supplierSummary, centerById, accountById)}
		</div>
	);
}
