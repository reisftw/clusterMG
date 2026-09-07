import { brl, decimal, integer } from "../../../utils/financeiroFormatters";

export default function BudgetDirectoratesDetail({
	directorateRows,
	budgetConsumptionStatus,
	EmptyState,
}) {
	return (
		<div className="min-h-[360px]">
			{directorateRows.length ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{directorateRows.map((item) => {
						const status = budgetConsumptionStatus(item.percent);
						const progress = Math.min(100, Math.max(4, Number(item.percent || 0)));
						return (
							<section
								key={item.id}
								className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="break-words text-base font-black text-slate-950">
											{item.nome}
										</p>
										<p className="mt-1 break-words text-xs font-bold text-slate-500">
											{item.diretor || "Diretor não informado"} ·{" "}
											{integer.format(item.centers)} centro(s)
										</p>
									</div>
									<span className={`rounded-full px-3 py-1 text-xs font-black ${status.textClass} bg-slate-50`}>
										{decimal.format(item.percent)}%
									</span>
								</div>
								<div className="mt-4 grid gap-2 sm:grid-cols-3">
									<div className="rounded-xl bg-slate-50 p-3">
										<p className="text-[11px] font-black uppercase text-slate-500">
											Orçado
										</p>
										<p className="mt-1 break-words text-sm font-black text-slate-950">
											{brl.format(item.planned)}
										</p>
									</div>
									<div className="rounded-xl bg-slate-50 p-3">
										<p className="text-[11px] font-black uppercase text-slate-500">
											Realizado
										</p>
										<p className="mt-1 break-words text-sm font-black text-slate-950">
											{brl.format(item.realized)}
										</p>
									</div>
									<div className="rounded-xl bg-slate-50 p-3">
										<p className="text-[11px] font-black uppercase text-slate-500">
											Saldo
										</p>
										<p
											className={`mt-1 break-words text-sm font-black ${item.available >= 0 ? "text-emerald-700" : "text-red-700"}`}
										>
											{brl.format(item.available)}
										</p>
									</div>
								</div>
								<div className="mt-4 h-2.5 rounded-full bg-slate-100">
									<div
										className={`h-full rounded-full ${status.barClass}`}
										style={{ width: `${progress}%` }}
									/>
								</div>
							</section>
						);
					})}
				</div>
			) : (
				<EmptyState text="Nenhuma diretoria vinculada aos centros analíticos do período." />
			)}
		</div>
	);
}
