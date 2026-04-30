import React from "react";
import { X, MapPin, Handshake } from "lucide-react";

function TipoBadge({ tipo, qtd, status }) {
  const isPendente = status === "pendente";
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
        isPendente
          ? "bg-purple-50 text-purple-700 border-purple-200"
          : "bg-orange-50 text-orange-700 border-orange-200"
      }`}
    >
      {tipo}: {qtd}
    </span>
  );
}

export default function MapaCidadeDrawer({ cidade, data, tipo, onClose }) {
  if (!cidade || !data) return null;

  const pendentes = Object.values(data.pendente || {}).reduce(
    (a, b) => a + b,
    0,
  );
  const aguardando = Object.values(data.aguardando || {}).reduce(
    (a, b) => a + b,
    0,
  );
  const total = pendentes + aguardando;
  const isAgente = tipo === "agente";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col">
        <div
          className={`px-6 py-5 border-b border-gray-100 flex items-center justify-between ${
            isAgente ? "bg-amber-50" : "bg-blue-50"
          }`}
        >
          <div className="flex items-center gap-2">
            {isAgente ? (
              <Handshake size={18} className="text-amber-500" />
            ) : (
              <MapPin size={18} className="text-blue-500" />
            )}
            <div>
              <h3 className="font-bold text-gray-900 text-base">{cidade}</h3>
              {data.regional && (
                <p className="text-xs text-gray-400">{data.regional}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="flex gap-3 px-6 py-4 border-b border-gray-100">
          <div className="flex-1 text-center">
            <p className="text-2xl font-extrabold text-gray-900">{total}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-2xl font-extrabold text-purple-600">
              {pendentes}
            </p>
            <p className="text-xs text-gray-400">Pendente</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-2xl font-extrabold text-orange-500">
              {aguardando}
            </p>
            <p className="text-xs text-gray-400">Ag. Agend.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {Object.keys(data.pendente || {}).length > 0 && (
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-2">
                🟣 Pendente
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.pendente).map(([tipo, qtd]) => (
                  <TipoBadge
                    key={tipo}
                    tipo={tipo}
                    qtd={qtd}
                    status="pendente"
                  />
                ))}
              </div>
            </div>
          )}
          {Object.keys(data.aguardando || {}).length > 0 && (
            <div>
              <p className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-2">
                🟠 Ag. Agendamento
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.aguardando).map(([tipo, qtd]) => (
                  <TipoBadge
                    key={tipo}
                    tipo={tipo}
                    qtd={qtd}
                    status="aguardando"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
