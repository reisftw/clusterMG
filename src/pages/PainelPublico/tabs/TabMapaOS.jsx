import { useMemo, useState } from "react";
import { FileDown, History, Lock } from "lucide-react";
import MapaHeader from "../../Mapa/components/MapaHeader";
import MapaFiltros from "../../Mapa/components/MapaFiltros";
import MapaGrafico from "../../Mapa/components/MapaGrafico";
import RankingRegionais from "../../Mapa/components/RankingRegionais";
import RankingAgentes from "../../Mapa/components/RankingAgentes";
import MapaRegionais from "../../Mapa/components/MapaRegionais";
import MapaAgentes from "../../Mapa/components/MapaAgentes";
import { buildEmptyPublicMapaSnapshot } from "../../Mapa/utils/mapaUtils";
import "./TabMapaOS.css";

function resolveSnapshotByFilter(summaryBase, filtroData, lastUpdate) {
  if (filtroData === "tudo") return summaryBase;

  const rawDate =
    lastUpdate?.data?.toDate?.() || new Date(lastUpdate?.data || lastUpdate);

  if (Number.isNaN(rawDate?.getTime?.())) {
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

function ToolbarButton({ icon, label, disabled = false }) {
  const IconComponent = icon;

  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-sm font-semibold rounded-xl shadow-sm transition-all self-start ${
        disabled
          ? "text-gray-400 cursor-not-allowed"
          : "text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
      }`}
    >
      <IconComponent size={16} />
      {label}
    </button>
  );
}

export default function TabMapaOS({ allData, month, lastUpdate }) {
  const [filtroData, setFiltroData] = useState("tudo");
  const [alertaThreshold, setAlertaThreshold] = useState(50);

  const summaryBase = useMemo(() => {
    const data = allData?.[month] || {};
    return (
      data.summary ||
      allData?.Janeiro?.summary ||
      buildEmptyPublicMapaSnapshot()
    );
  }, [allData, month]);

  const summary = useMemo(
    () => resolveSnapshotByFilter(summaryBase, filtroData, lastUpdate),
    [filtroData, lastUpdate, summaryBase],
  );

  return (
    <div className="mapa-os-root px-3 py-4 sm:p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex gap-3 flex-wrap items-stretch sm:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm text-sm text-gray-500 font-medium min-h-[44px]">
            <Lock size={16} className="text-gray-400" />
            Painel publico do mapa
          </div>
        </div>

        <ToolbarButton icon={History} label="Historico" disabled />
        <ToolbarButton icon={FileDown} label="Exportar Relatorio" disabled />
      </div>

      <MapaHeader
        ordens={[]}
        ultimaAtualizacao={lastUpdate || null}
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

      {summary.totalOrdens === 0 ? (
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
        <div className="space-y-6">
          <MapaGrafico seriesOverride={summary.chartRegionais} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
        </div>
      )}
    </div>
  );
}
