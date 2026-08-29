export const KPI_COLOR_VARIANTS = {
	blue: {
		icon: "from-blue-50/90 via-white to-white text-blue-700 ring-blue-100",
		stripe: "from-blue-600 to-cyan-300",
		hover:
			"hover:border-blue-200 hover:shadow-[0_18px_42px_rgba(37,99,235,0.13)]",
	},
	emerald: {
		icon: "from-emerald-50/90 via-white to-white text-emerald-700 ring-emerald-100",
		stripe: "from-emerald-500 to-lime-300",
		hover:
			"hover:border-emerald-200 hover:shadow-[0_18px_42px_rgba(16,185,129,0.13)]",
	},
	violet: {
		icon: "from-violet-50/90 via-white to-white text-violet-700 ring-violet-100",
		stripe: "from-violet-600 to-fuchsia-300",
		hover:
			"hover:border-violet-200 hover:shadow-[0_18px_42px_rgba(124,58,237,0.13)]",
	},
	amber: {
		icon: "from-amber-50/90 via-white to-white text-amber-700 ring-amber-100",
		stripe: "from-amber-500 to-yellow-300",
		hover:
			"hover:border-amber-200 hover:shadow-[0_18px_42px_rgba(245,158,11,0.13)]",
	},
	rose: {
		icon: "from-rose-50/90 via-white to-white text-rose-700 ring-rose-100",
		stripe: "from-rose-500 to-pink-300",
		hover:
			"hover:border-rose-200 hover:shadow-[0_18px_42px_rgba(244,63,94,0.13)]",
	},
	slate: {
		icon: "from-slate-50/90 via-white to-white text-slate-700 ring-slate-100",
		stripe: "from-slate-600 to-slate-300",
		hover:
			"hover:border-slate-300 hover:shadow-[0_18px_42px_rgba(15,23,42,0.10)]",
	},
};

export function getKpiColorVariant(item = {}) {
	if (item.trend?.status === "negative") return KPI_COLOR_VARIANTS.amber;
	return KPI_COLOR_VARIANTS[item.color] || KPI_COLOR_VARIANTS.blue;
}

export function getKpiTrendClass(trend = {}) {
	if (trend.status === "positive") return "bg-emerald-50 text-emerald-700";
	if (trend.status === "negative") return "bg-red-50 text-red-700";
	return "bg-slate-50 text-slate-500";
}
