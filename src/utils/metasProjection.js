import { isDiaUtil } from "./diaUtil";
import { NOMES_MESES } from "./mes";

export function buildMetaDiariaSchedule({
  month,
  meta = 0,
  feriadosSet = new Set(),
  year = new Date().getFullYear(),
}) {
  const monthIdx = NOMES_MESES.indexOf(month);
  if (monthIdx < 0) {
    return {
      totalDiasNoMes: 0,
      diasUteis: 0,
      metaDiariaMedia: 0,
      metaPorDia: new Map(),
      metaAcumuladaPorDia: new Map(),
    };
  }

  const normalizedFeriadosSet =
    feriadosSet instanceof Set ? feriadosSet : new Set(feriadosSet || []);
  const totalDiasNoMes = new Date(year, monthIdx + 1, 0).getDate();
  const diasUteisLista = [];

  for (let dia = 1; dia <= totalDiasNoMes; dia += 1) {
    if (isDiaUtil(month, dia, normalizedFeriadosSet, year)) {
      diasUteisLista.push(dia);
    }
  }

  const diasUteis = diasUteisLista.length;
  const metaMensal = Math.round(Number(meta) || 0);
  const base = diasUteis > 0 ? Math.floor(metaMensal / diasUteis) : 0;
  const resto = diasUteis > 0 ? metaMensal % diasUteis : 0;
  const metaPorDia = new Map();
  const metaAcumuladaPorDia = new Map();
  let acumulada = 0;
  let utilIndex = 0;

  for (let dia = 1; dia <= totalDiasNoMes; dia += 1) {
    let metaDia = 0;
    if (diasUteisLista.includes(dia)) {
      metaDia = base + (utilIndex < resto ? 1 : 0);
      utilIndex += 1;
    }
    acumulada += metaDia;
    metaPorDia.set(dia, metaDia);
    metaAcumuladaPorDia.set(dia, acumulada);
  }

  return {
    totalDiasNoMes,
    diasUteis,
    metaDiariaMedia: diasUteis > 0 ? metaMensal / diasUteis : 0,
    metaPorDia,
    metaAcumuladaPorDia,
  };
}

export function buildMetasProjection({
  month,
  saldoDiario = [],
  totalOS = 0,
  meta = 0,
  cancelamentos = 0,
  feriadosSet = new Set(),
  year = new Date().getFullYear(),
  projectionUntilDay = null,
  minSampleDays = 5,
  sampleSize = 10,
}) {
  if (!month || !Array.isArray(saldoDiario) || saldoDiario.length === 0) {
    return null;
  }

  const normalizedFeriadosSet =
    feriadosSet instanceof Set ? feriadosSet : new Set(feriadosSet || []);

  const saldoComUtil = saldoDiario.map((row) => ({
    ...row,
    util: isDiaUtil(month, row.dia, normalizedFeriadosSet, year),
  }));
  const cutoffDay = Number(projectionUntilDay || 0);
  const saldoAteCorte =
    cutoffDay > 0
      ? saldoComUtil.filter((row) => Number(row.dia || 0) <= cutoffDay)
      : saldoComUtil;

  const diasComProducao = saldoAteCorte.filter(
    (row) => row.util && Number(row.totalDia) > 0,
  );
  if (diasComProducao.length === 0) {
    return null;
  }

  const amostra =
    diasComProducao.length >= minSampleDays
      ? diasComProducao.slice(-sampleSize)
      : diasComProducao;

  const ritmoAtual =
    amostra.reduce((sum, row) => sum + Number(row.totalDia || 0), 0) /
    amostra.length;

  const ultimoDiaComDados = saldoAteCorte.reduce(
    (ultimoDia, row) =>
      Number(row.totalDia) > 0 ? Number(row.dia) || ultimoDia : ultimoDia,
    0,
  );
  const totalRealizado =
    cutoffDay > 0
      ? saldoAteCorte.reduce((sum, row) => sum + Number(row.totalDia || 0), 0)
      : Number(totalOS) || 0;

  const { totalDiasNoMes } = buildMetaDiariaSchedule({
    month,
    meta,
    feriadosSet: normalizedFeriadosSet,
    year,
  });

  let diasUteisRestantes = 0;
  let valorProjetado = totalRealizado;
  const projecaoPorDia = [];

  for (let dia = ultimoDiaComDados + 1; dia <= totalDiasNoMes; dia++) {
    const util = isDiaUtil(month, dia, normalizedFeriadosSet, year);
    if (util) {
      diasUteisRestantes += 1;
      valorProjetado += ritmoAtual;
    }

    projecaoPorDia.push({
      dia,
      util,
      valor: Math.round(valorProjetado),
    });
  }

  const projecaoFinal =
    projecaoPorDia.length > 0
      ? projecaoPorDia[projecaoPorDia.length - 1].valor
      : Math.round(totalRealizado);

  const pctProjecaoMeta =
    Number(meta) > 0 ? ((projecaoFinal / Number(meta)) * 100).toFixed(1) : 0;
  const pctProjecaoCancelamentos =
    Number(cancelamentos) > 0
      ? ((projecaoFinal / Number(cancelamentos)) * 100).toFixed(1)
      : 0;

  return {
    ritmoAtual: Math.round(ritmoAtual),
    diasAmostra: amostra.length,
    ultimoDiaComDados,
    diasUteisRestantes,
    projecaoFinal,
    pctProjecaoMeta,
    pctProjecaoCancelamentos,
    faltaOuSobraMeta: projecaoFinal - (Number(meta) || 0),
    bateAMeta: projecaoFinal >= (Number(meta) || 0),
    totalDiasNoMes,
    projecaoPorDia,
  };
}

/**
 * Projecao canonica exibida em /metas e reutilizada pelos demais paineis.
 * Mantem o contrato historico do resumo mensal sem duplicar a regra de calculo.
 */
export function buildMonthProjection(dados, feriadosSet = new Set()) {
  if (!dados) return null;

  const projection = buildMetasProjection({
    month: dados.mes,
    saldoDiario: dados.saldoDiario,
    totalOS: dados.totalOS,
    meta: dados.meta,
    cancelamentos: dados.cancelamentos,
    feriadosSet,
    year: Number(dados.ano || dados.year) || new Date().getFullYear(),
  });

  if (!projection) return null;

  return {
    ritmoAtual: projection.ritmoAtual,
    diasRestantes: projection.diasUteisRestantes,
    projecaoFinal: projection.projecaoFinal,
    pctProjetado: projection.pctProjecaoCancelamentos,
    bateAMeta: projection.bateAMeta,
    faltaOuSobra: projection.faltaOuSobraMeta,
    diasAmostra: projection.diasAmostra,
    ultimoDiaComDados: projection.ultimoDiaComDados,
  };
}

