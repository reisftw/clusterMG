import { buscarFeriadosNacionais } from './feriados';
import { isDiaUtil } from './diasUteis';
import { NOMES_MESES } from '../../../utils/mes';
import { buildMetaDiariaSchedule } from '../../../utils/metasProjection';

export async function calcRitmo(d, month, feriadosInput = null) {
  const year = Number(d?.ano || d?.year) || new Date().getFullYear();
  const feriadosSet =
    feriadosInput instanceof Set
      ? feriadosInput
      : Array.isArray(feriadosInput)
        ? new Set(feriadosInput)
        : await buscarFeriadosNacionais(year);
  const { metaDiariaMedia } = buildMetaDiariaSchedule({
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

  const diasComDados = raw
    .slice(0, lastActive + 1)
    .filter(r => isDiaUtil(month, r.dia, feriadosSet, year));
  if (diasComDados.length === 0) return null;

  const totalFeito = diasComDados.reduce((s, r) => s + r.totalDia, 0);
  const media = totalFeito / diasComDados.length;
  const necessario = metaDiaria;
  const ratio = necessario > 0 ? media / necessario : 1;

  const monthIdx = NOMES_MESES.indexOf(month);
  const hoje = new Date();
  const mesAtual = hoje.getMonth() === monthIdx && hoje.getFullYear() === year;

  let status = 'ok', badge = 'No Ritmo ✅';
  if (ratio < 0.75) { status = 'danger'; badge = 'Ritmo Critico 🚨'; }
  else if (ratio < 0.9) { status = 'warn'; badge = 'Atencao ⚠️'; }

  return {
    media: Math.round(media * 10) / 10,
    necessario: metaDiaria,
    ratio: Math.round(ratio * 100),
    status,
    badge,
    diasAnalisados: diasComDados.length,
    mesAtual
  };
}

