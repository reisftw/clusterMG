import { integer } from "../../../utils/financeiroFormatters";

export default function BudgetMovementsDetail({
	insights,
	dashboardDetailPage,
	setDashboardDetailPage,
	accountById,
	centerById,
	companyById,
	branchById,
	renderMovementsDetailTable,
}) {
	const pageSize = 25;
	const totalPages = Math.max(1, Math.ceil(insights.movements.length / pageSize));
	const safePage = Math.min(dashboardDetailPage, totalPages);
	const visibleMovements = insights.movements.slice(
		(safePage - 1) * pageSize,
		safePage * pageSize,
	);

	return (
		<div className="space-y-3">
			{renderMovementsDetailTable(
				visibleMovements,
				accountById,
				centerById,
				companyById,
				branchById,
			)}
			{insights.movements.length ? (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
					<p className="text-xs font-black text-slate-600">
						Página {integer.format(safePage)} de {integer.format(totalPages)} ·{" "}
						{integer.format(insights.movements.length)} movimentação(ões)
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setDashboardDetailPage((value) => Math.max(1, value - 1))}
							disabled={safePage <= 1}
							className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
						>
							Anterior
						</button>
						<button
							type="button"
							onClick={() =>
								setDashboardDetailPage((value) => Math.min(totalPages, value + 1))
							}
							disabled={safePage >= totalPages}
							className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
						>
							Próxima
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
