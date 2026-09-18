import { Archive } from "lucide-react";
import { useMemo } from "react";
import { buildEmptyPublicMapaSnapshot } from "../utils/mapaUtils";
import MapaAgentes from "./MapaAgentes";
import MapaGrafico from "./MapaGrafico";
import MapaHeader from "./MapaHeader";
import MapaRegionais from "./MapaRegionais";
import RankingAgentes from "./RankingAgentes";
import RankingRegionais from "./RankingRegionais";

function EmptyState({ title, description }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
			<Archive size={34} className="mb-4 text-amber-500" />
			<div className="text-lg font-bold text-gray-900">{title}</div>
			<div className="mt-2 max-w-2xl text-sm text-gray-500">{description}</div>
		</div>
	);
}

export default function MapaLegadoPanel({
	summary = null,
	meta = null,
	loading = false,
}) {
	const alertaThreshold = 50;

	const snapshot = useMemo(
		() => summary || buildEmptyPublicMapaSnapshot(),
		[summary],
	);

	if (loading) {
		return (
			<div className="flex justify-center py-20">
				<div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-amber-500" />
			</div>
		);
	}

	if (!snapshot.totalOrdens) {
		return (
			<EmptyState
				title="Nenhuma O.S legada carregada"
				description="Importe a planilha semanal do acervo antigo para montar o mapa legado."
			/>
		);
	}

	return (
		<div className="space-y-6">
			<div className="rounded-3xl border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 text-sm text-amber-900">
				<div className="flex flex-wrap items-center gap-2 text-base font-black">
					<Archive size={17} />
					<span>Acervo legado de O.S</span>
				</div>
				<div className="mt-1">
					Base separada para ordens anteriores a <strong>31/12/2025</strong>,
					atualizada por upload semanal para acompanhamento exclusivo do passivo
					antigo.
				</div>
			</div>

			<MapaHeader
				ordens={[]}
				ultimaAtualizacao={meta}
				kpisOverride={snapshot.kpis}
				titleOverride="Mapa do Acervo Legado"
				totalLabel="Total no Acervo"
			/>

			<MapaGrafico seriesOverride={snapshot.chartRegionais} />

			<div className="flex flex-wrap gap-4">
				<RankingRegionais rankingOverride={snapshot.rankingRegionais} />
				<RankingAgentes rankingOverride={snapshot.rankingAgentes} />
			</div>

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
				<MapaRegionais
					ordens={[]}
					dataOverride={snapshot.regionais}
					alertaThreshold={alertaThreshold}
				/>
				<MapaAgentes
					ordens={[]}
					dataOverride={snapshot.agentes}
					alertaThreshold={alertaThreshold}
				/>
			</div>
		</div>
	);
}
