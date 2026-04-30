import React, { useMemo } from "react";

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function corCelula(pct) {
  if (pct === null) return { bg: "bg-gray-100", texto: "text-gray-300" };
  if (pct >= 90) return { bg: "bg-red-500", texto: "text-white" };
  if (pct >= 70) return { bg: "bg-yellow-400", texto: "text-gray-900" };
  if (pct >= 40) return { bg: "bg-green-300", texto: "text-gray-900" };
  return { bg: "bg-green-100", texto: "text-green-800" };
}

export default function TecnicosHeatmap({ tecs }) {
  // Coleta todos os dias únicos ordenados
  const diasUnicos = useMemo(() => {
    const set = new Set();
    tecs.forEach((t) => t.diasAvaliados?.forEach((d) => set.add(d.data)));
    return [...set].sort((a, b) => {
      const [da, ma, ya] = a.split("/").map(Number);
      const [db, mb, yb] = b.split("/").map(Number);
      return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });
  }, [tecs]);

  if (!tecs.length || !diasUnicos.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800">
          🔥 Heatmap de Ocupação
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Cada célula = % de ocupação do técnico naquele dia
        </p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {[
            { bg: "bg-green-100", label: "< 40% — Muito Ocioso" },
            { bg: "bg-green-300", label: "40–70% — Parcial" },
            { bg: "bg-yellow-400", label: "70–90% — Quase cheio" },
            { bg: "bg-red-500 text-white", label: "≥ 90% — Lotado" },
            { bg: "bg-gray-100", label: "Sem dado" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${l.bg}`} />
              <span className="text-[10px] text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-bold text-gray-600 min-w-[160px] border-b border-r border-gray-200">
                Técnico
              </th>
              {diasUnicos.map((d) => {
                const [dd, mm] = d.split("/");
                const diaSem =
                  DIAS_SEMANA[
                    new Date(`20${d.split("/")[2]}-${mm}-${dd}`).getDay()
                  ];
                return (
                  <th
                    key={d}
                    className="px-1 py-2 border-b border-gray-200 min-w-[40px] text-center"
                  >
                    <div className="font-bold text-gray-700">
                      {dd}/{mm}
                    </div>
                    <div className="text-gray-400 text-[9px]">{diaSem}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tecs.map((t, ti) => {
              const mapDia = {};
              t.diasAvaliados?.forEach((d) => {
                mapDia[d.data] = d.pctOcupado;
              });
              return (
                <tr
                  key={t.nome}
                  className={ti % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-1.5 font-semibold text-gray-800 border-r border-gray-200 whitespace-nowrap">
                    {t.nome}
                  </td>
                  {diasUnicos.map((d) => {
                    const pct = mapDia[d] ?? null;
                    const { bg, texto } = corCelula(pct);
                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        <div
                          className={`w-9 h-7 mx-auto rounded flex items-center justify-center font-bold text-[10px] ${bg} ${texto}`}
                        >
                          {pct !== null ? `${pct}%` : "—"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
