import React, { useState } from "react";
import { X, History, ChevronDown, ChevronUp } from "lucide-react";
import { useMapaHistorico } from "../hooks/useMapaHistorico";

function formatarData(ts) {
  if (!ts) return "—";
  const d = ts.toDate?.() || new Date(ts);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarPeriodo(inicio, fim) {
  if (!inicio || !fim) return "Período não informado";
  const fmt = (s) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR");
  return `${fmt(inicio)} → ${fmt(fim)}`;
}

const CORES = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f97316",
  "#eab308",
  "#10b981",
];

function HistoricoCard({ item }) {
  const [aberto, setAberto] = useState(false);
  const regionais = Object.entries(item.totaisPorRegional || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const max = regionais[0]?.[1] || 1;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setAberto(!aberto)}
      >
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {formatarData(item.data)}
          </p>
          <p className="text-xs text-blue-500 mt-0.5">
            {formatarPeriodo(item.periodoInicio, item.periodoFim)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xl font-bold text-blue-600">
              {item.totalOS?.toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-gray-400">O.S abertas</p>
          </div>
          {aberto ? (
            <ChevronUp size={14} className="text-gray-400" />
          ) : (
            <ChevronDown size={14} className="text-gray-400" />
          )}
        </div>
      </div>

      {aberto && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            Por Regional
          </p>
          <div className="flex flex-col gap-2">
            {regionais.map(([regional, total], idx) => (
              <div key={regional} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-32 truncate shrink-0">
                  {regional}
                </span>
                <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(total / max) * 100}%`,
                      background: CORES[idx % CORES.length],
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-800 w-7 text-right shrink-0">
                  {total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapaHistoricoModal({ onClose }) {
  const { historico, loading } = useMapaHistorico();

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <History size={18} className="text-blue-500" />
            <h2 className="text-base font-bold text-gray-900">
              Histórico de Uploads
            </h2>
            <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">
              {historico.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="overflow-y-auto p-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : historico.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="text-4xl mb-3">📭</span>
              <p className="text-gray-500 font-medium text-sm">
                Nenhum histórico ainda
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Importe uma planilha para começar
              </p>
            </div>
          ) : (
            historico.map((item) => <HistoricoCard key={item.id} item={item} />)
          )}
        </div>
      </div>
    </div>
  );
}
