import { useMemo, useState } from "react";
import { calcularMetaBrasilTecpar } from "../../../utils/brasilTecparMeta";
import { obterIndiceMes, obterMesAtual } from "../../../utils/mes";
import { buildMonthProjection } from "../../../utils/metasProjection";
import { getCancellationPercent } from "../../dashboard/utils/metasMetrics";
import { METAS_RESUMO_MESES } from "../constants/metasResumoMensal.constants";
import { recalcularSaldoDiario } from "../utils/metasSaldo";

export { buildMonthProjection };

export function buildMonthDetail(mes, dados, feriadosSet) {
	if (!dados) return null;

	const percentAchieved = Number.parseFloat(dados.percentAchieved || 0);
	const metaSazonal = Number(dados.metaSazonal ?? 80);
	const metaModeLabel = dados.metaModeLabel || "Meta sazonal";
	const meta = Number(dados.meta || 0);
	const totalOS = Number(dados.totalOS || 0);
	const metaBrasilTecpar = calcularMetaBrasilTecpar({
		cancelamentos: dados.cancelamentos,
		totalOS,
	});
	const faltaOS = Math.max(0, meta - totalOS);
	const { diasUteis, saldoFinal } = recalcularSaldoDiario(
		{ ...dados, mes },
		feriadosSet,
	);
	const extraPorDiaUtil =
		faltaOS > 0 && diasUteis > 0 ? Math.ceil(faltaOS / diasUteis) : 0;
	const percentualFaltante = Math.max(
		0,
		Number((metaSazonal - percentAchieved).toFixed(1)),
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
	const atingiu = percentAchieved >= 100;

	return {
		mes,
		meta,
		totalOS,
		percentAchieved,
		metaSazonal,
		metaModeLabel,
		metaBrasilTecpar,
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

		return {
			mes,
			vazio: false,
			cancelamentos: Math.round(dadosMes.cancelamentos),
			metaSazonal: dadosMes.metaSazonal ?? 80,
			metaModeLabel: dadosMes.metaModeLabel || "Meta sazonal",
			metaBrasilTecpar: calcularMetaBrasilTecpar({
				cancelamentos: dadosMes.cancelamentos,
				totalOS: dadosMes.totalOS,
			}),
			meta: Math.round(dadosMes.meta),
			totalOS: Number(dadosMes.totalOS),
			falta: Math.max(0, dadosMes.meta - dadosMes.totalOS),
			percentAchieved: dadosMes.percentAchieved,
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

		const percentualAtingido = Number.parseFloat(
			dadosMesSelecionado.percentAchieved,
		);
		const percentualCancelamentos = getCancellationPercent(dadosMesSelecionado);
		const metaSazonal = dadosMesSelecionado.metaSazonal ?? 80;
		const metaBrasilTecpar = calcularMetaBrasilTecpar({
			cancelamentos: dadosMesSelecionado.cancelamentos,
			totalOS: dadosMesSelecionado.totalOS,
		});

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
				label: `${dadosMesSelecionado.metaModeLabel || "Meta sazonal"} ${metaSazonal}%`,
				value: Math.round(dadosMesSelecionado.meta).toLocaleString("pt-BR"),
				color: "bg-blue-50 border-blue-100",
				text: "text-blue-700",
			},
			{
				label: "Brasil Tecpar 65%",
				value: metaBrasilTecpar.meta.toLocaleString("pt-BR"),
				color: metaBrasilTecpar.atingiu
					? "bg-green-50 border-green-100"
					: "bg-amber-50 border-amber-100",
				text: metaBrasilTecpar.atingiu ? "text-green-700" : "text-amber-700",
			},
			{
				label: "Realizado",
				value: Number(dadosMesSelecionado.totalOS).toLocaleString("pt-BR"),
				color: "bg-orange-50 border-orange-100",
				text: "text-orange-600",
			},
			{
				label: "% Atingido",
				value: `${dadosMesSelecionado.percentAchieved}%`,
				color:
					percentualAtingido >= 100
						? "bg-green-50 border-green-100"
						: "bg-red-50 border-red-100",
				text: percentualAtingido >= 100 ? "text-green-700" : "text-red-600",
			},
			{
				label: "% dos cancelamentos",
				value: `${percentualCancelamentos.toFixed(1)}%`,
				color: "bg-orange-50 border-orange-100",
				text: "text-orange-700",
			},
			{
				label: "Falta",
				value:
					Math.max(0, dadosMesSelecionado.meta - dadosMesSelecionado.totalOS) >
					0
						? Math.max(
								0,
								dadosMesSelecionado.meta - dadosMesSelecionado.totalOS,
							).toLocaleString("pt-BR")
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
