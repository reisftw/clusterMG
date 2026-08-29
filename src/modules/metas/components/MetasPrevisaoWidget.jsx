import { Clock } from "lucide-react";
import { useMetasDashboard } from "../hooks/useMetasDashboard";
import { buildMonthProjection } from "../hooks/useMetasResumoMensal";

const MetasPrevisaoWidget = () => {
	const { metaMes, loading, feriadosSet } = useMetasDashboard();

	if (loading || !metaMes) return null;

	const falta = Math.max(0, Number(metaMes.meta) - Number(metaMes.totalOS));
	const projecao = buildMonthProjection(metaMes, feriadosSet);

	const ritmoAtual = projecao?.ritmoAtual ?? 0;
	const diasRestantes = projecao?.diasRestantes ?? 0;
	const ritmoNecessario =
		diasRestantes > 0 && falta > 0 ? Math.ceil(falta / diasRestantes) : 0;

	return (
		<div className="rounded-xl border border-gray-100 bg-white p-5">
			<div className="mb-3 flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50">
					<Clock size={20} className="text-yellow-500" />
				</div>
				<div>
					<h3 className="text-sm font-bold text-gray-900">Ritmo necessario</h3>
					<p className="text-xs text-gray-500">
						{diasRestantes} dia{diasRestantes !== 1 ? "s" : ""} {"\u00FAteis"}{" "}
						restante
						{diasRestantes !== 1 ? "s" : ""}
					</p>
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex justify-between text-sm">
					<span className="text-gray-600">Ritmo atual</span>
					<span className="font-semibold text-gray-900">
						{ritmoAtual} O.S/dia
					</span>
				</div>

				<div className="flex justify-between text-sm">
					<span className="text-gray-600">Necessario</span>
					<span
						className={`font-bold ${ritmoNecessario > ritmoAtual ? "text-red-600" : "text-green-600"}`}
					>
						{ritmoNecessario} O.S/dia
					</span>
				</div>

				{ritmoNecessario > ritmoAtual && ritmoAtual > 0 && (
					<div className="text-xs font-semibold text-red-600">
						Precisa acelerar +
						{Math.round(((ritmoNecessario - ritmoAtual) / ritmoAtual) * 100)}%
					</div>
				)}

				{ritmoNecessario > 0 && ritmoAtual === 0 && (
					<div className="text-xs font-semibold text-red-600">
						Sem producao util suficiente para calcular um ritmo atual melhor.
					</div>
				)}

				{falta <= 0 && (
					<div className="text-xs font-semibold text-green-600">
						Meta ja atingida!
					</div>
				)}
			</div>
		</div>
	);
};

export default MetasPrevisaoWidget;
