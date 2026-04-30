import React, { useState, useMemo } from "react";
import { FileDown } from "lucide-react";
import { useMapaOS } from "./hooks/useMapaOS";
import MapaHeader from "./components/MapaHeader";
import MapaUpload from "./components/MapaUpload";
import MatchUpload from "./components/MatchUpload";
import MapaRegionais from "./components/MapaRegionais";
import MapaAgentes from "./components/MapaAgentes";
import MapaFiltros from "./components/MapaFiltros";
import MapaGrafico from "./components/MapaGrafico";
import RankingRegionais from "./components/RankingRegionais";
import RankingAgentes from "./components/RankingAgentes";
import Spinner from "../../components/ui/Spinner";
import { gerarPDFMapa } from "./utils/mapaPDF";

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
    const data = os.atualizadoEm?.toDate?.() || new Date(os.atualizadoEm);
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

export default function MapaPage() {
  const { ordens, ultimaAtualizacao, loading } = useMapaOS();
  const [filtroData, setFiltroData] = useState("tudo");
  const [alertaThreshold, setAlertaThreshold] = useState(50);

  const ordensFiltradas = useMemo(
    () => filtrarOrdensPorData(ordens, filtroData),
    [ordens, filtroData],
  );

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="min-w-[320px] flex-1">
          <MapaUpload />
        </div>

        <div className="min-w-[320px] flex-1">
          <MatchUpload />
        </div>

        {ordens.length > 0 && (
          <button
            onClick={() => gerarPDFMapa(ordens, ultimaAtualizacao)}
            className="self-start rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <span className="flex items-center gap-2">
              <FileDown size={16} />
              Exportar Relatorio
            </span>
          </button>
        )}
      </div>

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

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : ordensFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="mb-4 text-5xl">Mapa</span>
          <p className="text-base font-semibold text-gray-600">
            {ordens.length > 0
              ? "Nenhuma O.S no periodo selecionado"
              : "Nenhuma O.S em aberto"}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {ordens.length > 0
              ? "Tente outro filtro de data"
              : "Importe uma planilha para comecar"}
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
