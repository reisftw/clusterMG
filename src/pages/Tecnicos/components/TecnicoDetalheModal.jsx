import React, { useMemo, useState } from "react";
import {
  X,
  FileDown,
  Moon,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const CORES_PCT = (pct) =>
  pct >= 90 ? "#ef4444" : pct >= 70 ? "#eab308" : "#22c55e";

export default function TecnicoDetalheModal({ tecnico, onClose }) {
  const [abaAtiva, setAbaAtiva] = useState("resumo");
  const t = tecnico || {};

  const totalHorasOciosas = parseFloat(
    (
      t.diasAvaliados?.reduce((s, d) => s + (d.capacidadeRestante || 0), 0) || 0
    ).toFixed(1),
  );
  const totalHorasUsadas = parseFloat(
    (
      t.diasAvaliados?.reduce((s, d) => s + (d.horasUsadas || 0), 0) || 0
    ).toFixed(1),
  );
  const mediaOcupacao = t.diasAvaliados?.length
    ? Math.round(
        t.diasAvaliados.reduce((s, d) => s + d.pctOcupado, 0) /
          t.diasAvaliados.length,
      )
    : 0;
  const diasCheios =
    t.diasAvaliados?.filter((d) => !d.temCapacidade).length || 0;
  const diasLivres =
    t.diasAvaliados?.filter((d) => d.temCapacidade).length || 0;
  const melhorDia = [...(t.diasAvaliados || [])].sort(
    (a, b) => b.capacidadeRestante - a.capacidadeRestante,
  )[0];
  const piorDia = [...(t.diasAvaliados || [])].sort(
    (a, b) => a.capacidadeRestante - b.capacidadeRestante,
  )[0];
  const ordensFeitas = useMemo(() => t.ordensFeitas || [], [t.ordensFeitas]);

  if (!tecnico) return null;

  function exportarPDF() {
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFillColor(0, 48, 135);
    doc.rect(0, 0, 297, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Relatório do Técnico: ${t.nome}`, 14, 13);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Regional: ${t.regional || "—"}  |  Escala: ${t.escala}  |  Jornada: ${t.jornada}h  |  Deslocamento: ${t.deslocamento}h`,
      14,
      21,
    );
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 220, 21);

    doc.setFillColor(240, 243, 248);
    doc.rect(14, 35, 269, 22, "F");
    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const kpis = [
      ["Total OS", t.totalOS],
      ["OS Normais", t.totalOSNormais || 0],
      ["Retiradas", t.totalRetiradas || 0],
      ["Horas Usadas", `${totalHorasUsadas}h`],
      ["Horas Ociosas", `${totalHorasOciosas}h`],
      ["Dias Avaliados", t.diasAvaliados?.length || 0],
      ["Dias Livres", diasLivres],
      ["Média Ocupação", `${mediaOcupacao}%`],
    ];
    kpis.forEach(([label, val], i) => {
      const x = 14 + i * 34;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(label, x, 41);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.setFontSize(11);
      doc.text(String(val), x, 51);
      doc.setFontSize(9);
    });

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 48, 135);
    doc.text("Detalhe por Dia", 14, 67);

    autoTable(doc, {
      startY: 71,
      head: [
        [
          "Data",
          "Dia",
          "OS",
          "Retiradas",
          "Horas Usadas",
          "Cap. Útil",
          "Horas Ociosas",
          "Ocupação %",
          "Status",
        ],
      ],
      body: (t.diasAvaliados || []).map((d) => [
        d.data,
        d.nomeDia,
        d.os,
        d.retiradas || 0,
        `${d.horasUsadas}h`,
        `${t.capacidadeUtil}h`,
        `${d.capacidadeRestante}h`,
        `${d.pctOcupado}%`,
        d.temCapacidade ? "Disponível" : "Lotado",
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: {
        fillColor: [0, 48, 135],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      didParseCell(data) {
        if (data.column.index === 8 && data.section === "body") {
          data.cell.styles.textColor =
            data.cell.raw === "Disponível" ? [22, 163, 74] : [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 7 && data.section === "body") {
          const pct = parseInt(data.cell.raw, 10);
          data.cell.styles.textColor =
            pct >= 90
              ? [220, 38, 38]
              : pct >= 70
                ? [161, 98, 7]
                : [22, 163, 74];
          data.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: 14, right: 14 },
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i += 1) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${i} de ${totalPages} — Sistema Sempre Internet`,
        14,
        doc.internal.pageSize.height - 8,
      );
    }

    doc.save(
      `tecnico-${t.nome.replace(/ /g, "_")}-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between rounded-t-2xl border-b border-gray-100 bg-blue-600 px-6 py-5 shrink-0">
          <div>
            <h2 className="text-lg font-black text-white">{t.nome}</h2>
            <p className="mt-0.5 text-xs text-blue-200">
              {t.regional || "Sem regional"} · Escala {t.escala} · {t.jornada}
              h/dia · {t.deslocamento}h deslocamento
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportarPDF}
              className="flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/30"
            >
              <FileDown size={14} /> Exportar PDF
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-5 shrink-0 md:grid-cols-4">
          {[
            {
              icon: TrendingUp,
              label: "Total OS",
              value: t.totalOS,
              color: "text-blue-600",
            },
            {
              icon: Clock,
              label: "Horas Usadas",
              value: `${totalHorasUsadas}h`,
              color: "text-orange-600",
            },
            {
              icon: Moon,
              label: "Horas Ociosas",
              value: `${totalHorasOciosas}h`,
              color: "text-purple-600",
            },
            {
              icon: TrendingUp,
              label: "Média Ocupação",
              value: `${mediaOcupacao}%`,
              color: "text-green-600",
            },
          ].map((k) => (
            <div
              key={k.label}
              className="flex items-center gap-3 rounded-xl bg-gray-50 p-3"
            >
              <k.icon size={20} className={k.color} />
              <div>
                <p className="text-xs font-semibold text-gray-400">{k.label}</p>
                <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-5 py-3 shrink-0 md:grid-cols-4">
          {[
            {
              label: "Retiradas",
              value: t.totalRetiradas || 0,
              color: "text-indigo-600",
            },
            {
              label: "OS Normais",
              value: t.totalOSNormais || 0,
              color: "text-blue-600",
            },
            {
              label: "Dias Disponíveis",
              value: diasLivres,
              color: "text-green-600",
            },
            { label: "Dias Lotados", value: diasCheios, color: "text-red-600" },
          ].map((k) => (
            <div key={k.label} className="text-center">
              <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
              <p className="text-xs font-semibold text-gray-400">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3 shrink-0">
          <button
            onClick={() => setAbaAtiva("resumo")}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
              abaAtiva === "resumo"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Resumo diário
          </button>
          <button
            onClick={() => setAbaAtiva("ordens")}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
              abaAtiva === "ordens"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Ordens de serviço feitas
          </button>
        </div>

        {abaAtiva === "resumo" && (melhorDia || piorDia) ? (
          <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-5 py-3 shrink-0">
            {melhorDia ? (
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5">
                <CheckCircle size={16} className="shrink-0 text-green-500" />
                <div>
                  <p className="text-xs font-bold text-green-600">Melhor Dia</p>
                  <p className="text-sm font-black text-gray-900">
                    {melhorDia.data} ({melhorDia.nomeDia})
                  </p>
                  <p className="text-xs text-gray-500">
                    {melhorDia.capacidadeRestante}h livre · {melhorDia.pctOcupado}%
                    ocupado
                  </p>
                </div>
              </div>
            ) : null}
            {piorDia ? (
              <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
                <XCircle size={16} className="shrink-0 text-red-500" />
                <div>
                  <p className="text-xs font-bold text-red-600">Dia Mais Ocupado</p>
                  <p className="text-sm font-black text-gray-900">
                    {piorDia.data} ({piorDia.nomeDia})
                  </p>
                  <p className="text-xs text-gray-500">
                    {piorDia.capacidadeRestante}h livre · {piorDia.pctOcupado}%
                    ocupado
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {abaAtiva === "resumo" ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 text-xs uppercase tracking-wide text-white">
                  {[
                    "Data",
                    "Dia",
                    "OS",
                    "Retiradas",
                    "Horas Usadas",
                    "Horas Ociosas",
                    "Ocupação",
                    "Status",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(t.diasAvaliados || []).map((d, i) => (
                  <tr
                    key={d.data}
                    className={`border-b border-gray-100 ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-gray-900">
                      {d.data}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.nomeDia}</td>
                    <td className="px-4 py-3 font-black text-blue-600">{d.os}</td>
                    <td className="px-4 py-3 font-bold text-indigo-500">
                      {d.retiradas || 0}
                    </td>
                    <td className="px-4 py-3 font-semibold text-orange-600">
                      {d.horasUsadas}h
                    </td>
                    <td className="px-4 py-3 font-bold text-purple-600">
                      {d.capacidadeRestante}h
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-20 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${d.pctOcupado}%`,
                              background: CORES_PCT(d.pctOcupado),
                            }}
                          />
                        </div>
                        <span
                          className="text-xs font-bold"
                          style={{ color: CORES_PCT(d.pctOcupado) }}
                        >
                          {d.pctOcupado}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          d.temCapacidade
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {d.temCapacidade ? "Disponível" : "Lotado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : ordensFeitas.length ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 text-xs uppercase tracking-wide text-white">
                  {["Nome", "Data", "Descrição de Fechamento", "Tipo"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordensFeitas.map((ordem, i) => (
                  <tr
                    key={`${ordem.numeroOS || ordem.nome}-${i}`}
                    className={`border-b border-gray-100 ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{ordem.nome}</div>
                      {ordem.numeroOS ? (
                        <div className="text-xs text-gray-400">O.S {ordem.numeroOS}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">
                      {ordem.data}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {ordem.descricaoFechamento}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          ordem.tipo === "Retirada"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {ordem.tipo}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-gray-400">
              Nenhuma ordem feita encontrada para este técnico no mês atual.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
