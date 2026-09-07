import FinancialKpiCard from "../kpi/FinancialKpiCard";

export default function TariffsOverviewKpis({ insights, loading }) {
	const items = [
		{ title: "Receita diária", value: insights.kpis.receitaTotal, type: "currency", icon: "CircleDollarSign", color: "blue" },
		{ title: "Tarifas", value: insights.kpis.tarifasTotal, type: "currency", icon: "ReceiptText", color: "amber" },
		{ title: "Custo médio", value: insights.kpis.custoMedioCobranca, type: "currency", icon: "BadgeDollarSign", color: "emerald" },
		{ title: "Clientes cobrança", value: insights.kpis.totalClientesCobranca, type: "number", icon: "Users", color: "violet" },
		{ title: "Pagamentos", value: insights.kpis.totalPagamentos, type: "number", icon: "Wallet", color: "emerald" },
		{ title: "Receita cliente", value: insights.kpis.receitaClienteTotal, type: "currency", icon: "Landmark", color: "slate" },
	];
	return (
		<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
			{items.map((item) => (
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
