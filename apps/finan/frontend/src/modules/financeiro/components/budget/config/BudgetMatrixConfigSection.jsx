import { brl, integer } from "../../../utils/financeiroFormatters";

export default function BudgetMatrixConfigSection({
	BudgetDropdownSection,
	budgetAccountLabel,
	months,
	accounts,
	centers,
	matrixRows,
	matrixCenterFilter,
	setMatrixCenterFilter,
}) {
	return (
		<BudgetDropdownSection
			title="Matriz de orçamento anual"
			count={matrixRows.length}
			className="mt-5"
			action={
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<label className="text-xs font-black uppercase text-slate-500">
						Centro de custo
						<select
							value={matrixCenterFilter}
							onChange={(event) => setMatrixCenterFilter(event.target.value)}
							className="mt-1 min-h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						>
							<option value="">Todos os centros</option>
							{centers.map((center) => (
								<option key={center.id} value={center.id}>
									{center.codigo ? `${center.codigo} - ` : ""}
									{center.nome}
								</option>
							))}
						</select>
					</label>
					<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
						{matrixRows.length} linha(s)
					</span>
				</div>
			}
		>
			<div className="overflow-x-auto">
				<table className="min-w-full text-left text-xs font-bold">
					<thead className="bg-slate-50 text-slate-500">
						<tr>
							<th scope="col" className="px-4 py-3">Conta</th>
							<th scope="col" className="px-4 py-3">Centro</th>
							{months.map((month) => (
								<th scope="col" key={month} className="px-3 py-3 text-right">
									{month}
								</th>
							))}
							<th scope="col" className="px-4 py-3 text-right">Total</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{matrixRows.slice(0, 8).map((row) => {
							const rowTotal = (row.months || []).reduce(
								(sum, value) => sum + Number(value || 0),
								0,
							);
							return (
								<tr key={row.id}>
									<td className="px-4 py-3 text-slate-800">
										{budgetAccountLabel(
											accounts.find((item) => item.id === row.accountId),
											row.accountId,
										)}
									</td>
									<td className="px-4 py-3 text-slate-600">
										{centers.find((item) => item.id === row.costCenterId)?.nome ||
											row.costCenterId}
									</td>
									{months.map((month, index) => (
										<td
											key={month}
											className="px-3 py-3 text-right text-slate-600"
										>
											{integer.format(row.months?.[index] || 0)}
										</td>
									))}
									<td className="px-4 py-3 text-right font-black text-slate-950">
										{brl.format(rowTotal)}
									</td>
								</tr>
							);
						})}
						{!matrixRows.length ? (
							<tr>
								<td
									colSpan={15}
									className="px-4 py-6 text-center text-sm text-slate-500"
								>
									Nenhuma matriz anual cadastrada.
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>
		</BudgetDropdownSection>
	);
}
