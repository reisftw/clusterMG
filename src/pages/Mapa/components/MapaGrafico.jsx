import React, { useMemo } from "react";
import { agruparPorRegional, totalCidade } from "../utils/mapaUtils";

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

function BarraRegional({ regional, total, max, cor }) {
  const pct = max > 0 ? (total / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-gray-600 w-36 truncate shrink-0">
        {regional}
      </span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: cor }}
        />
      </div>
      <span className="text-xs font-bold text-gray-900 w-10 text-right shrink-0">
        {total}
      </span>
    </div>
  );
}

export default function MapaGrafico({ ordens = [], seriesOverride = null }) {
  const dados = useMemo(() => {
    if (Array.isArray(seriesOverride)) {
      return [...seriesOverride].sort((a, b) => b.total - a.total);
    }

    const regionais = agruparPorRegional(ordens);
    return Object.entries(regionais)
      .map(([regional, cidades]) => ({
        regional,
        total: Object.values(cidades).reduce(
          (acc, d) => acc + totalCidade(d),
          0,
        ),
      }))
      .sort((a, b) => b.total - a.total);
  }, [ordens, seriesOverride]);

  if (!dados.length) return null;
  const max = dados[0].total;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-6">
      <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">
        📊 O.S por Regional
      </h3>
      <div className="flex flex-col gap-3">
        {dados.map(({ regional, total }, idx) => (
          <BarraRegional
            key={regional}
            regional={regional}
            total={total}
            max={max}
            cor={CORES[idx % CORES.length]}
          />
        ))}
      </div>
    </div>
  );
}
