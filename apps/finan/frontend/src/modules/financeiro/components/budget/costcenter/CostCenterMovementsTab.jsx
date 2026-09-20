export default function CostCenterMovementsTab({
	accountById,
	branchById,
	brl,
	companyById,
	integer,
	movementsByMonth = [],
	selectedMovementMonth,
	setActiveMovementMonth,
}) {
	return (
		<section className="space-y-4">
			<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h3 className="text-base font-black text-slate-950">
						Movimentações por mês
					</h3>
					<p className="text-sm font-bold text-slate-500">
						Linhas importadas da planilha para este centro de custo.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{movementsByMonth.length
						? movementsByMonth.map((group) => (
								<button
									key={group.key}
									type="button"
									onClick={() => setActiveMovementMonth(group.key)}
									className={`rounded-xl border px-3 py-2 text-xs font-black ${selectedMovementMonth?.key === group.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
								>
									{group.label}
								</button>
							))
						: null}
				</div>
			</div>
			{selectedMovementMonth ? (
				<div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
					<div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-xs font-black uppercase tracking-wide text-blue-700">
								{selectedMovementMonth.label}
							</p>
							<h4 className="text-lg font-black text-slate-950">
								{brl.format(selectedMovementMonth.total)}
							</h4>
						</div>
						<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
							{integer.format(selectedMovementMonth.rows.length)} movimentação(ões)
						</span>
					</div>
					<div className="max-h-[460px] overflow-auto">
						<table className="min-w-full divide-y divide-slate-100 text-sm">
							<thead className="sticky top-0 bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
								<tr>
									<th scope="col" className="px-4 py-3">Data</th>
									<th scope="col" className="px-4 py-3">Fornecedor</th>
									<th scope="col" className="px-4 py-3">Conta</th>
									<th scope="col" className="px-4 py-3">Matriz / Filial</th>
									<th scope="col" className="px-4 py-3">Documento</th>
									<th scope="col" className="px-4 py-3 text-right">Valor</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{selectedMovementMonth.rows.map((movement, index) => {
									const account = accountById.get(movement.accountId);
									const company = companyById.get(movement.companyId);
									const branch = branchById.get(movement.branchId);
									return (
										<tr
											key={movement.id || `${selectedMovementMonth.key}-${index}`}
											className="align-top"
										>
											<td className="px-4 py-3 font-bold text-slate-700">
												{movement.date || "-"}
											</td>
											<td className="px-4 py-3 font-bold text-slate-900">
												{movement.supplier || movement.fornecedor || "-"}
											</td>
											<td className="px-4 py-3 text-slate-600">
												{account
													? `${account.codigo || account.id} - ${account.nome}`
													: movement.accountName || movement.accountId || "-"}
											</td>
											<td className="px-4 py-3 text-slate-600">
												<span className="block font-bold">
													{company
														? `${company.codigo || company.id} - ${company.nome}`
														: movement.companyId || "-"}
												</span>
												<span className="block text-xs font-bold text-slate-400">
													{branch
														? `${branch.codigo || branch.id} - ${branch.nome}`
														: movement.branchId || "-"}
												</span>
											</td>
											<td className="px-4 py-3 text-slate-600">
												<span className="block font-bold">
													{movement.document || movement.titulo || "-"}
												</span>
												{movement.notes ? (
													<span className="block text-xs text-slate-400">
														{movement.notes}
													</span>
												) : null}
											</td>
											<td className="px-4 py-3 text-right font-black text-slate-950">
												{brl.format(Number(movement.value || 0))}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">
					Nenhuma movimentação importada para este centro de custo.
				</div>
			)}
		</section>
	);
}
