import { Archive, Layers3 } from "lucide-react";
import { useMemo, useState } from "react";
import MelzFooter from "../../components/layout/MelzFooter";
import { resolveVpsDate } from "../../services/vpsDate";
import MapaAgentes from "../Mapa/components/MapaAgentes";
import MapaFiltros from "../Mapa/components/MapaFiltros";
import MapaGrafico from "../Mapa/components/MapaGrafico";
import MapaHeader from "../Mapa/components/MapaHeader";
import MapaLegadoPanel from "../Mapa/components/MapaLegadoPanel";
import MapaRegionais from "../Mapa/components/MapaRegionais";
import RankingAgentes from "../Mapa/components/RankingAgentes";
import RankingRegionais from "../Mapa/components/RankingRegionais";
import { useMapaLegado } from "../Mapa/hooks/useMapaLegado";
import { buildEmptyPublicMapaSnapshot } from "../Mapa/utils/mapaUtils";
import PainelMapaNav from "./components/PainelMapaNav";
import PublicPageLoading from "./components/PublicPageLoading";
import { useMapaOS } from "./hooks/useMapaOS";

function resolveSnapshotByFilter(summaryBase, filtroData, lastUpdate) {
	if (filtroData === "tudo") return summaryBase;

	const rawDate = resolveVpsDate(lastUpdate);

	if (!rawDate || Number.isNaN(rawDate.getTime())) {
		return buildEmptyPublicMapaSnapshot();
	}

	const agora = new Date();
	const hojeInicio = new Date(
		agora.getFullYear(),
		agora.getMonth(),
		agora.getDate(),
	);

	if (filtroData === "hoje") {
		return rawDate >= hojeInicio ? summaryBase : buildEmptyPublicMapaSnapshot();
	}

	if (filtroData === "7dias") {
		const limite = new Date(hojeInicio);
		limite.setDate(limite.getDate() - 6);
		return rawDate >= limite ? summaryBase : buildEmptyPublicMapaSnapshot();
	}

	if (filtroData === "mes") {
		const mesmoMes =
			rawDate.getFullYear() === agora.getFullYear() &&
			rawDate.getMonth() === agora.getMonth();
		return mesmoMes ? summaryBase : buildEmptyPublicMapaSnapshot();
	}

	return summaryBase;
}

function ViewTab({ active, onClick, icon, label, helper }) {
	const IconComponent = icon;

	return (
		<button
			type="button"
			onClick={onClick}
			className={`min-w-0 rounded-2xl border px-4 py-3 text-left transition-all ${
				active
					? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm"
					: "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50"
			}`}
		>
			<div className="flex items-center gap-2 text-sm font-bold">
				<IconComponent size={16} />
				<span>{label}</span>
			</div>
			<div className="mt-1 text-xs opacity-80">{helper}</div>
		</button>
	);
}

export default function MapaPublicoPage() {
	const { allData, lastUpdate: ultimaAtualizacao, loading } = useMapaOS(true);
	const legado = useMapaLegado(true);
	const [filtroData, setFiltroData] = useState("tudo");
	const [alertaThreshold, setAlertaThreshold] = useState(50);
	const [activeView, setActiveView] = useState("abertas");

	const summaryBase = useMemo(() => {
		return allData?.Janeiro?.summary || buildEmptyPublicMapaSnapshot();
	}, [allData]);

	const summary = useMemo(
		() => resolveSnapshotByFilter(summaryBase, filtroData, ultimaAtualizacao),
		[filtroData, summaryBase, ultimaAtualizacao],
	);

	const isLegacyView = activeView === "legado";

	return (
		<div
			style={{ minHeight: "100vh", background: "#f8fafc", overflowX: "hidden" }}
		>
			<div className="mx-auto w-full max-w-[1400px] min-w-0 px-3 py-4 sm:px-6 sm:py-6">
				<PainelMapaNav current="mapa" />

				<div className="mb-6 grid min-w-0 gap-3 md:grid-cols-2">
					<ViewTab
						active={!isLegacyView}
						onClick={() => setActiveView("abertas")}
						icon={Layers3}
						label="Mapa Atual"
						helper="Ordens em aberto da carga principal, com filtros por periodo."
					/>
					<ViewTab
						active={isLegacyView}
						onClick={() => setActiveView("legado")}
						icon={Archive}
						label="Acervo Legado"
						helper="Ordens anteriores a 31/12/2025, com mapa separado para acompanhar o passivo antigo."
					/>
				</div>

				{isLegacyView ? (
					<MapaLegadoPanel
						summary={legado.summary}
						meta={legado.meta}
						loading={legado.loading}
					/>
				) : (
					<>
						<MapaHeader
							ordens={[]}
							ultimaAtualizacao={ultimaAtualizacao}
							kpisOverride={summary.kpis}
						/>

						<MapaFiltros
							filtroData={filtroData}
							setFiltroData={setFiltroData}
							alertaThreshold={alertaThreshold}
							setAlertaThreshold={setAlertaThreshold}
							ordens={[]}
							disableMapa
						/>

						{loading ? (
							<PublicPageLoading
								title="Carregando mapa"
								description="Estamos lendo as ordens em aberto e montando a visão do mapa para você."
							/>
						) : summary.totalOrdens === 0 ? (
							<div className="flex flex-col items-center justify-center py-20 text-center">
								<span className="text-5xl mb-4">Mapa</span>
								<p className="text-gray-600 font-semibold text-base">
									{summaryBase.totalOrdens > 0
										? "Nenhuma O.S no período selecionado"
										: "Nenhuma O.S em aberto"}
								</p>
								<p className="text-gray-400 text-sm mt-1">
									{summaryBase.totalOrdens > 0
										? "Tente outro filtro de data"
										: "Não há O.S para exibir"}
								</p>
							</div>
						) : (
							<>
								<MapaGrafico seriesOverride={summary.chartRegionais} />

								<div className="mb-8 flex min-w-0 flex-wrap gap-4">
									<RankingRegionais
										rankingOverride={summary.rankingRegionais}
									/>
									<RankingAgentes rankingOverride={summary.rankingAgentes} />
								</div>

								<div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
									<MapaRegionais
										ordens={[]}
										dataOverride={summary.regionais}
										alertaThreshold={alertaThreshold}
									/>
									<MapaAgentes
										ordens={[]}
										dataOverride={summary.agentes}
										alertaThreshold={alertaThreshold}
									/>
								</div>
							</>
						)}
					</>
				)}
			</div>
			<MelzFooter />
		</div>
	);
}
