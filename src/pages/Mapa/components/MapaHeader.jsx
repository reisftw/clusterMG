import React from "react";
import { calcularKPIs } from "../utils/mapaUtils";
import { resolveFirestoreDate } from "../../../services/firestoreDate";

function KPICard({ label, valor, corBorda, corTexto, sub }) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-4 flex-1 min-w-[130px] shadow-sm border-t-4"
      style={{ borderTopColor: corBorda }}
    >
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p
        className="text-3xl font-extrabold leading-none"
        style={{ color: corTexto }}
      >
        {valor.toLocaleString("pt-BR")}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function MapaHeader({
  ordens = [],
  ultimaAtualizacao,
  kpisOverride = null,
}) {
  const kpis = kpisOverride || calcularKPIs(ordens);

  const formatData = (meta) => {
    if (!meta?.data) return "Nunca atualizado";
    const d = resolveFirestoreDate(meta.data);
    if (!d) return "Nunca atualizado";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatarPeriodo = (str) =>
    new Date(str + "T12:00:00").toLocaleDateString("pt-BR");

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            🗺️ Mapa de Ordens em Aberto
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Última atualização:{" "}
            <span className="text-gray-600 font-medium">
              {formatData(ultimaAtualizacao)}
            </span>
          </p>
          {ultimaAtualizacao?.periodoInicio &&
            ultimaAtualizacao?.periodoFim && (
              <p className="text-xs text-blue-500 font-medium mt-1">
                📅 Período filtrado:{" "}
                <span className="font-bold">
                  {formatarPeriodo(ultimaAtualizacao.periodoInicio)}
                </span>{" "}
                até{" "}
                <span className="font-bold">
                  {formatarPeriodo(ultimaAtualizacao.periodoFim)}
                </span>
              </p>
            )}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <KPICard
          label="Total em Aberto"
          valor={kpis.total}
          corBorda="#3b82f6"
          corTexto="#3b82f6"
        />
        <KPICard
          label="Pendente"
          valor={kpis.pendente}
          corBorda="#a855f7"
          corTexto="#a855f7"
          sub={
            kpis.total
              ? `${((kpis.pendente / kpis.total) * 100).toFixed(1)}% do total`
              : ""
          }
        />
        <KPICard
          label="Ag. Agendamento"
          valor={kpis.aguardando}
          corBorda="#f97316"
          corTexto="#f97316"
          sub={
            kpis.total
              ? `${((kpis.aguardando / kpis.total) * 100).toFixed(1)}% do total`
              : ""
          }
        />
        <KPICard
          label="Regionais"
          valor={kpis.totalRegional}
          corBorda="#10b981"
          corTexto="#10b981"
        />
        <KPICard
          label="Ag. Autorizados"
          valor={kpis.totalAgente}
          corBorda="#f59e0b"
          corTexto="#f59e0b"
        />
      </div>
    </div>
  );
}
