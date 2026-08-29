import { formatValue } from "../../utils/financeiroFormatters";

export default function KpiValue({ item, loading = false, compact = false }) {
	if (loading) {
		return <div className="mt-3 h-7 w-28 animate-pulse rounded-lg bg-slate-100" />;
	}

	return (
		<p
			className={`max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-bold leading-none tracking-tight text-slate-950 ${compact ? "mt-1.5 text-[clamp(1rem,1vw,1.25rem)]" : "mt-3 text-[clamp(1.15rem,1.25vw,1.55rem)]"}`}
		>
			{formatValue(item.value, item.type)}
		</p>
	);
}
