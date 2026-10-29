import { useMemo, useState } from "react";
import { obterIndiceMes, obterMesAtual } from "../../../utils/mes";
import { buildMonthProjection } from "../../../utils/metasProjection";
import { getCancellationPerformance } from "../../dashboard/utils/metasMetrics";
import { METAS_RESUMO_MESES } from "../constants/metasResumoMensal.constants";
import { recalcularSaldoDiario } from "../utils/metasSaldo";

export { buildMonthProjection };

export function buildMonthDetail(mes, dados, feriadosSet) {
	if (!dados) return null;

	const meta = Number(dados.meta || 0);
	const totalOS = Number(dados.totalOS || 0);
	const performance = getCancellationPerformance(dados);
	const metaSazonal = performance.targetPercent;
	const metaModeLabel = dados.metaModeLabel || "Meta configurada";
	const faltaOS = performance.missingOS;
	const { diasUteis, saldoFinal } = recalcularSaldoDiario(
		{ ...dados, mes },
		feriadosSet,
	);
	const extraPorDiaUtil =
		faltaOS > 0 && diasUteis > 0 ? Math.ceil(faltaOS / diasUteis) : 0;
	const percentualFaltante = Number(
		performance.missingPercentagePoints.toFixed(1),
	);
	const regionaisAbaixo = (dados.regionais ?? [])
		.map((regional) => {
			const total = Number(regional.total || 0);
			return {
				name: regional.name,
				total,
				faltaMeta: Math.max(0, 110 - total),
			};
		})
		.filter((regional) => regional.faltaMeta > 0)
		.sort((a, b) => b.faltaMeta - a.faltaMeta);

	const monthIdx = obterIndiceMes(mes);
	const mesEncerrado = monthIdx >= 0 && monthIdx < new Date().getMonth();
	const atingiu = performance.achieved;

	return {
		mes,
		meta,
		totalOS,
		deliveryPercent: Number(performance.deliveredPercent.toFixed(1)),
		targetPercent: Number(performance.targetPercent.toFixed(1)),
		metaSazonal,
		metaModeLabel,
		faltaOS,
		percentualFaltante,
		diasUteis,
		extraPorDiaUtil,
		saldoFinal,
		mesEncerrado,
		atingiu,
		cancelamentos: Math.round(Number(dados.cancelamentos || 0)),
		topRegional: (dados.regionais ?? [])[0] ?? null,
		topTecnico: (dados.technicians ?? [])[0] ?? null,
		regionaisAbaixo: regionaisAbaixo.slice(0, 3),
	};
}

export function buildHistoricoAnual(allData, feriadosSet) {
	return METAS_RESUMO_MESES.map((mes) => {
		const dadosMes = allData[mes];
		const temMeta = Number(dadosMes?.meta || 0) > 0;

		if (!dadosMes || (!temMeta && Number(dadosMes?.totalOS || 0) === 0)) {
			return { mes, vazio: true };
		}

		const {
			diasUteis: diasUteisMes,
			metaDiaria,
			saldoFinal,
		} = recalcularSaldoDiario({ ...dadosMes, mes }, feriadosSet);
		const performance = getCancellationPerformance(dadosMes);

		return {
			mes,
			vazio: false,
			cancelamentos: Math.round(dadosMes.cancelamentos),
			metaSazonal: performance.targetPercent,
			metaModeLabel: dadosMes.metaModeLabel || "Meta configurada",
			meta: Math.round(dadosMes.meta),
			totalOS: Number(dadosMes.totalOS),
			falta: performance.missingOS,
			deliveryPercent: Number(
				performance.deliveredPercent.toFixed(1),
			),
			targetPercent: Number(
				performance.targetPercent.toFixed(1),
			),
			metaDiaria,
			diasUteis: diasUteisMes,
			saldoFinal,
		};
	});
}

export function useMetasResumoMensal(
	allData,
	mesSelecionado,
	feriadosSet = new Set(),
) {
	const [mesDetalhe, setMesDetalhe] = useState(null);
	const dadosMesSelecionado = allData[mesSelecionado];
	const mesAtualNome = obterMesAtual();
	const isMesAtual = mesSelecionado === mesAtualNome;
	const temMetaMesSelecionado = Number(dadosMesSelecionado?.meta || 0) > 0;

	const detalheMesSelecionado = useMemo(
		() =>
			mesDetalhe
				? buildMonthDetail(mesDetalhe, allData[mesDetalhe], feriadosSet)
				: null,
		[allData, feriadosSet, mesDetalhe],
	);

	const historico = useMemo(
		() => buildHistoricoAnual(allData, feriadosSet),
		[allData, feriadosSet],
	);

	const projecao = useMemo(
		() =>
			isMesAtual && dadosMesSelecionado?.totalOS > 0
				? buildMonthProjection(dadosMesSelecionado, feriadosSet)
				: null,
		[dadosMesSelecionado, feriadosSet, isMesAtual],
	);

	const kpis = useMemo(() => {
		if (!dadosMesSelecionado || !temMetaMesSelecionado) return [];

		const performance = getCancellationPerformance(dadosMesSelecionado);

		return [
			{
				label: "Cancelamentos",
				value: Math.round(dadosMesSelecionado.cancelamentos).toLocaleString(
					"pt-BR",
				),
				color: "bg-gray-50 border-gray-100",
				text: "text-gray-700",
			},
			{
				label: `${dadosMesSelecionado.metaModeLabel || "Meta sazonal"} ${performance.targetPercent.toFixed(1)}%`,
				value: Math.round(dadosMesSelecionado.meta).toLocaleString("pt-BR"),
				color: "bg-blue-50 border-blue-100",
				text: "text-blue-700",
			},
			{
				label: "Realizado",
				value: Number(dadosMesSelecionado.totalOS).toLocaleString("pt-BR"),
				color: "bg-orange-50 border-orange-100",
				text: "text-orange-600",
			},
			{
				label: "% entregue sobre cancelamentos",
				value: `${performance.deliveredPercent.toFixed(1)}%`,
				color:
					performance.achieved
						? "bg-green-50 border-green-100"
						: "bg-red-50 border-red-100",
				text: performance.achieved ? "text-green-700" : "text-red-600",
			},
			{
				label: "Distancia da meta",
				value: performance.achieved
					? "Atingida"
					: `${performance.missingPercentagePoints.toFixed(1)} p.p.`,
				color: performance.achieved
					? "bg-green-50 border-green-100"
					: "bg-amber-50 border-amber-100",
				text: performance.achieved ? "text-green-700" : "text-amber-700",
			},
			{
				label: "Falta",
				value:
					performance.missingOS > 0
						? performance.missingOS.toLocaleString("pt-BR")
						: "—",
				color: "bg-gray-50 border-gray-100",
				text: "text-gray-700",
			},
		];
	}, [dadosMesSelecionado, temMetaMesSelecionado]);

	return {
		dadosMesSelecionado,
		detalheMesSelecionado,
		historico,
		isMesAtual,
		kpis,
		projecao,
		setMesDetalhe,
		temMetaMesSelecionado,
	};
}
