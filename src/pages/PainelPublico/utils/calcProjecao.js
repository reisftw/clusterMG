import { buscarFeriadosNacionais } from './feriados';
import { diasUteisDoMes, isDiaUtil } from './diasUteis';
import { buildMetasProjection } from '../../../utils/metasProjection';

export async function calcSaldoDiario(d, month) {
  const feriadosSet = await buscarFeriadosNacionais(2026);
  const duMes = diasUteisDoMes(month, feriadosSet);
  const metaDiaria = duMes > 0 ? Math.ceil(d.meta / duMes) : 0;

  const raw = d.rawDays || [];
  let lastActive = 0;
  raw.forEach((r, i) => { if (r.totalDia > 0) lastActive = i; });
  const dias = raw.slice(0, lastActive + 1);

  let saldoMes = 0;
  const lista = dias.map(r => {
    const util = isDiaUtil(month, r.dia, feriadosSet);
    const metaDoDia = util ? metaDiaria : 0;
    const saldoDia = r.totalDia - metaDoDia;
    saldoMes += saldoDia;
    return { ...r, util, metaDia: metaDoDia, saldoDia, saldoMes };
  });

  return { lista, duMes, metaDiaria, feriadosSet };
}

export async function calcProjecao(d, month) {
  const { lista, duMes, feriadosSet } = await calcSaldoDiario(d, month);
  const projection = buildMetasProjection({
    month,
    saldoDiario: lista,
    totalOS: d.totalOS,
    meta: d.meta,
    cancelamentos: d.cancelamentos,
    feriadosSet,
  });
  if (!projection) return null;

  return {
    mediaDiaria: Number(projection.ritmoAtual || 0).toFixed(1),
    diasTrabalhados: projection.diasAmostra,
    diasUteisRestantes: projection.diasUteisRestantes,
    duMes,
    projecaoFinal: projection.projecaoFinal,
    pctProjecao: projection.pctProjecaoMeta,
    pctProjecaoCancelamentos: projection.pctProjecaoCancelamentos,
    totalRealizado: Number(d.totalOS),
    meta: d.meta,
    ultimoDia: projection.ultimoDiaComDados,
    totalDiasNoMes: projection.totalDiasNoMes,
    feriadosSet,
    projecaoPorDia: projection.projecaoPorDia,
  };
}
