import { RefreshCw } from "lucide-react";
import { tariffBudgetMonthName } from "../../utils/tariffsViewModels";

export default function TariffsDetailFilters({
	loading,
	month,
	onRefresh,
	onYearChange,
	onMonthChange,
	year,
	years = [],
}) {
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			<div className="flex flex-wrap items-center justify-end gap-2">
				<span className="text-xs font-black uppercase text-slate-400">Ano</span>
				<select
					value={year}
					onChange={(event) => onYearChange(Number(event.target.value))}
					className="min-h-11 rounded-xl border border-orange-200 bg-white px-4 text-sm font-black text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
				>
					{years.map((item) => (
						<option key={item} value={item}>
							{item}
						</option>
					))}
				</select>
			</div>
			<select
				value={month}
				onChange={(event) => onMonthChange(Number(event.target.value))}
				className="min-h-11 rounded-xl border border-orange-200 bg-white px-4 text-sm font-black text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
			>
				<option value={0}>Ano completo</option>
				{Array.from({ length: 12 }, (_, index) => (
					<option key={index + 1} value={index + 1}>
						{tariffBudgetMonthName(index + 1)}
					</option>
				))}
			</select>
			<button
				type="button"
				onClick={onRefresh}
				disabled={loading}
				className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
			>
				<RefreshCw size={16} className={loading ? "animate-spin" : ""} />
				Atualizar
			</button>
		</div>
	);
}
