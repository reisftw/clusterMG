import { useMemo, useState } from "react";
import MapaHeader from "../Mapa/components/MapaHeader";
import MapaRegionais from "../Mapa/components/MapaRegionais";
import MapaAgentes from "../Mapa/components/MapaAgentes";
import MapaFiltros from "../Mapa/components/MapaFiltros";
import MapaGrafico from "../Mapa/components/MapaGrafico";
import RankingRegionais from "../Mapa/components/RankingRegionais";
import RankingAgentes from "../Mapa/components/RankingAgentes";
import PainelMapaNav from "./components/PainelMapaNav";
import { useMapaOS } from "./hooks/useMapaOS";
import { buildEmptyPublicMapaSnapshot } from "../Mapa/utils/mapaUtils";
import { resolveFirestoreDate } from "../../services/firestoreDate";
import PublicPageLoading from "./components/PublicPageLoading";

function resolveSnapshotByFilter(summaryBase, filtroData, lastUpdate) {
  if (filtroData === "tudo") return summaryBase;

  const rawDate =
    resolveFirestoreDate(lastUpdate?.data) ||
    resolveFirestoreDate(lastUpdate);

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

export default function MapaPublicoPage() {
  const { allData, lastUpdate: ultimaAtualizacao, loading } = useMapaOS(true);
  const [filtroData, setFiltroData] = useState("tudo");
  const [alertaThreshold, setAlertaThreshold] = useState(50);

  const summaryBase = useMemo(() => {
    return allData?.Janeiro?.summary || buildEmptyPublicMapaSnapshot();
  }, [allData]);

  const summary = useMemo(
    () => resolveSnapshotByFilter(summaryBase, filtroData, ultimaAtualizacao),
    [filtroData, summaryBase, ultimaAtualizacao],
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div className="p-6 max-w-[1400px] mx-auto">
        <PainelMapaNav current="mapa" />

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
            description="Estamos lendo as ordens em aberto e montando a visao do mapa para voce."
          />
        ) : summary.totalOrdens === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">Mapa</span>
            <p className="text-gray-600 font-semibold text-base">
              {summaryBase.totalOrdens > 0
                ? "Nenhuma O.S no periodo selecionado"
                : "Nenhuma O.S em aberto"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {summaryBase.totalOrdens > 0
                ? "Tente outro filtro de data"
                : "Nao ha O.S para exibir"}
            </p>
          </div>
        ) : (
          <>
            <MapaGrafico seriesOverride={summary.chartRegionais} />

            <div className="flex gap-4 mb-8 flex-wrap">
              <RankingRegionais rankingOverride={summary.rankingRegionais} />
              <RankingAgentes rankingOverride={summary.rankingAgentes} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
      </div>
    </div>
  );
}
