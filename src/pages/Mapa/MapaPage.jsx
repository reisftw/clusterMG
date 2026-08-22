import React, { useMemo, useState } from "react";
import { Archive, FileDown, Layers3 } from "lucide-react";
import { useMapaOS } from "./hooks/useMapaOS";
import { useMatchOS } from "./hooks/useMatchOS";
import { useMapaLegado } from "./hooks/useMapaLegado";
import MapaHeader from "./components/MapaHeader";
import MapaUpload from "./components/MapaUpload";
import MatchUpload from "./components/MatchUpload";
import MapaLegadoUpload from "./components/MapaLegadoUpload";
import MapaRegionais from "./components/MapaRegionais";
import MapaAgentes from "./components/MapaAgentes";
import MapaFiltros from "./components/MapaFiltros";
import MapaGrafico from "./components/MapaGrafico";
import RankingRegionais from "./components/RankingRegionais";
import RankingAgentes from "./components/RankingAgentes";
import MapaLegadoPanel from "./components/MapaLegadoPanel";
import Spinner from "../../components/ui/Spinner";
import { gerarPDFMapa } from "./utils/mapaPDF";
import { resolveVpsDate } from "../../services/vpsDate";

function filtrarOrdensPorData(ordens, filtro) {
  if (filtro === "tudo") return ordens;
  const agora = new Date();
  const hojeInicio = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate(),
  );
  return ordens.filter((os) => {
    if (!os.atualizadoEm) return filtro === "tudo";
    const data = resolveVpsDate(os.atualizadoEm);
    if (!data) return false;
    if (filtro === "hoje") return data >= hojeInicio;
    if (filtro === "7dias") {
      const limite = new Date(hojeInicio);
      limite.setDate(limite.getDate() - 6);
      return data >= limite;
    }
    if (filtro === "mes") {
      return (
        data.getFullYear() === agora.getFullYear() &&
        data.getMonth() === agora.getMonth()
      );
    }
    return true;
  });
}

function ViewTab({ active, onClick, icon, label, helper }) {
  const IconComponent = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition-all ${
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

function MapaUploadActions({ isLegacyView, legado, mensagensMatch, ordens, ultimaAtualizacao }) {
  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <div className="flex-1 min-w-[320px]">
        <MapaUpload />
      </div>

      <div className="flex-1 min-w-[320px]">
        <MatchUpload />
      </div>

      <div className="flex-1 min-w-[320px]">
        <MapaLegadoUpload
          onConcluido={legado.refetch}
          mensagensMatch={mensagensMatch}
        />
      </div>

      {!isLegacyView && ordens.length > 0 ? (
        <button
          onClick={() => gerarPDFMapa(ordens, ultimaAtualizacao)}
          className="self-start rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <span className="flex items-center gap-2">
            <FileDown size={16} />
            Exportar Relatório
          </span>
        </button>
      ) : null}
    </div>
  );
}

function EmptyMapaState({ hasOrdens }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="mb-4 text-5xl">🗺️</span>
      <p className="text-base font-semibold text-gray-600">
        {hasOrdens ? "Nenhuma O.S no período selecionado" : "Nenhuma O.S em aberto"}
      </p>
      <p className="mt-1 text-sm text-gray-400">
        {hasOrdens ? "Tente outro filtro de data" : "Importe uma planilha para começar"}
      </p>
    </div>
  );
}

function CurrentMapaContent({ loading, ordens, ordensFiltradas, alertaThreshold }) {
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (ordensFiltradas.length === 0) {
    return <EmptyMapaState hasOrdens={ordens.length > 0} />;
  }

  return (
    <>
      <MapaGrafico ordens={ordensFiltradas} />
      <div className="mb-8 flex flex-wrap gap-4">
        <RankingRegionais ordens={ordensFiltradas} />
        <RankingAgentes ordens={ordensFiltradas} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MapaRegionais
          ordens={ordensFiltradas}
          alertaThreshold={alertaThreshold}
        />
        <MapaAgentes
          ordens={ordensFiltradas}
          alertaThreshold={alertaThreshold}
        />
      </div>
    </>
  );
}

export default function MapaPage() {
  const { ordens, ultimaAtualizacao, loading } = useMapaOS();
  const { mensagens: mensagensMatch } = useMatchOS();
  const legado = useMapaLegado(true);
  const [filtroData, setFiltroData] = useState("tudo");
  const [alertaThreshold, setAlertaThreshold] = useState(50);
  const [activeView, setActiveView] = useState("abertas");

  const ordensFiltradas = useMemo(
    () => filtrarOrdensPorData(ordens, filtroData),
    [ordens, filtroData],
  );

  const isLegacyView = activeView === "legado";

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <MapaUploadActions
        isLegacyView={isLegacyView}
        legado={legado}
        mensagensMatch={mensagensMatch}
        ordens={ordens}
        ultimaAtualizacao={ultimaAtualizacao}
      />

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <ViewTab
          active={!isLegacyView}
          onClick={() => setActiveView("abertas")}
          icon={Layers3}
          label="Mapa Atual"
          helper="Ordens em aberto da carga principal, com filtros por período."
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
            ordens={ordensFiltradas}
            ultimaAtualizacao={ultimaAtualizacao}
          />

          <MapaFiltros
            filtroData={filtroData}
            setFiltroData={setFiltroData}
            alertaThreshold={alertaThreshold}
            setAlertaThreshold={setAlertaThreshold}
            ordens={ordensFiltradas}
          />

          <CurrentMapaContent
            loading={loading}
            ordens={ordens}
            ordensFiltradas={ordensFiltradas}
            alertaThreshold={alertaThreshold}
          />
        </>
      )}
    </div>
  );
}

