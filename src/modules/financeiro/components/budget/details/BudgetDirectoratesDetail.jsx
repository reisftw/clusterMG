import { brl, decimal, integer } from "../../../utils/financeiroFormatters";

export default function BudgetDirectoratesDetail({
	directorateRows,
	budgetConsumptionStatus,
	EmptyState,
}) {
	return (
		<div className="overflow-auto rounded-2xl border border-slate-200">
			<table className="min-w-[720px] divide-y divide-slate-200 text-left text-xs font-bold">
				<thead className="bg-slate-50 text-slate-500">
					<tr>
						<th className="px-3 py-2">Diretoria</th>
						<th className="px-3 py-2">Diretor</th>
						<th className="px-3 py-2 text-right">Centros</th>
						<th className="px-3 py-2 text-right">Orçado</th>
						<th className="px-3 py-2 text-right">Realizado</th>
						<th className="px-3 py-2 text-right">Saldo</th>
						<th className="px-3 py-2 text-right">Uso</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{directorateRows.length ? (
						directorateRows.map((item) => {
							const status = budgetConsumptionStatus(item.percent);
							return (
								<tr key={item.id}>
									<td className="px-3 py-2 font-black text-slate-950">
										{item.nome}
									</td>
									<td className="px-3 py-2 text-slate-600">
										{item.diretor || "Diretor não informado"}
									</td>
									<td className="px-3 py-2 text-right text-slate-700">
										{integer.format(item.centers)}
									</td>
									<td className="px-3 py-2 text-right text-slate-700">
										{brl.format(item.planned)}
									</td>
									<td className="px-3 py-2 text-right font-black text-slate-900">
										{brl.format(item.realized)}
									</td>
									<td
										className={`px-3 py-2 text-right font-black ${item.available >= 0 ? "text-emerald-600" : "text-red-600"}`}
									>
										{brl.format(item.available)}
									</td>
									<td className={`px-3 py-2 text-right font-black ${status.textClass}`}>
										{decimal.format(item.percent)}%
									</td>
								</tr>
							);
						})
					) : (
						<tr>
							<td colSpan={7}>
								<EmptyState text="Nenhuma diretoria vinculada aos centros analíticos do período." />
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}
