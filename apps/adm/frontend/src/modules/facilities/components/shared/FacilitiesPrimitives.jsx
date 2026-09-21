import { X } from "lucide-react";
import { useMemo, useState } from "react";

export function KpiCard({ label, value, detail, tone = "blue", icon: Icon }) {
	const toneClass = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
		violet: "border-violet-100 bg-violet-50 text-violet-700",
	}[tone];
	const displayValue = String(value ?? "");
	const isLongValue = displayValue.length > 13;
	return (
		<article className="relative min-h-[150px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="min-w-0 pr-12 pt-2">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase text-slate-500">{label}</p>
					<p className={`mt-2 block max-w-full whitespace-nowrap font-black leading-tight text-slate-950 ${isLongValue ? "text-[clamp(1.05rem,1.35vw,1.35rem)] tracking-tight" : "text-[clamp(1.35rem,1.9vw,1.85rem)]"}`}>{value}</p>
					<p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>
				</div>
				<span className={`absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-2xl border ${toneClass}`}>
					<Icon size={20} />
				</span>
			</div>
		</article>
	);
}

export function EmptyState({ title = "Sem dados para exibir", description = "Os dados aparecerão aqui assim que forem cadastrados ou integrados.", action = null }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
			<p className="text-sm font-black text-slate-700">{title}</p>
			<p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
			{action ? <div className="mt-4 flex justify-center">{action}</div> : null}
		</div>
	);
}

export function SearchableSelect({
	label,
	value,
	onChange,
	options = [],
	placeholder = "Pesquisar...",
	getOptionValue = (item) => item.value,
	getOptionLabel = (item) => item.label,
	className = "",
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const selected = options.find((item) => getOptionValue(item) === value);
	const visibleOptions = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		const base = normalized
			? options.filter((item) =>
					String(getOptionLabel(item) || "").toLowerCase().includes(normalized),
				)
			: options;
		return base.slice(0, 25);
	}, [getOptionLabel, options, query]);

	return (
		<label className={`space-y-2 ${className}`}>
			{label ? (
				<span className="text-xs font-black uppercase text-slate-500">{label}</span>
			) : null}
			<div
				className="relative rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400"
				onFocus={() => setOpen(true)}
				onBlur={() => window.setTimeout(() => setOpen(false), 120)}
			>
				<input
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					className="h-10 w-full rounded-xl px-3 text-sm font-semibold outline-none"
					placeholder={selected ? getOptionLabel(selected) : placeholder}
				/>
				{selected ? (
					<div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
						<span className="truncate">{String(getOptionLabel(selected) || "")}</span>
						<button
							type="button"
							onClick={() => {
								onChange("");
								setQuery("");
								setOpen(true);
							}}
							className="text-blue-500 hover:text-red-600"
						>
							<X size={13} />
						</button>
					</div>
				) : null}
				{open ? <div className="absolute left-2 right-2 top-[calc(100%-0.25rem)] z-40 mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-xl">
					{visibleOptions.length ? (
						visibleOptions.map((item) => {
							const optionValue = getOptionValue(item);
							const active = optionValue === value;
							return (
								<button
									type="button"
									key={optionValue}
									onClick={() => {
										onChange(optionValue, item);
										setQuery("");
										setOpen(false);
									}}
									className={`block w-full px-3 py-2 text-left text-xs font-bold transition ${
										active
											? "bg-blue-600 text-white"
											: "text-slate-600 hover:bg-slate-50 hover:text-blue-700"
									}`}
								>
									{String(getOptionLabel(item) || "")}
								</button>
							);
						})
					) : (
						<p className="px-3 py-3 text-xs font-bold text-slate-400">
							Nenhum resultado encontrado.
						</p>
					)}
				</div> : null}
			</div>
		</label>
	);
}

export function AppModal({ title, description, open, onClose, children, footer, maxWidth = "max-w-4xl" }) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/50 p-4">
			<div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl ${maxWidth}`}>
				<div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
					<div>
						<h3 className="text-2xl font-black text-slate-950">{title}</h3>
						{description ? (
							<p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
						) : null}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
						aria-label="Fechar"
					>
						<X size={18} />
					</button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
				{footer ? (
					<div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
						{footer}
					</div>
				) : null}
			</div>
		</div>
	);
}

export function DataList({ title, description, items = [], renderItem, action }) {
	return (
		<section className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div>
					<h3 className="text-lg font-black text-slate-950">{title}</h3>
					{description ? (
						<p className="mt-1 text-sm font-semibold text-slate-500">
							{description}
						</p>
					) : null}
				</div>
				{action}
			</div>
			<div className="space-y-3">
				{items.length ? (
					items.map((item, index) => renderItem(item, index))
				) : (
					<EmptyState />
				)}
			</div>
		</section>
	);
}

export function SimpleRow({ title, subtitle, value, tone = "slate" }) {
	const toneClass = {
		slate: "bg-slate-100 text-slate-600",
		red: "bg-red-50 text-red-700",
		orange: "bg-orange-50 text-orange-700",
		emerald: "bg-emerald-50 text-emerald-700",
		blue: "bg-blue-50 text-blue-700",
	}[tone];
	return (
		<div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3">
			<div className="min-w-0">
				<p className="truncate text-sm font-black text-slate-950">{title}</p>
				{subtitle ? (
					<p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
						{subtitle}
					</p>
				) : null}
			</div>
			{value ? (
				<span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${toneClass}`}>
					{value}
				</span>
			) : null}
		</div>
	);
}
