import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, X, ChevronDown, ChevronUp, FileDown } from "lucide-react";
import {
  calcularCapacidade,
  detectarColunaTecnico,
  extrairNumOS,
} from "../utils/calcularCapacidade";

export default function TecnicosAnalise({ tecnicos, analises, onIrHistorico }) {
  const [fila, setFila] = useState([]);
  const [processando, setProcessando] = useState(false);
  const [step, setStep] = useState("");
  const [resultado, setResultado] = useState(null);
  const [expandidos, setExpandidos] = useState({});
  const inputRef = useRef();

  function adicionarArquivos(files) {
    const novos = Array.from(files).filter(
      (f) => !fila.find((a) => a.nome === f.name),
    );
    setFila((prev) => [
      ...prev,
      ...novos.map((f) => ({ file: f, nome: f.name, tamanho: f.size })),
    ]);
  }

  function remover(i) {
    setFila((prev) => prev.filter((_, idx) => idx !== i));
  }

  function toggleExpandir(nome) {
    setExpandidos((prev) => ({ ...prev, [nome]: !prev[nome] }));
  }

  async function processar() {
    if (!fila.length) return;
    setProcessando(true);
    try {
      let todasLinhas = [];

      for (let i = 0; i < fila.length; i++) {
        setStep(`Lendo ${fila[i].nome} (${i + 1}/${fila.length})...`);
        const buf = await fila[i].file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        rows.forEach((r) => {
          r._arquivo = fila[i].nome;
        });
        todasLinhas = todasLinhas.concat(rows);
      }

      setStep("Verificando OS já existentes...");
      const idsExistentes = await analises.buscarNumsOSExistentes();

      // Filtra apenas OS de técnicos cadastrados
      const tecCol = detectarColunaTecnico(todasLinhas);
      const osFiltradas = todasLinhas.filter((r) => {
        const nome = String(r[tecCol] || "")
          .trim()
          .split(",")[0]
          .trim()
          .toLowerCase();
        return Object.values(tecnicos).some((t) => {
          const n = t.nome.toLowerCase();
          return nome.includes(n) || n.includes(nome);
        });
      });

      if (osFiltradas.length === 0) {
        alert(
          "Nenhuma OS encontrada para os técnicos cadastrados. Verifique se os nomes batem.",
        );
        setProcessando(false);
        return;
      }

      // Deduplicação
      const osNovas = osFiltradas.filter((r) => {
        const num = extrairNumOS(r);
        return num && !idsExistentes.has(num);
      });

      if (osNovas.length > 0) {
        setStep(`Salvando ${osNovas.length} OS novas...`);
        await analises.salvarOSNovas(osNovas);
      } else {
        setStep("Nenhuma OS nova — carregando acumulado...");
      }

      setStep("Carregando histórico completo...");
      const todasAcumuladas = await analises.carregarTodasOS();

      setStep("Calculando capacidade...");
      const calc = calcularCapacidade(todasAcumuladas, tecnicos);

      const payload = {
        ...calc,
        arquivos: fila.map((f) => f.nome),
        totalOS: todasAcumuladas.length,
        dataISO: new Date().toISOString(),
        dataLabel: new Date().toLocaleString("pt-BR"),
      };

      setStep("Salvando análise...");
      await analises.salvarAnalise(payload);

      setResultado(payload);
      setFila([]);
    } catch (e) {
      console.error(e);
      alert("Erro ao processar: " + e.message);
    } finally {
      setProcessando(false);
      setStep("");
    }
  }

  const CORES_BARRA = (pct) =>
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="flex flex-col gap-6">
      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-4">
          📂 Importar Planilhas HubSoft
        </h3>

        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            adicionarArquivos(e.dataTransfer.files);
          }}
        >
          <Upload size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="font-semibold text-gray-700 text-sm">
            Arraste ou clique para importar
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Planilhas exportadas do HubSoft (.xlsx, .xls)
          </p>
          <p className="text-xs text-blue-500 font-semibold mt-2">
            Selecione múltiplas planilhas para análise consolidada
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => adicionarArquivos(e.target.files)}
        />

        {fila.length > 0 && (
          <div className="flex flex-col gap-2 mt-4">
            {fila.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              >
                <span className="flex-1 font-semibold text-gray-700">
                  {f.nome}
                </span>
                <span className="text-gray-400 text-xs">
                  {(f.tamanho / 1024).toFixed(1)} KB
                </span>
                <button
                  onClick={() => remover(i)}
                  className="text-red-400 hover:text-red-600"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <div className="flex gap-3 mt-2">
              <button
                onClick={processar}
                disabled={processando}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processando && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {processando ? step || "Processando..." : "Processar e Salvar"}
              </button>
              <button
                onClick={() => setFila([])}
                className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Limpar Fila
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700">
              📊 Resultado da Análise
            </h3>
            <button
              onClick={onIrHistorico}
              className="text-xs text-blue-500 font-semibold hover:underline flex items-center gap-1"
            >
              <FileDown size={13} /> Ver Histórico
            </button>
          </div>

          {/* Mini KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { l: "Técnicos", v: resultado.totalTecnicos, c: "text-blue-600" },
              {
                l: "Com Capacidade",
                v: resultado.comCapacidade,
                c: "text-green-600",
              },
              {
                l: "Sem Capacidade",
                v: resultado.semCapacidade,
                c: "text-red-600",
              },
              { l: "Total OS", v: resultado.totalOS, c: "text-orange-600" },
            ].map((k) => (
              <div key={k.l} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className={`text-2xl font-black ${k.c}`}>{k.v}</p>
                <p className="text-xs text-gray-400 uppercase">{k.l}</p>
              </div>
            ))}
          </div>

          {/* Cards dos técnicos */}
          <div className="flex flex-col gap-3">
            {resultado.resultadosTecnicos
              .sort((a, b) => b.pctOcupado - a.pctOcupado)
              .map((t) => (
                <div
                  key={t.nome}
                  className={`border rounded-xl overflow-hidden ${
                    t.temCapacidade ? "border-green-200" : "border-red-200"
                  }`}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleExpandir(t.nome)}
                  >
                    <div>
                      <p className="font-bold text-gray-900 text-sm">
                        {t.nome}
                      </p>
                      <p className="text-xs text-gray-400">
                        {t.regional || "Sem regional"} · {t.escala} ·{" "}
                        {t.jornada}h
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-black text-gray-900">
                          {t.totalOS} OS
                        </p>
                        <p className="text-xs text-gray-400">
                          {t.pctOcupado}% ocupação
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full ${
                          t.temCapacidade
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {t.temCapacidade ? "Disponível" : "Lotado"}
                      </span>
                      {expandidos[t.nome] ? (
                        <ChevronUp size={14} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </div>
                  </div>

                  {expandidos[t.nome] && t.diasAvaliados?.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                        Avaliação por Dia
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 uppercase text-[10px]">
                              {[
                                "Data",
                                "Dia",
                                "OS",
                                "Horas",
                                "Restante",
                                "Ocupação",
                                "Status",
                              ].map((h) => (
                                <th key={h} className="text-left pb-2 pr-4">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {t.diasAvaliados.map((d) => (
                              <tr
                                key={d.data}
                                className="border-t border-gray-100"
                              >
                                <td className="py-1.5 font-semibold pr-4 whitespace-nowrap">
                                  {d.data}
                                </td>
                                <td className="text-gray-500 pr-4">
                                  {d.nomeDia}
                                </td>
                                <td className="font-bold pr-4">{d.os}</td>
                                <td className="text-blue-600 pr-4">
                                  {d.horasUsadas}h
                                </td>
                                <td
                                  className={`font-bold pr-4 ${d.temCapacidade ? "text-green-600" : "text-red-600"}`}
                                >
                                  {d.capacidadeRestante}h
                                </td>
                                <td className="pr-4">
                                  <div className="flex items-center gap-1">
                                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${CORES_BARRA(d.pctOcupado)}`}
                                        style={{ width: `${d.pctOcupado}%` }}
                                      />
                                    </div>
                                    <span className="text-gray-500">
                                      {d.pctOcupado}%
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      d.temCapacidade
                                        ? "bg-green-100 text-green-700"
                                        : "bg-red-100 text-red-700"
                                    }`}
                                  >
                                    {d.temCapacidade ? "Livre" : "Cheio"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
