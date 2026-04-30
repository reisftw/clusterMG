import React, { useState, useMemo } from "react";
import {
  Settings,
  DollarSign,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";

const HORAS_MES = 176; // 22 dias × 8h

export default function TecnicosCustoOciosidade({ tecs, historico }) {
  const [salario, setSalario] = useState(2500);
  const [editando, setEditando] = useState(false);
  const [temp, setTemp] = useState("2500");

  const custoPorHora = salario / HORAS_MES;

  const dados = useMemo(() => {
    return tecs
      .map((t) => {
        const horasOciosas = parseFloat(
          (
            t.diasAvaliados?.reduce(
              (s, d) => s + (d.capacidadeRestante || 0),
              0,
            ) || 0
          ).toFixed(1),
        );
        const custoOcioso = parseFloat(
          (horasOciosas * custoPorHora).toFixed(2),
        );
        return { ...t, horasOciosas, custoOcioso };
      })
      .sort((a, b) => b.custoOcioso - a.custoOcioso);
  }, [tecs, custoPorHora]);

  const totalCusto = dados.reduce((s, t) => s + t.custoOcioso, 0).toFixed(2);
  const totalOciosas = dados.reduce((s, t) => s + t.horasOciosas, 0).toFixed(1);
  const piorTecnico = dados[0];

  // Evolução histórica de custo
  const evolucao = useMemo(() => {
    return [...historico].reverse().map((h) => {
      const horasTotal = (h.resultadosTecnicos || []).reduce((s, t) => {
        return (
          s +
          (t.diasAvaliados?.reduce(
            (ss, d) => ss + (d.capacidadeRestante || 0),
            0,
          ) || 0)
        );
      }, 0);
      return {
        data: h.dataLabel,
        custo: parseFloat((horasTotal * custoPorHora).toFixed(2)),
        horas: parseFloat(horasTotal.toFixed(1)),
      };
    });
  }, [historico, custoPorHora]);

  const maxCusto = Math.max(...evolucao.map((e) => e.custo), 1);

  function salvarSalario() {
    const v = parseFloat(temp.replace(",", "."));
    if (!isNaN(v) && v > 0) setSalario(v);
    setEditando(false);
  }

  function formatBRL(v) {
    return Number(v).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Config salário */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-gray-500" />
            <span className="text-sm font-bold text-gray-700">
              Configuração de Custo
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 uppercase font-bold">
                Salário médio/mês
              </span>
              {editando ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    autoFocus
                    type="number"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && salvarSalario()}
                    className="border border-blue-400 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button
                    onClick={salvarSalario}
                    className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setTemp(String(salario));
                    setEditando(true);
                  }}
                  className="mt-1 text-sm font-black text-blue-600 hover:underline text-left"
                >
                  {formatBRL(salario)} ✏️
                </button>
              )}
            </div>
            <div className="text-center px-4 py-2 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-[10px] text-gray-400 uppercase font-bold">
                Custo/hora
              </p>
              <p className="text-sm font-black text-gray-900">
                {formatBRL(custoPorHora)}
              </p>
            </div>
            <div className="text-center px-4 py-2 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-[10px] text-gray-400 uppercase font-bold">
                Base de cálculo
              </p>
              <p className="text-sm font-black text-gray-900">
                {HORAS_MES}h/mês
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs de custo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={18} className="text-red-500" />
            <p className="text-xs font-bold text-red-500 uppercase tracking-wide">
              Custo Total Ocioso
            </p>
          </div>
          <p className="text-4xl font-black text-red-600">
            {formatBRL(totalCusto)}
          </p>
          <p className="text-xs text-red-400 mt-1">
            {totalOciosas}h ociosas no período
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={18} className="text-orange-500" />
            <p className="text-xs font-bold text-orange-500 uppercase tracking-wide">
              Custo Médio por Técnico
            </p>
          </div>
          <p className="text-4xl font-black text-orange-600">
            {dados.length
              ? formatBRL((parseFloat(totalCusto) / dados.length).toFixed(2))
              : "—"}
          </p>
          <p className="text-xs text-orange-400 mt-1">
            entre {dados.length} técnicos avaliados
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-yellow-600" />
            <p className="text-xs font-bold text-yellow-600 uppercase tracking-wide">
              Maior Custo Individual
            </p>
          </div>
          <p className="text-2xl font-black text-yellow-700">
            {piorTecnico ? formatBRL(piorTecnico.custoOcioso) : "—"}
          </p>
          <p className="text-xs text-yellow-600 mt-1 font-semibold truncate">
            {piorTecnico?.nome} · {piorTecnico?.horasOciosas}h ociosas
          </p>
        </div>
      </div>

      {/* Evolução histórica */}
      {evolucao.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-4">
            📈 Evolução do Custo de Ociosidade
          </h3>
          <div className="flex items-end gap-2" style={{ height: "120px" }}>
            {evolucao.map((e, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-gray-500 whitespace-nowrap">
                  {formatBRL(e.custo)}
                </span>
                <div
                  className="w-full bg-gray-100 rounded-t overflow-hidden flex items-end"
                  style={{ height: "80px" }}
                >
                  <div
                    className="w-full bg-red-400 rounded-t transition-all"
                    style={{ height: `${(e.custo / maxCusto) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-400 text-center leading-tight whitespace-nowrap">
                  {e.data?.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranking custo por técnico */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <DollarSign size={16} className="text-red-500" />
          <h3 className="text-sm font-bold text-gray-800">
            Custo de Ociosidade por Técnico
          </h3>
          <span className="ml-auto text-xs bg-red-50 text-red-600 font-bold px-2 py-0.5 rounded-full border border-red-200">
            Total: {formatBRL(totalCusto)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white text-xs uppercase tracking-wide">
                {[
                  "#",
                  "Técnico",
                  "Regional",
                  "Horas Ociosas",
                  "Custo Ocioso",
                  "Ocupação",
                  "Impacto",
                ].map((h) => (
                  <th key={h} className="text-left px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.map((t, i) => {
                const pctImpacto =
                  totalCusto > 0
                    ? Math.round((t.custoOcioso / parseFloat(totalCusto)) * 100)
                    : 0;
                return (
                  <tr
                    key={t.nome}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-4 py-3 font-black text-gray-400 text-center">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {t.nome}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {t.regional || "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-purple-600">
                      {t.horasOciosas}h
                    </td>
                    <td className="px-4 py-3 font-black text-red-600">
                      {formatBRL(t.custoOcioso)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              t.pctOcupado >= 90
                                ? "bg-red-500"
                                : t.pctOcupado >= 70
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                            }`}
                            style={{ width: `${t.pctOcupado}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {t.pctOcupado}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-400 rounded-full"
                            style={{ width: `${pctImpacto}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-red-500">
                          {pctImpacto}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
