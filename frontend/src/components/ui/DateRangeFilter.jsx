export default function DateRangeFilter({ dateFrom, dateTo, onChangeFrom, onChangeTo, onClear }) {
	return (
		<div className="flex flex-wrap items-end gap-2">
			<label className="block">
				<span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">De</span>
				<input type="date" value={dateFrom} onChange={(e) => onChangeFrom(e.target.value)} className="rot-input h-10" />
			</label>
			<label className="block">
				<span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Até</span>
				<input type="date" value={dateTo} onChange={(e) => onChangeTo(e.target.value)} className="rot-input h-10" />
			</label>
			{dateFrom || dateTo ? (
				<button type="button" onClick={onClear} className="rot-btn-tactile h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">Limpar</button>
			) : null}
		</div>
	);
}
