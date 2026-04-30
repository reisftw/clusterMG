import React, { useMemo } from "react";
import { Star } from "lucide-react";

function calcularIndice(t) {
  const ocupacao = Math.min(100, t.pctOcupado || 0);
  const retiradas = Math.min(100, ((t.totalRetiradas || 0) / 20) * 100);
  const diasAtivos = t.diasAvaliados?.length
    ? Math.min(100, (t.diasComCapacidade / t.diasAvaliados.length) * 100)
    : 0;
  return Math.round(ocupacao * 0.5 + retiradas * 0.3 + diasAtivos * 0.2);
}

function corIndice(v) {
  if (v >= 80)
    return {
      anel: "stroke-green-500",
      texto: "text-green-600",
      label: "Excelente",
      bg: "bg-green-50  border-green-200",
    };
  if (v >= 60)
    return {
      anel: "stroke-yellow-500",
      texto: "text-yellow-600",
      label: "Regular",
      bg: "bg-yellow-50 border-yellow-200",
    };
  if (v >= 40)
    return {
      anel: "stroke-orange-500",
      texto: "text-orange-600",
      label: "Baixo",
      bg: "bg-orange-50 border-orange-200",
    };
  return {
    anel: "stroke-red-500",
    texto: "text-red-600",
    label: "Crítico",
    bg: "bg-red-50    border-red-200",
  };
}

function GaugeCircle({ valor }) {
  const R = 28;
  const circ = 2 * Math.PI * R;
  const offset = circ - (valor / 100) * circ;
  const { anel, texto } = corIndice(valor);
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle
        cx="36"
        cy="36"
        r={R}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="7"
      />
      <circle
        cx="36"
        cy="36"
        r={R}
        fill="none"
        className={anel}
        strokeWidth="7"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="36"
        y="40"
        textAnchor="middle"
        className={`text-xs font-black fill-current ${texto}`}
        style={{ fontSize: "13px", fontWeight: 900 }}
      >
        {valor}
      </text>
    </svg>
  );
}

export default function TecnicosIndiceEficiencia({ tecs }) {
  const dados = useMemo(
    () =>
      [...tecs]
        .map((t) => ({ ...t, indice: calcularIndice(t) }))
        .sort((a, b) => b.indice - a.indice),
    [tecs],
  );

  const media = dados.length
    ? Math.round(dados.reduce((s, t) => s + t.indice, 0) / dados.length)
    : 0;

  const criticos = dados.filter((t) => t.indice < 40).length;
  const excelentes = dados.filter((t) => t.indice >= 80).length;

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "Índice Médio",
            value: `${media}/100`,
            color: "text-blue-600",
            bg: "border-blue-200 bg-blue-50",
          },
          {
            label: "Excelentes ≥80",
            value: excelentes,
            color: "text-green-600",
            bg: "border-green-200 bg-green-50",
          },
          {
            label: "Críticos < 40",
            value: criticos,
            color: "text-red-600",
            bg: "border-red-200 bg-red-50",
          },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-2xl border p-4 text-center ${k.bg}`}
          >
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
              {k.label}
            </p>
            <p className={`text-3xl font-black ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Legenda de cálculo */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-xs text-gray-500 flex flex-wrap gap-4">
        <span className="font-bold text-gray-700">Fórmula do Índice:</span>
        <span>📊 Ocupação × 50%</span>
        <span>📦 Retiradas × 30%</span>
        <span>📅 Dias com Cap. × 20%</span>
      </div>

      {/* Cards dos técnicos */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dados.map((t, i) => {
          const { texto, label, bg } = corIndice(t.indice);
          return (
            <div
              key={t.nome}
              className={`rounded-2xl border p-4 flex items-center gap-4 ${bg}`}
            >
              <div className="shrink-0">
                <GaugeCircle valor={t.indice} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-bold text-gray-900 text-sm truncate">
                    {t.nome}
                  </p>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                      t.indice >= 80
                        ? "bg-green-600 text-white"
                        : t.indice >= 60
                          ? "bg-yellow-500 text-white"
                          : t.indice >= 40
                            ? "bg-orange-500 text-white"
                            : "bg-red-600 text-white"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.regional || "Sem regional"}
                </p>
                <div className="grid grid-cols-3 gap-1 mt-2">
                  {[
                    { l: "OS", v: t.totalOS },
                    { l: "Retiradas", v: t.totalRetiradas || 0 },
                    { l: "Ocupação", v: `${t.pctOcupado}%` },
                  ].map((k) => (
                    <div
                      key={k.l}
                      className="text-center bg-white/60 rounded-lg py-1"
                    >
                      <p className="text-xs font-black text-gray-900">{k.v}</p>
                      <p className="text-[9px] text-gray-400">{k.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
