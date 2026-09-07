import FinancialKpiCard from "../kpi/FinancialKpiCard";

export default function TariffsDetailKpis({ kpis = [], loading }) {
	return (
		<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{kpis.map((item) => (
				<FinancialKpiCard
					key={item.title}
					loading={loading}
					compact
					centered
					item={item}
				/>
			))}
		</section>
	);
}
