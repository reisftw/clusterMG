import TariffsDetailCharts from "./TariffsDetailCharts";
import TariffsDetailFilters from "./TariffsDetailFilters";
import TariffsDetailKpis from "./TariffsDetailKpis";
import TariffsDetailTable from "./TariffsDetailTable";

export default function TariffsDetailLayout({
	feedbackModal,
	filters,
	loading,
	onSelectInvoiceMetric,
	pagination,
	search,
	viewModel,
}) {
	return (
		<section className="space-y-4">
			<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">{viewModel.title}</h2>
					<p className="mt-1 text-sm font-bold text-slate-500">
						{viewModel.subtitle}
					</p>
				</div>
				<TariffsDetailFilters loading={loading} {...filters} />
			</div>
			<TariffsDetailKpis kpis={viewModel.kpis} loading={loading} />
			<TariffsDetailCharts
				onSelectInvoiceMetric={onSelectInvoiceMetric}
				viewModel={viewModel}
			/>
			<TariffsDetailTable
				pageSize={pagination.pageSize}
				searchTerm={search.value}
				onPageChange={pagination.onPageChange}
				onPageSizeChange={pagination.onPageSizeChange}
				onSearchChange={search.onChange}
				viewModel={viewModel}
			/>
			{feedbackModal}
		</section>
	);
}
