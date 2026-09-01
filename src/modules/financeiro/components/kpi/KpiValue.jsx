import { formatValue } from "../../utils/financeiroFormatters";

export default function KpiValue({ item, loading = false, compact = false }) {
	if (loading) {
		return <div className="mt-3 h-7 w-28 animate-pulse rounded-lg bg-slate-100" />;
	}

	return (
		<p
			className={`max-w-full break-words font-bold leading-tight text-slate-950 ${compact ? "mt-1.5 text-base lg:text-lg" : "mt-3 text-xl lg:text-2xl"}`}
		>
			{formatValue(item.value, item.type)}
		</p>
	);
}
