import { isDiaUtil } from "../pages/PainelPublico/utils/diasUteis";
import { MONTH_ORDER } from "../pages/PainelPublico/utils/constants";

export function buildMetasProjection({
  month,
  saldoDiario = [],
  totalOS = 0,
  meta = 0,
  cancelamentos = 0,
  feriadosSet = new Set(),
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
    util: isDiaUtil(month, row.dia, normalizedFeriadosSet),
  }));

  const diasComProducao = saldoComUtil.filter(
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

  const ultimoDiaComDados = saldoComUtil.reduce(
    (ultimoDia, row) =>
      Number(row.totalDia) > 0 ? Number(row.dia) || ultimoDia : ultimoDia,
    0,
  );

  const monthIdx = MONTH_ORDER.indexOf(month);
  const year = new Date().getFullYear();
  const totalDiasNoMes =
    monthIdx >= 0 ? new Date(year, monthIdx + 1, 0).getDate() : 0;

  let diasUteisRestantes = 0;
  let valorProjetado = Number(totalOS) || 0;
  const projecaoPorDia = [];

  for (let dia = ultimoDiaComDados + 1; dia <= totalDiasNoMes; dia++) {
    const util = isDiaUtil(month, dia, normalizedFeriadosSet);
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
      : Math.round(Number(totalOS) || 0);

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
