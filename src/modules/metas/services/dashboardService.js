import { buildCacheKey, invalidateCache } from "../../../services/dataCache";
import {
	deleteVpsDocument,
	setVpsDocument,
} from "../../../services/vpsApiClient";

const MONTHORDER = [
	"Janeiro",
	"Fevereiro",
	"Marco",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

export async function salvarDashboard(allParsed) {
	try {
		await Promise.all(
			MONTHORDER.map(async (mes) => {
				const d = allParsed[mes];
				const manterMesSemLancamentosComMeta =
					d &&
					d.planilhaCarregada === true &&
					Number(d.totalOS) === 0 &&
					Number(d.meta) > 0;
				const manterMesComOnnet =
					Number(d?.onnet?.totalOS || 0) > 0 ||
					Number(d?.onnet?.meta || 0) > 0 ||
					Number(d?.onnetSempre?.totalOS || 0) > 0 ||
					Number(d?.onnetSempre?.meta || 0) > 0;

				if (
					!d ||
					(Number(d.totalOS) === 0 &&
						!manterMesSemLancamentosComMeta &&
						!manterMesComOnnet)
				) {
					await deleteVpsDocument(`dashboard/${mes}`).catch(() => {});
					return;
				}

				const rawDays = d.saldoDiario.map((s) => ({
					dia: s.dia,
					equipe: s.equipe,
					agente: s.agente,
					loja: s.loja,
					regionais: s.regionais,
					totalDia: s.totalDia,
				}));

				await setVpsDocument(`dashboard/${mes}`, {
					month: mes,
					meta: d.meta,
					totalOS: d.totalOS,
					cancelamentos: d.cancelamentos,
					percentAchieved: String(d.percentAchieved),
					status: d.status,
					planilhaCarregada: d.planilhaCarregada === true,
					temLancamentos: d.temLancamentos === true,
					technicians: d.technicians,
					regionais: d.regionais,
					agenteTotal: d.agenteTotal,
					lojaTotal: d.lojaTotal,
					onnet: d.onnet || null,
					onnetSempre: d.onnetSempre || null,
					saldoDiario: d.saldoDiario,
					rawDays,
					updatedAt: new Date().toISOString(),
				});
			}),
		);
	} finally {
		invalidateCache(buildCacheKey(["painel-publico", "retiradas"]));
		invalidateCache(buildCacheKey(["painel-publico", "retiradas", "v2"]));
	}
}
