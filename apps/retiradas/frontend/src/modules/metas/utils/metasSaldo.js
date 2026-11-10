import { isDiaUtil } from "../../../utils/diaUtil";
import { buildMetaDiariaSchedule } from "../../../utils/metasProjection";

/**
 * Recalcula a meta diaria e o saldo acumulado do mes usando a mesma regra
 * de dias uteis em todos os pontos da UI.
 *
 * @param {object|null|undefined} dados
 * @param {Iterable<string>|null|undefined} feriadosSet
 * @param {number} [ano]
 * @returns {{
 *   diasUteis: number,
 *   metaDiaria: number,
 *   saldoDiario: Array<object>,
 *   saldoFinal: number,
 * }}
 */
export function recalcularSaldoDiario(
	dados,
	feriadosSet = new Set(),
	ano = new Date().getFullYear(),
) {
	const mes = dados?.mes;
	const meta = Number(dados?.meta || 0);
	const { diasUteis, metaDiariaMedia, metaPorDia, metaAcumuladaPorDia } = mes
		? buildMetaDiariaSchedule({ month: mes, meta, feriadosSet, year: ano })
		: {
				diasUteis: 0,
				metaDiariaMedia: 0,
				metaPorDia: new Map(),
				metaAcumuladaPorDia: new Map(),
			};
	const metaDiaria = Math.ceil(metaDiariaMedia);

	if (!Array.isArray(dados?.saldoDiario) || dados.saldoDiario.length === 0) {
		return {
			diasUteis,
			metaDiaria,
			saldoDiario: [],
			saldoFinal: 0,
		};
	}

	let linhasComMovimento = dados.saldoDiario
		.filter((row) => Number(row?.totalDia || 0) > 0)
		.map((row) => ({ ...row }));

	if (linhasComMovimento.length === 0) {
		return {
			diasUteis,
			metaDiaria,
			saldoDiario: [],
			saldoFinal: 0,
		};
	}

	const temTotalOficial = ![null, undefined, ""].includes(dados?.totalOS);
	const totalOficial = Number(dados?.totalOS);
	const totalDiario = linhasComMovimento.reduce(
		(total, row) => total + Number(row?.totalDia || 0),
		0,
	);
	let diferenca = temTotalOficial && Number.isFinite(totalOficial)
		? totalOficial - totalDiario
		: 0;

	if (diferenca > 0) {
		const ultimaLinha = linhasComMovimento.at(-1);
		ultimaLinha.totalDia = Number(ultimaLinha.totalDia || 0) + diferenca;
	} else if (diferenca < 0) {
		for (
			let index = linhasComMovimento.length - 1;
			index >= 0 && diferenca < 0;
			index -= 1
		) {
			const totalDia = Number(linhasComMovimento[index].totalDia || 0);
			const desconto = Math.min(totalDia, Math.abs(diferenca));
			linhasComMovimento[index].totalDia = totalDia - desconto;
			diferenca += desconto;
		}
		linhasComMovimento = linhasComMovimento.filter(
			(row) => Number(row.totalDia || 0) > 0,
		);
	}

	let saldoMes = 0;
	const saldoDiario = linhasComMovimento.map((row) => {
		const dia = Number(row?.dia || 0);
		const totalDia = Number(row?.totalDia || 0);
		const util = isDiaUtil(mes, dia, feriadosSet, ano);
		const metaDia = util ? metaPorDia.get(dia) || 0 : 0;
		const saldoDia = totalDia - metaDia;

		saldoMes += saldoDia;

		return {
			...row,
			dia,
			totalDia,
			util,
			metaDia,
			metaAcumulada: metaAcumuladaPorDia.get(dia) || 0,
			saldoDia,
			saldoMes,
		};
	});

	return {
		diasUteis,
		metaDiaria,
		saldoDiario,
		saldoFinal: saldoDiario[saldoDiario.length - 1]?.saldoMes ?? 0,
	};
}
