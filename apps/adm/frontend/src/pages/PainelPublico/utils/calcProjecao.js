import { formatarChaveFeriado } from "../../../utils/diaUtil";
import { obterIndiceMes } from "../../../utils/mes";
import {
	buildMetaDiariaSchedule,
	buildMonthProjection,
} from "../../../utils/metasProjection";
import { isDiaUtil } from "./diasUteis";
import { buscarFeriadosNacionais } from "./feriados";

function buildProjectionSeries({
	month,
	year,
	feriadosSet,
	projection,
	totalAtual,
}) {
	const monthIndex = obterIndiceMes(month);
	if (monthIndex < 0 || !projection?.diasRestantes) return [];

	const totalDiasNoMes = new Date(year, monthIndex + 1, 0).getDate();
	const startDay = Number(projection.ultimoDiaComDados || 0) + 1;
	const incremento =
		projection.diasRestantes > 0
			? (Number(projection.projecaoFinal || 0) - Number(totalAtual || 0)) /
				projection.diasRestantes
			: 0;
	let acumulado = Number(totalAtual || 0);

	const pontos = [];
	for (let dia = startDay; dia <= totalDiasNoMes; dia += 1) {
		if (!isDiaUtil(month, dia, feriadosSet, year)) continue;
		acumulado += incremento;
		pontos.push({ dia, valor: Math.round(acumulado) });
	}

	return pontos;
}

export async function calcSaldoDiario(d, month, feriadosInput = null) {
	const year = Number(d?.ano || d?.year) || new Date().getFullYear();
	const feriadosSet =
		feriadosInput instanceof Set
			? feriadosInput
			: Array.isArray(feriadosInput)
				? new Set(feriadosInput)
				: await buscarFeriadosNacionais(year);
	const {
		diasUteis: duMes,
		metaDiariaMedia,
		metaPorDia,
		metaAcumuladaPorDia,
	} = buildMetaDiariaSchedule({
		month,
		meta: d.meta,
		feriadosSet,
		year,
	});
	const metaDiaria = Math.ceil(metaDiariaMedia);

	const raw = d.rawDays || [];
	let lastActive = 0;
	raw.forEach((r, i) => {
		if (r.totalDia > 0) lastActive = i;
	});
	const dias = raw.slice(0, lastActive + 1);

	let saldoMes = 0;
	const monthIndex = obterIndiceMes(month);
	const lista = dias.map((r) => {
		const dia = Number(r.dia) || 0;
		const date = monthIndex >= 0 ? new Date(year, monthIndex, dia) : null;
		const dayOfWeek = date ? date.getDay() : -1;
		const fimDeSemana = dayOfWeek === 0 || dayOfWeek === 6;
		const feriado =
			monthIndex >= 0 &&
			feriadosSet.has(formatarChaveFeriado(monthIndex + 1, dia));
		const util = isDiaUtil(month, dia, feriadosSet, year);
		const metaDoDia = metaPorDia.get(dia) || 0;
		const saldoDia = r.totalDia - metaDoDia;
		saldoMes += saldoDia;
		return {
			...r,
			util,
			fimDeSemana,
			feriado,
			tipoDia: feriado ? "feriado" : fimDeSemana ? "fim-de-semana" : "util",
			metaDia: metaDoDia,
			metaAcumulada: metaAcumuladaPorDia.get(dia) || 0,
			saldoDia,
			saldoMes,
		};
	});

	return { lista, duMes, metaDiaria, feriadosSet };
}

export async function calcProjecao(d, month, feriadosInput = null) {
	const { lista, duMes, feriadosSet } = await calcSaldoDiario(
		d,
		month,
		feriadosInput,
	);
	const year = Number(d?.ano || d?.year) || new Date().getFullYear();
	const totalRealizado = Number(d.totalOS || 0);
	const saldoProjecao =
		Array.isArray(d?.saldoDiario) && d.saldoDiario.length
			? d.saldoDiario
			: lista;
	const projection = buildMonthProjection(
		{
			...d,
			mes: month,
			saldoDiario: saldoProjecao,
			totalOS: totalRealizado,
		},
		feriadosSet,
	);
	if (!projection) return null;

	const totalDiasNoMes = new Date(year, obterIndiceMes(month) + 1, 0).getDate();
	const projecaoPorDia = buildProjectionSeries({
		month,
		year,
		feriadosSet,
		projection,
		totalAtual: totalRealizado,
	});

	return {
		mediaDiaria: Number(projection.ritmoAtual || 0).toFixed(1),
		diasTrabalhados: projection.diasAmostra,
		diasUteisRestantes: projection.diasRestantes,
		duMes,
		projecaoFinal: projection.projecaoFinal,
		pctProjecao:
			Number(d.meta || 0) > 0
				? (
						(Number(projection.projecaoFinal || 0) / Number(d.meta || 0)) *
						100
					).toFixed(1)
				: 0,
		pctProjecaoCancelamentos: projection.pctProjetado,
		totalRealizado,
		meta: d.meta,
		ultimoDia: projection.ultimoDiaComDados,
		totalDiasNoMes,
		feriadosSet,
		projecaoPorDia,
	};
}
