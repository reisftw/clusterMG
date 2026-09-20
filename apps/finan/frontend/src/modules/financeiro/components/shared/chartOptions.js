// Extraído de DashboardPrimitives.jsx (react-refresh/only-export-components
// não permite misturar componentes com helper não-componente no mesmo
// arquivo). Comportamento idêntico ao que estava lá — só mudou de arquivo.
import { brl } from "../../utils/financeiroFormatters";

export function barOptions(formatter = brl.format) {
	return {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				labels: { boxWidth: 10, font: { weight: "bold" } },
			},
			tooltip: {
				callbacks: {
					label: (context) =>
						`${context.dataset.label}: ${formatter(Number(context.raw || 0))}`,
				},
			},
		},
		scales: {
			x: { grid: { display: false } },
			y: { ticks: { callback: (value) => formatter(Number(value)) } },
		},
	};
}
