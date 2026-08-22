import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { agruparPorAgente, totalCidade } from "../utils/mapaUtils";
import { formatarAgenteWhatsapp } from "../utils/mapaWhatsapp";
import MapaCidadeDrawer from "./MapaCidadeDrawer";

function getHeatColor(total, max) {
  if (max === 0) return "#f3f4f6";
  const r = total / max;
  if (r >= 0.75) return "#fff7ed";
  if (r >= 0.5) return "#fffbeb";
  if (r >= 0.25) return "#fefce8";
  return "#f0fdf4";
}

function TipoBadge({ tipo, qtd, status }) {
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
        status === "pendente"
          ? "bg-purple-50 text-purple-700 border-purple-200"
          : "bg-orange-50 text-orange-700 border-orange-200"
      }`}
    >
      {tipo}: {qtd}
    </span>
  );
}

function AgenteCard({ cidade, data, maxTotal, alertaThreshold, onDrillDown }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const total = totalCidade(data);
  const pendentes = Object.values(data.pendente || {}).reduce(
    (a, b) => a + b,
    0,
  );
  const aguardando = Object.values(data.aguardando || {}).reduce(
    (a, b) => a + b,
    0,
  );
  const isAlerta = alertaThreshold > 0 && total >= alertaThreshold;

  return (
    <div
      className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-3"
      style={{ background: getHeatColor(total, maxTotal) }}
    >
      <div
        onClick={() => setAberto(!aberto)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setAberto(!aberto);
          }
        }}
        role="button"
        tabIndex={0}
        className="flex justify-between items-center px-5 py-4 cursor-pointer hover:brightness-95 transition-all"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-500 text-sm">🤝</span>
          <span
            className="text-sm font-bold text-gray-800 hover:text-amber-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onDrillDown(cidade, data);
            }}
          >
            {cidade}
          </span>
          {data.regional && (
            <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
              {data.regional}
            </span>
          )}
          {isAlerta && (
            <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              <AlertTriangle size={10} /> Critico
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-extrabold text-amber-500">
            {total} O.S
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(
                formatarAgenteWhatsapp(cidade, data),
              );
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-all ${
              copiado
                ? "bg-green-50 text-green-600 border border-green-200"
                : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200"
            }`}
          >
            {copiado ? <Check size={12} /> : <Copy size={12} />}
            {copiado ? "Copiado!" : "Copiar"}
          </button>
          {aberto ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </div>

      {aberto && (
        <div className="border-t border-gray-100 px-5 py-3 flex flex-col gap-2 bg-white/60">
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(data.pendente || {}).map(([t, q]) => (
              <TipoBadge key={`p-${t}`} tipo={t} qtd={q} status="pendente" />
            ))}
            {Object.entries(data.aguardando || {}).map(([t, q]) => (
              <TipoBadge key={`a-${t}`} tipo={t} qtd={q} status="aguardando" />
            ))}
          </div>
          <div className="flex gap-4 mt-1">
            {pendentes > 0 && (
              <span className="text-xs text-purple-600 font-semibold">
                🟣 Pendente: {pendentes}
              </span>
            )}
            {aguardando > 0 && (
              <span className="text-xs text-orange-500 font-semibold">
                🟠 Ag. Agendamento: {aguardando}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapaAgentes({
  ordens = [],
  alertaThreshold,
  dataOverride = null,
}) {
  const [drawer, setDrawer] = useState(null);

  const agrupado = dataOverride || agruparPorAgente(ordens);
  const agentesOrdenados = Object.entries(agrupado).sort(
    (a, b) => totalCidade(b[1]) - totalCidade(a[1]),
  );
  const maxTotal = totalCidade(agentesOrdenados[0]?.[1] || {});

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
        🤝 Agentes Autorizados
      </h3>
      {agentesOrdenados.map(([cidade, data]) => (
        <AgenteCard
          key={cidade}
          cidade={cidade}
          data={data}
          maxTotal={maxTotal}
          alertaThreshold={alertaThreshold}
          onDrillDown={(c, d) =>
            setDrawer({ cidade: c, data: d, tipo: "agente" })
          }
        />
      ))}
      {agentesOrdenados.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-10">
          Nenhuma O.S de agente autorizado encontrada
        </p>
      )}
      {drawer && (
        <MapaCidadeDrawer {...drawer} onClose={() => setDrawer(null)} />
      )}
    </div>
  );
}

