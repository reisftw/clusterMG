import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export default function SearchableSelect({ value, onChange, items, placeholder = "Buscar...", empty = "Nenhum resultado encontrado.", disabled = false }) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const containerRef = useRef(null);
	const selected = items.find((item) => item.id === value) || null;

	useEffect(() => {
		function onDocClick(event) {
			if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
		}
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, []);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items.filter((item) => `${item.name} ${item.context || ""}`.toLowerCase().includes(q));
	}, [items, query]);

	const selectItem = (item) => {
		onChange(item.id);
		setQuery("");
		setOpen(false);
	};

	const handleKeyDown = (event) => {
		if (disabled) return;
		if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
		else if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
		else if (event.key === "Enter") { if (open && filtered[highlight]) { event.preventDefault(); selectItem(filtered[highlight]); } }
		else if (event.key === "Escape") { setOpen(false); }
	};

	return (
		<div className="relative" ref={containerRef}>
			<div className="relative">
				<Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
				<input
					value={open ? query : selected?.name || ""}
					onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
					onFocus={() => { if (!disabled) { setOpen(true); setQuery(""); } }}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={disabled}
					className="rot-input pl-8 pr-8 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
				/>
				{value && !disabled ? (
					<button type="button" onClick={() => { onChange(""); setQuery(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600" aria-label="Limpar">
						<X size={14} />
					</button>
				) : null}
			</div>
			{open && !disabled ? (
				<div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
					{filtered.length ? filtered.map((item, index) => (
						<button key={item.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selectItem(item)} className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${index === highlight ? "bg-blue-50" : "hover:bg-slate-50"}`}>
							<span className="font-bold text-slate-800">{item.name}</span>
							{item.context ? <span className="text-xs font-semibold text-slate-400">{item.context}</span> : null}
						</button>
					)) : <p className="px-3 py-2 text-xs font-semibold text-slate-400">{empty}</p>}
				</div>
			) : null}
		</div>
	);
}
