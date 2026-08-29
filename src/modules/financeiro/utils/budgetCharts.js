export function buildBudgetMonthlyChart(insights = {}) {
	const monthlyEvolution = insights.monthlyEvolution || [];
	return {
		labels: monthlyEvolution.map((item) => item.label),
		datasets: [
			{
				label: "Orçado",
				data: monthlyEvolution.map((item) => item.planned),
				backgroundColor: "#2563eb",
				borderRadius: 8,
			},
			{
				label: "Realizado",
				data: monthlyEvolution.map((item) => item.realized),
				backgroundColor: "#f97316",
				borderRadius: 8,
			},
		],
	};
}

export function buildBudgetForecastChart(insights = {}) {
	const forecastRows = insights.forecastRows || [];
	return {
		labels: forecastRows.map((item) => item.label),
		datasets: [
			{
				label: "Realizado acumulado",
				data: forecastRows.map((item) => item.cumulativeRealized),
				borderColor: "#2563eb",
				backgroundColor: "rgba(37,99,235,.14)",
				fill: true,
				tension: 0.35,
			},
			{
				label: "Forecast",
				data: forecastRows.map((item) => item.forecast),
				borderColor: "#f97316",
				backgroundColor: "rgba(249,115,22,.08)",
				borderDash: [6, 4],
				fill: false,
				tension: 0.35,
			},
		],
	};
}

export function buildBudgetAccountChart(
	accountSummary = [],
	budgetAccountLabel,
	limit = 8,
) {
	const rows = Number.isFinite(limit)
		? accountSummary.slice(0, limit)
		: accountSummary;
	return {
		rows,
		chart: {
			labels: rows.map((item) => budgetAccountLabel(item.account, item.id)),
			datasets: [
				{
					label: "Orçado",
					data: rows.map((item) => item.planned),
					backgroundColor: "#0f766e",
					borderRadius: 8,
				},
				{
					label: "Realizado",
					data: rows.map((item) => item.realized),
					backgroundColor: "#f97316",
					borderRadius: 8,
				},
			],
		},
	};
}

export function buildBudgetCenterChart(
	centerSummary = [],
	budgetCenterCompactLabel,
	limit = 8,
) {
	const rows = Number.isFinite(limit) ? centerSummary.slice(0, limit) : centerSummary;
	return {
		rows,
		chart: {
			labels: rows.map((item) => budgetCenterCompactLabel(item.center)),
			datasets: [
				{
					label: "Disponível",
					data: rows.map((item) => Math.max(0, item.planned - item.realized)),
					backgroundColor: "#bfdbfe",
					borderRadius: 8,
				},
				{
					label: "Consumido",
					data: rows.map((item) => item.realized),
					backgroundColor: "#2563eb",
					borderRadius: 8,
				},
			],
		},
	};
}

export function buildBudgetSupplierChart(supplierSummary = [], limit = 10) {
	const rows = Number.isFinite(limit)
		? supplierSummary.slice(0, limit)
		: supplierSummary;
	return {
		rows,
		total: rows.reduce((sum, item) => sum + Number(item.value || 0), 0),
		chart: {
			labels: rows.map((item) => item.supplier),
			datasets: [
				{
					data: rows.map((item) => item.value),
					backgroundColor: [
						"#2563eb",
						"#f97316",
						"#10b981",
						"#8b5cf6",
						"#ef4444",
						"#14b8a6",
						"#f59e0b",
						"#6366f1",
						"#84cc16",
						"#64748b",
					],
					borderWidth: 0,
				},
			],
		},
	};
}

export function buildBudgetFullSupplierChart(supplierSummary = []) {
	return {
		labels: supplierSummary.map((item) => item.supplier),
		datasets: [
			{
				label: "Realizado",
				data: supplierSummary.map((item) => item.value),
				backgroundColor: supplierSummary.map((item, index) =>
					index < 5 ? "#2563eb" : "#60a5fa",
				),
				borderRadius: 8,
				barThickness: 18,
			},
		],
	};
}
