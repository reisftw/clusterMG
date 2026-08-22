import React from "react";
import { calcularKPIs } from "../utils/mapaUtils";
import { resolveVpsDate } from "../../../services/vpsDate";

function KPICard({ label, valor, corBorda, corTexto, sub }) {
  return (
    <div
      className="min-w-[130px] flex-1 rounded-2xl border border-gray-200 border-t-4 bg-white p-4 shadow-sm"
      style={{ borderTopColor: corBorda }}
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p
        className="text-3xl font-extrabold leading-none"
        style={{ color: corTexto }}
      >
        {valor.toLocaleString("pt-BR")}
      </p>
      {sub ? <p className="mt-1 text-xs text-gray-400">{sub}</p> : null}
    </div>
  );
}

export default function MapaHeader({
  ordens = [],
  ultimaAtualizacao,
  kpisOverride = null,
  titleOverride = "Mapa de Ordens em Aberto",
  totalLabel = "Total em Aberto",
}) {
  const kpis = kpisOverride || calcularKPIs(ordens);

  const formatData = (meta) => {
    const date = resolveVpsDate(meta);
    if (!date) return "Nunca atualizado";
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatarPeriodo = (value) => {
    if (!value) return "";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
  };

  return (
    <div className="mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{titleOverride}</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Última atualização:{" "}
            <span className="font-medium text-gray-600">
              {formatData(ultimaAtualizacao)}
            </span>
          </p>
          {ultimaAtualizacao?.periodoInicio && ultimaAtualizacao?.periodoFim ? (
            <p className="mt-1 text-xs font-medium text-blue-500">
              Período filtrado:{" "}
              <span className="font-bold">
                {formatarPeriodo(ultimaAtualizacao.periodoInicio)}
              </span>{" "}
              até{" "}
              <span className="font-bold">
                {formatarPeriodo(ultimaAtualizacao.periodoFim)}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <KPICard
          label={totalLabel}
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

