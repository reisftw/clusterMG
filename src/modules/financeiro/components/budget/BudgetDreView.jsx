export default function BudgetDreView({
	BudgetDeviationJustificationModal,
	BudgetTransferRequestModal,
	DreAccountDetailModal,
	DreTransactionDrawer,
	brl,
	budgetAccountLabel,
	budgetVarianceMeta,
	buildBudgetPeriod,
	config,
	insights,
	integer,
	movementValue,
	selectedPeriod,
	deviationJustification,
	dreAccountDetail,
	dreDrawer,
	setDeviationJustification,
	setDreAccountDetail,
	setDreDrawer,
	setTransferRequest,
	transferRequest,
}) {
	const drePeriod = buildBudgetPeriod(selectedPeriod);
	const dreMonths = drePeriod.months || [];
	const dreFirstMonth = dreMonths[0] || {
		year: new Date().getFullYear(),
		month: new Date().getMonth() + 1,
	};
	const dreYear = Number(dreFirstMonth.year || new Date().getFullYear());
	const dreMonth = Number(dreFirstMonth.month || new Date().getMonth() + 1);
	const dreNow = new Date();
	const dreIsCurrentMonth =
		dreMonths.length === 1 &&
		dreYear === dreNow.getFullYear() &&
		dreMonth === dreNow.getMonth() + 1;
	const dreDaysInMonth = new Date(dreYear, dreMonth, 0).getDate();
	const dreElapsedDays = dreIsCurrentMonth ? dreNow.getDate() : dreDaysInMonth;
	const dreElapsedPercent = dreDaysInMonth
		? (dreElapsedDays / dreDaysInMonth) * 100
		: 0;
	const dreMovementsFor = (rowItem) =>
		insights.movements.filter(
			(movement) =>
				String(movement.accountId || "") === String(rowItem.row.accountId || "") &&
				String(movement.centerId || "") ===
					String(rowItem.row.costCenterId || ""),
		);
	const dreSparkline = (rowItem) => {
		const values = Array.from({ length: 6 }, (_, index) => {
			const month = Math.max(1, dreMonth - 5 + index);
			return insights.movements
				.filter(
					(movement) =>
						String(movement.accountId || "") ===
							String(rowItem.row.accountId || "") &&
						String(movement.centerId || "") ===
							String(rowItem.row.costCenterId || "") &&
						Number(movement.month || 0) === month,
				)
				.reduce((sum, movement) => sum + movementValue(movement), 0);
		});
		const max = Math.max(...values, 1);
		return values.map((value, index) => ({
			index,
			height: Math.max(8, (value / max) * 34),
			value,
		}));
	};
	const dreRowStatus = (rowItem) => {
		const used = Number(rowItem.realized || 0);
		const planned = Number(rowItem.planned || 0);
		const percent = planned ? (used / planned) * 100 : 0;
		if (percent > 100) {
			return {
				label: "Estouro / Alerta",
				className: "bg-red-50 text-red-700 ring-red-100",
				dot: "bg-red-500",
			};
		}
		if (
			planned > 0 &&
			(used <= 0 ||
				(dreElapsedPercent >= 75 && percent < dreElapsedPercent * 0.45))
		) {
			return {
				label: "Perto do prazo / Sem lançamento",
				className: "bg-amber-50 text-amber-700 ring-amber-100",
				dot: "bg-amber-400",
			};
		}
		return {
			label: "Dentro do previsto",
			className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
			dot: "bg-emerald-500",
		};
	};
	const dreGroupedAccounts = Array.from(
		insights.accountRows
			.reduce((map, item) => {
				const key = item.account?.id || item.row.accountId || "sem-conta";
				const current = map.get(key) || {
					id: key,
					account: item.account,
					rows: [],
					planned: 0,
					realized: 0,
					committed: 0,
				};
				const committed = Number(item.center?.comprometidoMes || 0);
				current.rows.push(item);
				current.planned += Number(item.planned || 0);
				current.realized += Number(item.realized || 0);
				current.committed += committed;
				map.set(key, current);
				return map;
			}, new Map())
			.values(),
	).sort((left, right) => right.realized - left.realized);

	return (
		<section className="space-y-4">
			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-200 p-4">
					<h2 className="text-lg font-black text-slate-950">
						DRE Orçado x Realizado
					</h2>
					<p className="text-sm font-bold text-slate-500">
						Contas financeiras agrupadas com drill-down por centro de custo,
						forecast e alertas de desvio.
					</p>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full table-fixed text-left text-xs font-bold">
						<thead className="bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th className="w-[30%] px-3 py-3">Conta</th>
								<th className="w-[7%] px-2 py-3 text-right">CC</th>
								<th className="w-[11%] px-2 py-3 text-right">Orçado</th>
								<th className="w-[11%] px-2 py-3 text-right">Realiz.</th>
								<th className="w-[11%] px-2 py-3 text-right">Comp.</th>
								<th className="w-[11%] px-2 py-3 text-right">Forecast</th>
								<th className="w-[10%] px-2 py-3 text-right">Desvio</th>
								<th className="w-[9%] px-3 py-3 text-right">Ação</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{dreGroupedAccounts.map((group) => {
								const groupForecast = dreElapsedDays
									? ((group.realized + group.committed) / dreElapsedDays) *
										dreDaysInMonth
									: group.realized + group.committed;
								const groupVariance = budgetVarianceMeta(
									group.planned,
									group.realized + group.committed,
								);
								return (
									<tr key={group.id} className="bg-white hover:bg-blue-50/30">
										<td className="px-3 py-3">
											<button
												type="button"
												onClick={() => setDreAccountDetail(group)}
												className="block max-w-full truncate text-left font-black text-slate-950 hover:text-blue-700"
												title={budgetAccountLabel(group.account, group.id)}
											>
												{budgetAccountLabel(group.account, group.id)}
											</button>
											<p className="mt-1 truncate text-[11px] font-bold text-slate-500">
												Detalhar centros
											</p>
										</td>
										<td className="px-2 py-3 text-right text-slate-700">
											{integer.format(group.rows.length)}
										</td>
										<td className="px-2 py-3 text-right text-slate-700">
											{brl.format(group.planned)}
										</td>
										<td className="px-2 py-3 text-right text-slate-700">
											{brl.format(group.realized)}
										</td>
										<td className="px-2 py-3 text-right text-slate-700">
											{brl.format(group.committed)}
										</td>
										<td className="px-2 py-3 text-right font-black text-slate-900">
											{brl.format(groupForecast)}
										</td>
										<td
											className={`px-2 py-3 text-right font-black ${groupVariance.textClass}`}
										>
											{brl.format(groupVariance.variance)}
										</td>
										<td className="px-3 py-3 text-right">
											<button
												type="button"
												onClick={() => setDreAccountDetail(group)}
												className="rounded-lg border border-blue-200 px-2 py-1.5 text-[11px] font-black text-blue-700 hover:bg-blue-50"
											>
												Ver
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
			{dreAccountDetail ? (
				<DreAccountDetailModal
					group={dreAccountDetail}
					elapsedDays={dreElapsedDays}
					daysInMonth={dreDaysInMonth}
					rowStatus={dreRowStatus}
					sparklineFor={dreSparkline}
					movementsFor={dreMovementsFor}
					onClose={() => setDreAccountDetail(null)}
					onExtract={(item) =>
						setDreDrawer({ row: item, movements: dreMovementsFor(item) })
					}
					onTransfer={setTransferRequest}
					onJustify={setDeviationJustification}
				/>
			) : null}
			{dreDrawer ? (
				<DreTransactionDrawer
					row={dreDrawer.row}
					movements={dreDrawer.movements}
					accountById={
						new Map((config.accounts || []).map((account) => [account.id, account]))
					}
					centerById={
						new Map((config.centers || []).map((center) => [center.id, center]))
					}
					onClose={() => setDreDrawer(null)}
				/>
			) : null}
			{transferRequest ? (
				<BudgetTransferRequestModal
					row={transferRequest}
					onClose={() => setTransferRequest(null)}
				/>
			) : null}
			{deviationJustification ? (
				<BudgetDeviationJustificationModal
					row={deviationJustification}
					onClose={() => setDeviationJustification(null)}
				/>
			) : null}
		</section>
	);
}
