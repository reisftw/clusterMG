import { useEffect, useState } from "react";
import { X, Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCriticidade } from "../hooks/useMetasAuditoria";

const COR_PDF = {
  green: [34, 197, 94],
  yellow: [234, 179, 8],
  orange: [249, 115, 22],
  red: [239, 68, 68],
};

function EvIcon({ atual, anterior }) {
  if (!anterior || anterior.pct === undefined)
    return <Minus size={14} className="text-gray-400" />;
  if (atual > anterior.pct)
    return <TrendingUp size={14} className="text-green-500" />;
  if (atual < anterior.pct)
    return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

const MetasAuditoriaRelatorio = ({ cidade, mes, onClose }) => {
  const [historico, setHistorico] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    const carregar = async () => {
      setLoadingHist(true);
      try {
        const { buscarHistoricoCidade } =
          await import("../services/metasAuditoriaService");
        const key = String(cidade.cidade).toUpperCase().replace(/\s+/g, "_");
        const hist = await buscarHistoricoCidade(key);
        setHistorico(hist);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingHist(false);
      }
    };
    carregar();
  }, [cidade]);

  const gerarPDF = () => {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const agente = cidade.agente;
    const crit = cidade.critica;
    const corRgb = COR_PDF[crit.cor] || COR_PDF.red;
    const now = new Date();

    // Cabeçalho
    pdf.setFillColor(30, 58, 138);
    pdf.rect(0, 0, 210, 32, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("RELATÓRIO DE AUDITORIA — AA", 14, 13);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      `Gerado em: ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR")}`,
      14,
      22,
    );
    pdf.text(`Referência: ${mes} 2026`, 14, 28);

    pdf.setFillColor(...corRgb);
    pdf.roundedRect(140, 8, 58, 18, 3, 3, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(crit.label.toUpperCase(), 169, 18, { align: "center" });

    let y = 42;

    pdf.setTextColor(30, 58, 138);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(cidade.cidade.toUpperCase(), 14, y);
    y += 8;

    autoTable(pdf, {
      startY: y,
      theme: "grid",
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9 },
      head: [["Regional", "Responsável", "Telefone", "E-mail"]],
      body: [
        [
          agente?.regional_nome ?? "—",
          agente?.responsavel?.nome ?? "—",
          agente?.responsavel?.telefone ?? "—",
          agente?.responsavel?.email || "—",
        ],
      ],
    });
    y = pdf.lastAutoTable.finalY + 8;

    pdf.setTextColor(30, 58, 138);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(`Desempenho — ${mes} 2026`, 14, y);
    y += 4;

    autoTable(pdf, {
      startY: y,
      theme: "grid",
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 10 },
      head: [
        ["Meta", "Realizado", "Cancelamentos", "Eficiência (%)", "Status"],
      ],
      body: [
        [
          cidade.meta,
          cidade.total,
          cidade.cancelamentos,
          cidade.total === 0 ? "0%" : `${cidade.pct}%`,
          crit.label,
        ],
      ],
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          data.cell.styles.textColor = corRgb;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = pdf.lastAutoTable.finalY + 10;

    if (historico.length > 0) {
      pdf.setTextColor(30, 58, 138);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Histórico de Evolução", 14, y);
      y += 4;

      const histRows = historico.map((h, i) => {
        const ant = historico[i - 1];
        const pct = h.meta > 0 ? ((h.total / h.meta) * 100).toFixed(1) : "0";
        const evo = ant
          ? (
              parseFloat(pct) -
              parseFloat(
                ant.meta > 0 ? ((ant.total / ant.meta) * 100).toFixed(1) : 0,
              )
            ).toFixed(1)
          : "—";
        return [
          h.mes,
          h.meta,
          h.total,
          h.cancelamentos,
          `${pct}%`,
          evo !== "—" ? (parseFloat(evo) > 0 ? `+${evo}pp` : `${evo}pp`) : "—",
        ];
      });

      autoTable(pdf, {
        startY: y,
        theme: "striped",
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: { fontSize: 9 },
        head: [
          ["Mês", "Meta", "Realizado", "Cancel.", "Eficiência", "Variação"],
        ],
        body: histRows,
        didParseCell: (data) => {
          if (
            data.section === "body" &&
            data.column.index === 5 &&
            data.cell.raw !== "—"
          ) {
            const val = parseFloat(data.cell.raw);
            data.cell.styles.textColor =
              val >= 0 ? [34, 197, 94] : [239, 68, 68];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });
      y = pdf.lastAutoTable.finalY + 10;
    }

    if (cidade.daily?.length > 0) {
      pdf.setTextColor(30, 58, 138);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Distribuição Diária de Retiradas", 14, y);
      y += 4;

      const diasCom = cidade.daily
        .map((v, i) => (v > 0 ? `Dia ${i + 1}: ${v}` : null))
        .filter(Boolean);

      const rows = [];
      for (let i = 0; i < diasCom.length; i += 5)
        rows.push(diasCom.slice(i, i + 5));

      autoTable(pdf, {
        startY: y,
        theme: "plain",
        bodyStyles: { fontSize: 8, textColor: [75, 85, 99] },
        body:
          rows.length > 0 ? rows : [["Nenhuma retirada registrada no mês."]],
      });
      y = pdf.lastAutoTable.finalY + 8;
    }

    if (crit.nivel === 0 && cidade.total === 0) {
      pdf.setFillColor(254, 226, 226);
      pdf.roundedRect(14, y, 182, 18, 2, 2, "F");
      pdf.setTextColor(185, 28, 28);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text("⚠ ATENÇÃO JURÍDICA", 18, y + 6);
      pdf.setFont("helvetica", "normal");
      pdf.text(
        "Esta cidade não realizou nenhuma retirada. Recomenda-se acionamento do setor jurídico.",
        18,
        y + 13,
      );
    }

    pdf.setFillColor(243, 244, 246);
    pdf.rect(0, 282, 210, 15, "F");
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      "Documento gerado automaticamente pelo sistema. Para uso interno.",
      14,
      290,
    );
    pdf.text("Página 1", 196, 290, { align: "right" });

    pdf.save(`Auditoria_${cidade.cidade.replace(/\s+/g, "_")}_${mes}_2026.pdf`);
  };

  const crit = cidade.critica;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {cidade.cidade}
            </h2>
            <p className="text-xs text-gray-400">
              {mes} 2026 — Relatório de Auditoria
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={gerarPDF}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <Download size={14} /> Exportar PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold
            ${crit.cor === "green" ? "bg-green-50 text-green-700" : ""}
            ${crit.cor === "yellow" ? "bg-yellow-50 text-yellow-700" : ""}
            ${crit.cor === "orange" ? "bg-orange-50 text-orange-700" : ""}
            ${crit.cor === "red" ? "bg-red-50 text-red-700" : ""}
          `}
          >
            {crit.label} — {cidade.total === 0 ? "0%" : `${cidade.pct}%`} de
            eficiência
            {crit.cor === "red" && cidade.total === 0 && (
              <span className="ml-2 text-xs font-normal">
                ⚠ Acionar jurídico
              </span>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">
              Dados do agente
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Regional</p>
                <p className="font-semibold text-gray-800">
                  {cidade.agente?.regional_nome ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Responsável</p>
                <p className="font-semibold text-gray-800">
                  {cidade.agente?.responsavel?.nome ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Telefone</p>
                <p className="font-semibold text-gray-800">
                  {cidade.agente?.responsavel?.telefone ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">E-mail</p>
                <p className="font-semibold text-gray-800">
                  {cidade.agente?.responsavel?.email || "—"}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">
              Desempenho — {mes}
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Meta", value: cidade.meta },
                { label: "Realizado", value: cidade.total },
                { label: "Cancelamentos", value: cidade.cancelamentos },
                {
                  label: "Eficiência",
                  value: cidade.total === 0 ? "0%" : `${cidade.pct}%`,
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="bg-gray-50 rounded-xl p-3 text-center"
                >
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-lg font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">
              Histórico de evolução
            </h3>
            {loadingHist ? (
              <p className="text-xs text-gray-400">Carregando histórico...</p>
            ) : historico.length === 0 ? (
              <p className="text-xs text-gray-400">
                Nenhum histórico registrado ainda.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {[
                      "Mês",
                      "Meta",
                      "Realizado",
                      "Cancel.",
                      "Eficiência",
                      "Variação",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-2 text-center text-gray-500 font-bold uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h, i) => {
                    const pctAtual =
                      h.meta > 0
                        ? parseFloat(((h.total / h.meta) * 100).toFixed(1))
                        : 0;
                    const ant = historico[i - 1];
                    const pctAnt =
                      ant?.meta > 0
                        ? parseFloat(((ant.total / ant.meta) * 100).toFixed(1))
                        : null;
                    const variacao =
                      pctAnt !== null ? (pctAtual - pctAnt).toFixed(1) : null;
                    const crit = getCriticidade(pctAtual, h.total);
                    return (
                      <tr key={h.mes} className="border-b border-gray-50">
                        <td className="px-2 py-2 text-center font-semibold text-gray-700">
                          {h.mes}
                        </td>
                        <td className="px-2 py-2 text-center text-gray-600">
                          {h.meta}
                        </td>
                        <td className="px-2 py-2 text-center font-bold text-gray-800">
                          {h.total}
                        </td>
                        <td className="px-2 py-2 text-center text-gray-500">
                          {h.cancelamentos}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold
                            ${crit.cor === "green" ? "bg-green-100 text-green-700" : ""}
                            ${crit.cor === "yellow" ? "bg-yellow-100 text-yellow-700" : ""}
                            ${crit.cor === "orange" ? "bg-orange-100 text-orange-700" : ""}
                            ${crit.cor === "red" ? "bg-red-100 text-red-700" : ""}
                          `}
                          >
                            {pctAtual}%
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {variacao !== null ? (
                            <span
                              className={`flex items-center justify-center gap-1 font-bold ${parseFloat(variacao) >= 0 ? "text-green-600" : "text-red-500"}`}
                            >
                              <EvIcon
                                atual={pctAtual}
                                anterior={{ pct: pctAnt }}
                              />
                              {parseFloat(variacao) > 0
                                ? `+${variacao}pp`
                                : `${variacao}pp`}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetasAuditoriaRelatorio;
