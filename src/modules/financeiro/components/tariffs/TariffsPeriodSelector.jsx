import { tariffBudgetMonthName } from "../../utils/tariffsViewModels";

export default function TariffsPeriodSelector({
	monthMenuOpen,
	onDateClick,
	onMonthToggle,
	onMonthSelect,
	onYearToggle,
	onYearSelect,
	periodLabel,
	periodMode,
	selectedReference,
	yearMenuOpen,
	yearOptions = [],
}) {
	return (
		<div className="-mt-4 flex justify-end">
			<div className="relative flex rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="relative">
					<button
						type="button"
						onClick={onMonthToggle}
						className={`min-h-11 rounded-l-xl px-5 text-sm font-bold ${periodMode === "month" ? "bg-orange-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
					>
						{periodMode === "month" ? periodLabel : "Mês"}
					</button>
					{monthMenuOpen ? (
						<div className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
							<div className="grid grid-cols-2 gap-1">
								{Array.from({ length: 12 }, (_, index) => {
									const month = index + 1;
									return (
										<button
											key={month}
											type="button"
											onClick={() => onMonthSelect(month)}
											className="rounded-xl px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-50"
										>
											{tariffBudgetMonthName(month)}
										</button>
									);
								})}
							</div>
						</div>
					) : null}
				</div>
				<div className="relative">
					<button
						type="button"
						onClick={onYearToggle}
						className={`min-h-11 border-l border-slate-200 px-5 text-sm font-bold ${periodMode === "year" ? "bg-orange-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
					>
						Ano
					</button>
					{yearMenuOpen ? (
						<div className="absolute right-0 top-[calc(100%+8px)] z-40 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
							{yearOptions.map((year) => (
								<button
									key={year}
									type="button"
									onClick={() => onYearSelect(year)}
									className="block w-full rounded-xl px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-50"
								>
									{year}
								</button>
							))}
						</div>
					) : null}
				</div>
				<button
					type="button"
					onClick={onDateClick}
					className={`min-h-11 rounded-r-xl border-l border-slate-200 px-5 text-sm font-bold ${periodMode === "custom" ? "bg-orange-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					Datas
				</button>
			</div>
		</div>
	);
}
