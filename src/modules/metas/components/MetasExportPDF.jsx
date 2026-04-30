import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function isDiaUtil(mes, dia, feriadosSet) {
  const mIdx = MESES.indexOf(mes);
  if (mIdx < 0) return true;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  const dt = new Date(ano, m - 1, dia);
  if (dt.getDay() === 0 || dt.getDay() === 6) return false;
  const key = `${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return !feriadosSet.has(key);
}

function calcDiasUteisMes(mes, feriadosSet) {
  const mIdx = MESES.indexOf(mes);
  if (mIdx < 0) return 22;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  const total = new Date(ano, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= total; d++) {
    const dt = new Date(ano, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) continue;
    const key = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (feriadosSet.has(key)) continue;
    count++;
  }
  return count;
}

async function gerarPDF(dados, feriadosSet) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const agora = new Date();
  const dataGeracao = `${String(agora.getDate()).padStart(2,"0")}/${String(agora.getMonth()+1).padStart(2,"0")}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2,"0")}:${String(agora.getMinutes()).padStart(2,"0")}`;

  // ── cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Retirada FTTH · Relatório 2026", 14, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em ${dataGeracao}`, 14, 17);

  let y = 30;

  // ── resumo anual ───────────────────────────────────────────────────────────
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo Anual", 14, y);
  y += 5;

  const resumoRows = MESES
    .filter((mes) => dados[mes] && dados[mes].totalOS > 0)
    .map((mes) => {
      const m = dados[mes];
      const saldo = m.saldoDiario?.length
        ? m.saldoDiario[m.saldoDiario.length - 1].saldoMes
        : 0;
      const falta = Math.max(0, m.meta - m.totalOS);
      const status =
        parseFloat(m.percentAchieved) >= (m.metaSazonal ?? 80)
          ? "Atingido"
          : falta > 0
            ? `Faltam ${falta.toLocaleString("pt-BR")} OS`
            : "Em andamento";
      return [
        mes,
        Math.round(m.cancelamentos).toLocaleString("pt-BR"),
        `${m.metaSazonal ?? 80}%`,
        Math.round(m.meta).toLocaleString("pt-BR"),
        Number(m.totalOS).toLocaleString("pt-BR"),
        `${m.percentAchieved}%`,
        saldo >= 0 ? `+${saldo}` : String(saldo),
        status,
      ];
    });

  autoTable(doc, {
    startY: y,
    head: [["Mês","Cancelamentos","Meta Saz.","Meta OS","Realizado","% Total","Saldo Final","Status"]],
    body: resumoRows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    columnStyles: {
      0: { fontStyle: "bold" },
      5: { halign: "center" },
      6: { halign: "center" },
      7: { halign: "center" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 7) {
        const v = data.cell.raw;
        if (v === "Atingido") data.cell.styles.textColor = [22, 163, 74];
        else if (String(v).startsWith("Faltam")) data.cell.styles.textColor = [220, 38, 38];
      }
      if (data.section === "body" && data.column.index === 6) {
        const v = String(data.cell.raw);
        data.cell.styles.textColor = v.startsWith("+") ? [22, 163, 74] : v.startsWith("-") ? [220, 38, 38] : [30, 30, 30];
      }
    },
  });

  // ── detalhe por mês ────────────────────────────────────────────────────────
  const mesesComDados = MESES.filter((mes) => dados[mes] && dados[mes].totalOS > 0);

  for (const mes of mesesComDados) {
    const m = dados[mes];
    doc.addPage();

    // cabeçalho da página
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, W, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`${mes} 2026 · Detalhamento`, 14, 11);

    y = 24;

    // KPIs
    const diasUteis = calcDiasUteisMes(mes, feriadosSet);
    const metaDiaria = diasUteis > 0 ? Math.ceil(m.meta / diasUteis) : 0;
    const falta = Math.max(0, m.meta - m.totalOS);

    const kpis = [
      ["Cancelamentos", Math.round(m.cancelamentos).toLocaleString("pt-BR")],
      ["Meta Sazonal", `${m.metaSazonal ?? 80}%`],
      ["Meta OS", Math.round(m.meta).toLocaleString("pt-BR")],
      ["Realizado", Number(m.totalOS).toLocaleString("pt-BR")],
      ["% Atingido", `${m.percentAchieved}%`],
      ["Falta", falta > 0 ? falta.toLocaleString("pt-BR") : "—"],
      ["Dias Úteis", String(diasUteis)],
      ["Meta Diária", `${metaDiaria} OS/dia`],
    ];

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Indicadores do mês", 14, y);
    y += 4;

    // grid de KPIs 4 colunas
    const colW = (W - 28) / 4;
    kpis.forEach(([label, value], i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 14 + col * colW;
      const ky = y + row * 16;

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, ky, colW - 2, 13, 2, 2, "F");
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(label, x + 2, ky + 4);
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(String(value), x + 2, ky + 10);
    });

    y += Math.ceil(kpis.length / 4) * 16 + 6;

    // top técnicos
    if (m.technicians?.length) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Top Técnicos", 14, y);
      y += 3;

      autoTable(doc, {
        startY: y,
        head: [["#", "Técnico", "Total OS"]],
        body: m.technicians.slice(0, 7).map((t, i) => [
          `${i + 1}º`,
          t.name,
          Number(t.total).toLocaleString("pt-BR"),
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: "center", cellWidth: 10 }, 2: { halign: "center" } },
        tableWidth: 90,
        margin: { left: 14 },
      });

      const afterTec = doc.lastAutoTable.finalY;

      // top regionais (ao lado)
      if (m.regionais?.length) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text("Top Regionais", W / 2 + 2, y);

        autoTable(doc, {
          startY: y + 3,
          head: [["#", "Regional", "Total OS"]],
          body: m.regionais.slice(0, 7).map((r, i) => [
            `${i + 1}º`,
            r.name,
            Number(r.total).toLocaleString("pt-BR"),
          ]),
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: { 0: { halign: "center", cellWidth: 10 }, 2: { halign: "center" } },
          tableWidth: 90,
          margin: { left: W / 2 + 2 },
        });

        y = Math.max(afterTec, doc.lastAutoTable.finalY) + 8;
      } else {
        y = afterTec + 8;
      }
    }

    // saldo diário
    if (m.saldoDiario?.length) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Saldo Diário", 14, y);
      y += 3;

      const saldoRecalc = m.saldoDiario.map((r) => ({
        ...r,
        util: isDiaUtil(mes, r.dia, feriadosSet),
        metaDia: isDiaUtil(mes, r.dia, feriadosSet) ? metaDiaria : 0,
      }));

      autoTable(doc, {
        startY: y,
        head: [["Dia","Equipe Téc.","Agente","Loja","Regionais","Total Dia","Meta Dia","Saldo Dia","Saldo Mês"]],
        body: saldoRecalc.map((r) => [
          String(r.dia),
          String(r.equipe ?? 0),
          String(r.agente ?? 0),
          String(r.loja ?? 0),
          String(r.regionais ?? 0),
          String(r.totalDia ?? 0),
          r.util ? String(metaDiaria) : "—",
          r.util ? (r.totalDia - metaDiaria >= 0 ? `+${r.totalDia - metaDiaria}` : String(r.totalDia - metaDiaria)) : "—",
          String(r.saldoMes ?? 0),
        ]),
        styles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [243, 244, 246] },
        didParseCell(data) {
          if (data.section === "body") {
            const rowData = saldoRecalc[data.row.index];
            if (rowData && !rowData.util) {
              data.cell.styles.textColor = [180, 180, 180];
            }
            if (data.column.index === 7 && data.section === "body") {
              const v = String(data.cell.raw);
              if (v.startsWith("+")) data.cell.styles.textColor = [22, 163, 74];
              else if (v.startsWith("-")) data.cell.styles.textColor = [220, 38, 38];
            }
            if (data.column.index === 8 && data.section === "body") {
              const v = parseFloat(data.cell.raw);
              if (!isNaN(v)) data.cell.styles.textColor = v >= 0 ? [22, 163, 74] : [220, 38, 38];
            }
          }
        },
      });
    }
  }

  // ── rodapé em todas as páginas ─────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, H - 8, W, 8, "F");
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Retirada FTTH 2026 · Sistema de Gestão", 14, H - 3);
    doc.text(`Página ${i} de ${totalPages}`, W - 14, H - 3, { align: "right" });
  }

  doc.save(`Relatorio_FTTH_2026_${dataGeracao.replace(/[/:]/g, "-").replace(" ", "_")}.pdf`);
}

const MetasExportPDF = ({ allData, dadosMes, feriadosSet = new Set() }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!allData || Object.keys(allData).length === 0) return;
    setLoading(true);
    try {
      await gerarPDF(allData, feriadosSet);
    } catch (e) {
      console.error("[MetasExportPDF] Erro ao gerar PDF:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
    >
      {loading
        ? <Loader2 size={15} className="animate-spin" />
        : <FileDown size={15} />
      }
      {loading ? "Gerando PDF..." : "Exportar PDF"}
    </button>
  );
};

export default MetasExportPDF;