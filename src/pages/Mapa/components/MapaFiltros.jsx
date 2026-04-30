import React, { useState } from "react";
import { Calendar, AlertTriangle, Map } from "lucide-react";
import MapaGeoModal from "./MapaGeoModal";

const OPCOES = [
  { label: "Hoje", value: "hoje" },
  { label: "7 dias", value: "7dias" },
  { label: "Mês atual", value: "mes" },
  { label: "Tudo", value: "tudo" },
];

export default function MapaFiltros({
  filtroData,
  setFiltroData,
  alertaThreshold,
  setAlertaThreshold,
  ordens,
  disableMapa = false,
}) {
  const [mapaAberto, setMapaAberto] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <Calendar size={14} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">Período:</span>
          <div className="flex gap-1">
            {OPCOES.map((op) => (
              <button
                key={op.value}
                onClick={() => setFiltroData(op.value)}
                className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all ${
                  filtroData === op.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <AlertTriangle size={14} className="text-amber-500" />
          <span className="text-xs font-semibold text-gray-500">
            Alerta acima de:
          </span>
          <input
            type="number"
            min={1}
            value={alertaThreshold}
            onChange={(e) => setAlertaThreshold(Number(e.target.value))}
            className="w-16 text-xs font-bold text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400"
          />
          <span className="text-xs text-gray-400">O.S</span>
        </div>

        <button
          onClick={() => setMapaAberto(true)}
          disabled={disableMapa}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 shadow-sm text-xs font-semibold transition-all ${
            disableMapa
              ? "bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-600 hover:text-blue-600"
          }`}
        >
          <Map size={14} />
          {disableMapa ? "Mapa indisponivel" : "Mapa"}
        </button>
      </div>

      {mapaAberto && !disableMapa && (
        <MapaGeoModal ordens={ordens} onClose={() => setMapaAberto(false)} />
      )}
    </>
  );
}
