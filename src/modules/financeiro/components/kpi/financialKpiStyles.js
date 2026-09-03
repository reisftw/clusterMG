export const KPI_COLOR_VARIANTS = {
	blue: {
		icon: "from-blue-50/90 via-white to-white text-blue-700 ring-blue-100",
		stripe: "bg-blue-600",
		progress: "bg-blue-600",
		hover:
			"hover:border-blue-200 hover:shadow-[0_18px_42px_rgba(37,99,235,0.13)]",
	},
	emerald: {
		icon: "from-emerald-50/90 via-white to-white text-emerald-700 ring-emerald-100",
		stripe: "bg-emerald-500",
		progress: "bg-emerald-500",
		hover:
			"hover:border-emerald-200 hover:shadow-[0_18px_42px_rgba(16,185,129,0.13)]",
	},
	violet: {
		icon: "from-violet-50/90 via-white to-white text-violet-700 ring-violet-100",
		stripe: "bg-violet-600",
		progress: "bg-violet-600",
		hover:
			"hover:border-violet-200 hover:shadow-[0_18px_42px_rgba(124,58,237,0.13)]",
	},
	amber: {
		icon: "from-amber-50/90 via-white to-white text-amber-700 ring-amber-100",
		stripe: "bg-amber-500",
		progress: "bg-amber-500",
		hover:
			"hover:border-amber-200 hover:shadow-[0_18px_42px_rgba(245,158,11,0.13)]",
	},
	rose: {
		icon: "from-rose-50/90 via-white to-white text-rose-700 ring-rose-100",
		stripe: "bg-rose-500",
		progress: "bg-rose-500",
		hover:
			"hover:border-rose-200 hover:shadow-[0_18px_42px_rgba(244,63,94,0.13)]",
	},
	slate: {
		icon: "from-slate-50/90 via-white to-white text-slate-700 ring-slate-100",
		stripe: "bg-slate-600",
		progress: "bg-slate-600",
		hover:
			"hover:border-slate-300 hover:shadow-[0_18px_42px_rgba(15,23,42,0.10)]",
	},
};

export function getBudgetStatusColor(percent = 0) {
	const safePercent = Number(percent || 0);
	if (safePercent > 95) return "rose";
	if (safePercent >= 70) return "amber";
	return "emerald";
}

export function getKpiColorVariant(item = {}) {
	if (item.statusColor) {
		return KPI_COLOR_VARIANTS[item.statusColor] || KPI_COLOR_VARIANTS.blue;
	}
	if (item.trend?.status === "negative") return KPI_COLOR_VARIANTS.amber;
	return KPI_COLOR_VARIANTS[item.color] || KPI_COLOR_VARIANTS.blue;
}

export function getKpiTrendClass(trend = {}) {
	if (trend.status === "positive") return "bg-emerald-50 text-emerald-700";
	if (trend.status === "negative") return "bg-red-50 text-red-700";
	return "bg-slate-50 text-slate-500";
}
