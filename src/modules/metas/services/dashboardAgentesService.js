import { buildCacheKey, invalidateCache } from '../../../services/dataCache';
import { deleteVpsDocument, setVpsDocument } from '../../../services/vpsApiClient';

const CITY_DISPLAY_ALIASES = {
  AGUIANIL: 'Aguanil',
};

function normalizaTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizaCidade(valor) {
  const cidade = String(valor ?? '').trim();
  if (!cidade) return '';
  return CITY_DISPLAY_ALIASES[normalizaTexto(cidade)] || cidade;
}

function deduplicarCidades(cidades = []) {
  const map = new Map();

  cidades.forEach((cidade) => {
    const nome = normalizaCidade(cidade?.cidade || cidade?.nome);
    const key = normalizaTexto(nome);
    if (!key) return;
    map.set(key, { ...cidade, cidade: nome });
  });

  return [...map.values()];
}

const MONTHORDER = [
  'Janeiro','Fevereiro','Marco','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export async function salvarDashboardAgentes(agentesData) {
  try {
    await Promise.all(
      MONTHORDER.map(async (mes) => {
        const cidades = agentesData[mes];

        if (!cidades || cidades.length === 0) {
          await deleteVpsDocument(`dashboardagentes/${mes}`).catch(() => {});
          return;
        }

        const cidadesNorm = deduplicarCidades(cidades).map((c) => ({
          nome: normalizaCidade(c.cidade),
          cancelamentos: c.cancelamentos,
          meta80: c.meta,
          realizado: c.total,
          falta: c.meta - c.total,
          pct: c.pct,
          daily: c.daily,
        }));

        const cidadesRanking = [...cidadesNorm].sort((a, b) => b.realizado - a.realizado);
        const totalRealizado = cidadesNorm.reduce((s, c) => s + c.realizado, 0);
        const totalMeta = cidadesNorm.reduce((s, c) => s + c.meta80, 0);
        const totalCancelamentos = cidadesNorm.reduce((s, c) => s + c.cancelamentos, 0);
        const totalFalta = totalMeta - totalRealizado;
        const percentAchieved = totalCancelamentos > 0
          ? parseFloat((totalRealizado / totalCancelamentos * 100).toFixed(1))
          : 0;

        const dayCount = cidadesNorm[0]?.daily?.length ?? 31;
        const totalDaily = Array.from({ length: dayCount }, (_, i) =>
          cidadesNorm.reduce((s, c) => s + (c.daily[i] || 0), 0)
        );

        await setVpsDocument(`dashboardagentes/${mes}`, {
          month: mes,
          cidades: cidadesNorm,
          cidadesRanking,
          dayCount,
          totalCancelamentos,
          totalMeta,
          totalRealizado,
          totalFalta,
          percentAchieved,
          totalDaily,
          status: percentAchieved >= 80
            ? 'Meta atingida!'
            : `Faltam ${Math.max(0, Math.round(totalFalta))} retiradas`,
          updatedAt: new Date().toISOString(),
        });
      })
    );
  } finally {
    invalidateCache(buildCacheKey(['painel-publico', 'agentes']));
    invalidateCache(buildCacheKey(['painel-publico', 'agentes', 'v2']));
  }
}

