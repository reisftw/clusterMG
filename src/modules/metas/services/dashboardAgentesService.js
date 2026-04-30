import { db } from '../../../services/firebase';
import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { buildCacheKey, invalidateCache } from '../../../services/firestoreCache';

const MONTHORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export async function salvarDashboardAgentes(agentesData) {
  try {
    await Promise.all(
      MONTHORDER.map(async (mes) => {
        const cidades = agentesData[mes];
        const ref = doc(collection(db, 'dashboardagentes'), mes);

        if (!cidades || cidades.length === 0) {
          await deleteDoc(ref).catch(() => {});
          return;
        }

        // Normaliza shape para o formato que o index.html espera
        const cidadesNorm = cidades.map(c => ({
          nome:           c.cidade,
          cancelamentos:  c.cancelamentos,
          meta80:         c.meta,
          realizado:      c.total,
          falta:          c.meta - c.total,
          pct:            c.pct,
          daily:          c.daily,
        }));

        const cidadesRanking = [...cidadesNorm].sort((a, b) => b.realizado - a.realizado);

        const totalRealizado     = cidadesNorm.reduce((s, c) => s + c.realizado, 0);
        const totalMeta          = cidadesNorm.reduce((s, c) => s + c.meta80, 0);
        const totalCancelamentos = cidadesNorm.reduce((s, c) => s + c.cancelamentos, 0);
        const totalFalta         = totalMeta - totalRealizado;
        const percentAchieved    = totalCancelamentos > 0
          ? parseFloat((totalRealizado / totalCancelamentos * 100).toFixed(1))
          : 0;

        // totalDaily: soma dos dias de todas as cidades
        const dayCount = cidadesNorm[0]?.daily?.length ?? 31;
        const totalDaily = Array.from({ length: dayCount }, (_, i) =>
          cidadesNorm.reduce((s, c) => s + (c.daily[i] || 0), 0)
        );

        await setDoc(ref, {
          month:            mes,
          cidades:          cidadesNorm,
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
