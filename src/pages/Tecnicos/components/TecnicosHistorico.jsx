import React, { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

export default function TecnicosHistorico({ analises }) {
  const [expandidos, setExpandidos] = useState({});

  function toggle(id) {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function limparHistorico() {
    if (!confirm("Apagar todo o histórico de análises?")) return;
    await analises.limparHistorico();
  }

  async function limparOS() {
    if (!confirm("Apagar TODAS as OS acumuladas? O dashboard será zerado."))
      return;
    await analises.limparOSAcumuladas();
  }

  const { historico } = analises;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <p className="text-sm font-bold text-gray-700">
          {historico.length} análise(s) salva(s)
        </p>
        <div className="flex gap-2">
          <button
            onClick={limparOS}
            className="text-xs px-3 py-2 bg-purple-50 text-purple-700 font-semibold rounded-xl border border-purple-200 hover:bg-purple-100 transition-colors"
          >
            Zerar OS Acumuladas
          </button>
          <button
            onClick={limparHistorico}
            className="text-xs px-3 py-2 bg-red-50 text-red-600 font-semibold rounded-xl border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1"
          >
            <Trash2 size={12} /> Limpar Histórico
          </button>
        </div>
      </div>

      {historico.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="text-5xl mb-4">📭</span>
          <p className="text-gray-600 font-semibold">Nenhum histórico ainda</p>
          <p className="text-gray-400 text-sm mt-1">
            Importe uma planilha na aba "Análise de OS"
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {historico.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
            >
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggle(item.id)}
              >
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {item.dataLabel}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.arquivos?.length} planilha(s) · {item.totalOS} OS
                    acumuladas
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-3">
                    {[
                      {
                        v: item.totalTecnicos,
                        l: "Técnicos",
                        c: "text-blue-600",
                      },
                      {
                        v: item.comCapacidade,
                        l: "Com cap.",
                        c: "text-green-600",
                      },
                      {
                        v: item.semCapacidade,
                        l: "Sem cap.",
                        c: "text-red-600",
                      },
                    ].map((k) => (
                      <div key={k.l} className="text-center">
                        <p className={`text-xl font-black ${k.c}`}>{k.v}</p>
                        <p className="text-[10px] text-gray-400 uppercase">
                          {k.l}
                        </p>
                      </div>
                    ))}
                  </div>
                  {expandidos[item.id] ? (
                    <ChevronUp size={14} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={14} className="text-gray-400" />
                  )}
                </div>
              </div>

              {expandidos[item.id] && item.resultadosTecnicos?.length > 0 && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                    Técnicos nesta análise
                  </p>
                  <div className="flex flex-col gap-2">
                    {item.resultadosTecnicos
                      .sort((a, b) => b.pctOcupado - a.pctOcupado)
                      .map((t) => (
                        <div
                          key={t.nome}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="font-semibold text-gray-800 w-48 truncate">
                            {t.nome}
                          </span>
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${t.pctOcupado >= 90 ? "bg-red-500" : t.pctOcupado >= 70 ? "bg-yellow-500" : "bg-green-500"}`}
                                style={{ width: `${t.pctOcupado}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-12 text-right">
                              {t.pctOcupado}%
                            </span>
                          </div>
                          <span
                            className={`text-xs font-bold ml-3 px-2 py-0.5 rounded-full ${t.temCapacidade ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          >
                            {t.temCapacidade ? "Livre" : "Cheio"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
