import { db } from '../../../services/firebase';
import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { buildCacheKey, invalidateCache } from '../../../services/firestoreCache';

const MONTHORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export async function salvarDashboard(allParsed) {
  try {
    await Promise.all(
      MONTHORDER.map(async (mes) => {
        const d = allParsed[mes];
        const ref = doc(collection(db, 'dashboard'), mes);

        if (!d || Number(d.totalOS) === 0) {
          await deleteDoc(ref).catch(() => {});
          return;
        }

        // rawDays: apenas os dados brutos, sem saldo (calculado no painel)
        const rawDays = d.saldoDiario.map(s => ({
          dia:       s.dia,
          equipe:    s.equipe,
          agente:    s.agente,
          loja:      s.loja,
          regionais: s.regionais,
          totalDia:  s.totalDia,
        }));

        await setDoc(ref, {
          month:            mes,
          meta:             d.meta,
          totalOS:          d.totalOS,
          percentAchieved:  String(d.percentAchieved),
          status:           d.status,
          technicians:      d.technicians,
          regionais:        d.regionais,
          agenteTotal:      d.agenteTotal,
          lojaTotal:        d.lojaTotal,
          rawDays,
          updatedAt:        new Date().toISOString(),
        });
      })
    );
  } finally {
    invalidateCache(buildCacheKey(['painel-publico', 'retiradas']));
    invalidateCache(buildCacheKey(['painel-publico', 'retiradas', 'v2']));
  }
}
