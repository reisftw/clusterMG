import React from "react";
import { rankingCidadesRegionais } from "../utils/mapaUtils";

export default function RankingRegionais({ ordens = [], rankingOverride = null }) {
  const ranking = Array.isArray(rankingOverride)
    ? rankingOverride
    : rankingCidadesRegionais(ordens, 10);
  const max = ranking[0]?.total || 1;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex-1 min-w-[280px] shadow-sm">
      <h3 className="text-sm font-bold text-gray-800 mb-4">
        🏆 Top 10 Cidades — Regionais
      </h3>
      <div className="flex flex-col gap-3">
        {ranking.map((item, i) => (
          <div key={item.cidade}>
            <div className="flex justify-between mb-1">
              <span
                className={`text-sm ${i < 3 ? "text-amber-500 font-bold" : "text-gray-600"}`}
              >
                {i + 1}. {item.cidade}
              </span>
              <span className="text-sm font-bold text-blue-600">
                {item.total}
              </span>
            </div>
            <div className="bg-gray-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${(item.total / max) * 100}%`,
                  background: i < 3 ? "#f59e0b" : "#3b82f6",
                }}
              />
            </div>
          </div>
        ))}
        {ranking.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-6">
            Nenhuma O.S de regional
          </p>
        )}
      </div>
    </div>
  );
}

