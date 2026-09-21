import { AlertTriangle, BellRing } from "lucide-react";
import { useMemo } from "react";
import { useMetasDashboard } from "../../metas/hooks/useMetasDashboard";
import DashboardWidgetCard from "./DashboardWidgetCard";
import { getCancellationPercent, getGoalPercent } from "../utils/metasMetrics";

function AlertItem({ icon, title, description, tone = "amber" }) {
	const IconComponent = icon;
	const tones = {
		red: "border-red-200 bg-red-50 text-red-700",
		amber: "border-amber-200 bg-amber-50 text-amber-700",
		blue: "border-blue-200 bg-blue-50 text-blue-700",
	};

	return (
		<div className={`rounded-xl border p-4 ${tones[tone]}`}>
			<div className="flex items-start gap-3">
				<div className="mt-0.5 rounded-lg bg-white/70 p-2">
					<IconComponent size={16} />
				</div>
				<div>
					<p className="text-sm font-bold">{title}</p>
					<p className="mt-1 text-xs leading-5 opacity-90">{description}</p>
				</div>
			</div>
		</div>
	);
}

export default function AlertasAutomaticosWidget() {
	const { metaMes, loading } = useMetasDashboard();

	const alertas = useMemo(() => {
		const items = [];

		if (metaMes) {
			const pct = getGoalPercent(metaMes);
			const pctCancelamentos = getCancellationPercent(metaMes);
			const metaLabel = String(
				metaMes.metaModeLabel || "meta sazonal",
			).toLowerCase();

			if (pct < 100) {
				items.push({
					icon: AlertTriangle,
					title: "Meta mensal abaixo do esperado",
					description: `${pct.toFixed(1)}% da meta atingido (${pctCancelamentos.toFixed(1)}% dos cancelamentos) frente a ${metaLabel}.`,
					tone: pct < 80 ? "red" : "amber",
				});
			}
		}

		return items;
	}, [metaMes]);

	return (
		<DashboardWidgetCard
			icon={BellRing}
			iconClassName="bg-amber-50 text-amber-600"
			title="Alertas Automaticos"
		>
			{(() => {
				// Extraido pra achado javascript:S3358 (ternario aninhado).
				if (loading) {
					return <p className="text-sm text-gray-400">Atualizando alertas...</p>;
				}
				if (alertas.length === 0) {
					return (
						<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
							Nenhum alerta critico no momento.
						</div>
					);
				}
				return (
					<div className="space-y-3">
						{alertas.map((alerta, index) => (
							<AlertItem key={index} {...alerta} />
						))}
					</div>
				);
			})()}
		</DashboardWidgetCard>
	);
}
