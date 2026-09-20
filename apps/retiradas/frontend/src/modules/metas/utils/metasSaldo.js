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

	const linhasComMovimento = dados.saldoDiario.filter(
		(row) => Number(row?.totalDia || 0) > 0,
	);

	if (linhasComMovimento.length === 0) {
		return {
			diasUteis,
			metaDiaria,
			saldoDiario: [],
			saldoFinal: 0,
		};
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
