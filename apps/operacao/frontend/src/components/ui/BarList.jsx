// Lista de barras horizontais simples — usada nos indicadores do DSS
// (participação por mês/regional/operação, distribuição de status,
// motivos de ausência). Sem lib de gráfico externa: o projeto não usa
// chart.js/react-chartjs-2 em nenhuma outra tela do app "rot" hoje, e
// para distribuições categóricas simples uma lista de barras é
// suficiente e mais leve que trazer uma dependência nova só pra isso.
export default function BarList({ items, colorClass = "bg-orange-500", emptyLabel = "Sem dados no período." }) {
	if (!items?.length) return <p className="text-sm font-semibold text-slate-400">{emptyLabel}</p>;
	const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
	return (
		<div className="space-y-2.5">
			{items.map((item, index) => (
				<div key={index}>
					<div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-600">
						<span>{item.label}</span>
						<span className="text-slate-900">{item.displayValue ?? item.value}</span>
					</div>
					<div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
						<div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(2, (Number(item.value) || 0) / max * 100)}%` }} />
					</div>
				</div>
			))}
		</div>
	);
}
