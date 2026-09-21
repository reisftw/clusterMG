import { MapPin, Target, TrendingUp, Users } from "lucide-react";
import { useMemo } from "react";
import RetorninhoLoader from "../../../components/ui/RetorninhoLoader";
import { calcularMetaBrasilTecpar } from "../../../utils/brasilTecparMeta";
import {
	getCancellationPercent,
	getGoalPercent,
} from "../../dashboard/utils/metasMetrics";
import { useMetasDashboard } from "../hooks/useMetasDashboard";
import { buildMonthProjection } from "../hooks/useMetasResumoMensal";
import { recalcularSaldoDiario } from "../utils/metasSaldo";

const MetasDashboardWidget = () => {
	const { metaMes, loading, feriadosSet } = useMetasDashboard();

	const { metaDiaria, diasUteis, saldoRecalculado, projecao } = useMemo(() => {
		if (!metaMes) {
			return {
				metaDiaria: 0,
				diasUteis: 0,
				saldoRecalculado: [],
				projecao: null,
			};
		}

		const {
			diasUteis,
			metaDiaria,
			saldoDiario: saldoRecalculado,
		} = recalcularSaldoDiario(metaMes, feriadosSet);

		if (!metaMes?.saldoDiario?.length) {
			return { metaDiaria, diasUteis, saldoRecalculado: [], projecao: null };
		}

		const projecao = buildMonthProjection(metaMes, feriadosSet);

		return { metaDiaria, diasUteis, saldoRecalculado, projecao };
	}, [metaMes, feriadosSet]);

	if (loading) {
		return (
			<div className="bg-white rounded-xl border border-gray-100 p-5">
				<RetorninhoLoader compact size="sm" title="Carregando metas..." />
			</div>
		);
	}

	if (!metaMes) {
		return (
			<div className="bg-white rounded-xl border border-gray-100 p-5">
				<p className="text-xs text-gray-400">
					Nenhuma meta carregada para o mes atual.
				</p>
			</div>
		);
	}

	const metaModeLabel = metaMes.metaModeLabel || "Meta sazonal";
	const cancelamentos = Math.round(metaMes.cancelamentos ?? 0);
	const metaOS = Math.round(metaMes.meta);
	const metaBrasilTecpar = calcularMetaBrasilTecpar({
		cancelamentos,
		totalOS: metaMes.totalOS,
	});
	const falta = Math.max(0, metaMes.meta - metaMes.totalOS);
	const topTec = metaMes.technicians?.[0];
	const topReg = metaMes.regionais?.[0];
	const percentAchieved = getGoalPercent(metaMes);
	const percentCancelamentos = getCancellationPercent(metaMes);
	const atingido = percentAchieved >= 100;
	const ritmoAtual = projecao?.ritmoAtual ?? 0;
	const saldoMesAtual =
		saldoRecalculado[saldoRecalculado.length - 1]?.saldoMes ?? 0;

	return (
		<div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
						<Target size={18} className="text-blue-600" />
					</div>
					<div>
						<p className="text-xs text-gray-400 uppercase font-semibold">
							Meta do mes
						</p>
						<p className="text-sm font-bold text-gray-900">
							{metaMes.mes} 2026
						</p>
					</div>
				</div>
				<div className="flex items-center gap-1 text-xs">
					<TrendingUp
						size={14}
						className={atingido ? "text-green-500" : "text-red-400"}
					/>
					<span
						className={
							atingido
								? "text-green-600 font-semibold"
								: "text-red-500 font-semibold"
						}
					>
						{percentAchieved.toFixed(1)}% da meta
					</span>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
				<div>
					<p className="text-[11px] text-gray-400 font-semibold mb-1">
						Cancelamentos
					</p>
					<p className="text-base font-bold text-gray-800">
						{cancelamentos.toLocaleString("pt-BR")}
					</p>
				</div>
				<div>
					<p className="text-[11px] text-gray-400 font-semibold mb-1">
						{metaModeLabel}
					</p>
					<p className="text-base font-bold text-blue-700">
						{metaOS.toLocaleString("pt-BR")}
					</p>
				</div>
				<div>
					<p className="text-[11px] text-gray-400 font-semibold mb-1">
						Brasil Tecpar 65%
					</p>
					<p className="text-base font-bold text-amber-700">
						{metaBrasilTecpar.meta.toLocaleString("pt-BR")}
					</p>
				</div>
				<div>
					<p className="text-[11px] text-gray-400 font-semibold mb-1">
						Realizado
					</p>
					<p className="text-base font-bold text-orange-600">
						{Number(metaMes.totalOS).toLocaleString("pt-BR")}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
				<div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-blue-700">
					<strong>{percentAchieved.toFixed(1)}%</strong> de atingimento sobre
					a meta.
				</div>
				<div className="rounded-2xl border border-orange-100 bg-orange-50 px-3 py-2 text-orange-700">
					<strong>{percentCancelamentos.toFixed(1)}%</strong> das O.S. sobre
					os cancelamentos.
				</div>
			</div>

			<div className="text-[11px] text-gray-500">
				{falta > 0 ? (
					<span>
						Faltam{" "}
						<span className="font-semibold text-gray-800">
							{falta.toLocaleString("pt-BR")} O.S
						</span>{" "}
						para bater a meta.
					</span>
				) : (
					<span className="font-semibold text-green-600">
						Meta atingida para o mes.
					</span>
				)}
			</div>

			<div
				className={`rounded-2xl border px-3 py-2 text-[11px] ${
					metaBrasilTecpar.atingiu
						? "border-green-100 bg-green-50 text-green-700"
						: "border-amber-100 bg-amber-50 text-amber-800"
				}`}
			>
				Brasil Tecpar: <strong>{metaBrasilTecpar.percentAchieved}%</strong> da
				meta fixa de 65%
				{metaBrasilTecpar.atingiu
					? " atingida."
					: ` · faltam ${metaBrasilTecpar.falta.toLocaleString("pt-BR")} O.S.`}
			</div>

			<div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
				<div>
					<p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
						Meta diaria
					</p>
					<p className="text-base font-bold text-gray-900">
						{metaDiaria}{" "}
						<span className="text-[11px] font-normal text-gray-400">
							O.S/dia
						</span>
					</p>
				</div>
				<div>
					<p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
						Ritmo atual
					</p>
					<p
						className={`text-base font-bold ${ritmoAtual >= metaDiaria ? "text-green-600" : "text-red-500"}`}
					>
						{ritmoAtual}{" "}
						<span className="text-[11px] font-normal text-gray-400">
							O.S/dia
						</span>
					</p>
				</div>
				<div>
					<p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
						Saldo do mes
					</p>
					<p
						className={`text-base font-bold ${saldoMesAtual >= 0 ? "text-green-600" : "text-red-500"}`}
					>
						{saldoMesAtual >= 0 ? `+${saldoMesAtual}` : saldoMesAtual}
					</p>
				</div>
				<div>
					<p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
						Dias uteis/mes
					</p>
					<p className="text-base font-bold text-gray-900">
						{diasUteis}{" "}
						<span className="text-[11px] font-normal text-gray-400">dias</span>
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 mt-1 text-xs">
				<div className="flex items-start gap-2">
					<div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center mt-0.5">
						<Users size={14} className="text-orange-500" />
					</div>
					<div className="min-w-0">
						<p className="text-[11px] text-gray-400 font-semibold uppercase">
							Top tecnico
						</p>
						<p className="text-xs font-semibold text-gray-900 truncate">
							{topTec?.name ?? "—"}
						</p>
						<p className="text-[11px] text-gray-500">
							{topTec ? `${topTec.total} O.S` : "Sem dados"}
						</p>
					</div>
				</div>
				<div className="flex items-start gap-2">
					<div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center mt-0.5">
						<MapPin size={14} className="text-green-500" />
					</div>
					<div className="min-w-0">
						<p className="text-[11px] text-gray-400 font-semibold uppercase">
							Top regional
						</p>
						<p className="text-xs font-semibold text-gray-900 truncate">
							{topReg?.name ?? "—"}
						</p>
						<p className="text-[11px] text-gray-500">
							{topReg ? `${topReg.total} O.S` : "Sem dados"}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default MetasDashboardWidget;
