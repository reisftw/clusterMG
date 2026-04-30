import { buscarFeriadosNacionais } from './feriados';
import { diasUteisDoMes, isDiaUtil } from './diasUteis';
import { MONTH_ORDER } from './constants';

export async function calcRitmo(d, month) {
  const feriadosSet = await buscarFeriadosNacionais(2026);
  const duMes = diasUteisDoMes(month, feriadosSet);
  const metaDiaria = duMes > 0 ? Math.ceil(d.meta / duMes) : 0;

  const raw = d.rawDays || [];
  let lastActive = 0;
  raw.forEach((r, i) => { if (r.totalDia > 0) lastActive = i; });

  const diasComDados = raw.slice(0, lastActive + 1).filter(r => isDiaUtil(month, r.dia, feriadosSet));
  if (diasComDados.length === 0) return null;

  const totalFeito = diasComDados.reduce((s, r) => s + r.totalDia, 0);
  const media = totalFeito / diasComDados.length;
  const necessario = metaDiaria;
  const ratio = necessario > 0 ? media / necessario : 1;

  const monthIdx = MONTH_ORDER.indexOf(month);
  const hoje = new Date();
  const mesAtual = hoje.getMonth() === monthIdx && hoje.getFullYear() === 2026;

  let status = 'ok', badge = 'No Ritmo ✅';
  if (ratio < 0.75) { status = 'danger'; badge = 'Ritmo Crítico 🚨'; }
  else if (ratio < 0.9) { status = 'warn'; badge = 'Atenção ⚠️'; }

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