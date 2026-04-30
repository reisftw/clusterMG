import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatInt(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatPct(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

export function exportAnalisesProjecaoPDF({
  selectedYear,
  projection,
  historico = [],
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const generatedAt = new Date().toLocaleString("pt-BR");

  doc.setFillColor(18, 52, 86);
  doc.rect(0, 0, 297, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Analise de Projecao ${selectedYear}`, 14, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Gerado em ${generatedAt}`, 14, 17);

  doc.setTextColor(35, 35, 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumo", 14, 34);

  const resumoLinhas = [
    ["Abertas lancadas", formatInt(projection.summary.abertasAteAgora)],
    ["Abertas projetadas restante", formatInt(projection.summary.abertasProjetadasRestante)],
    ["Total projetado do ano", formatInt(projection.summary.totalProjetadoAbertasAno)],
    ["Media projetada por mes", formatInt(projection.summary.mediaProjetadaAbertas)],
    ["Ritmo atual de abertas", formatInt(projection.summary.ritmoAtualAbertas)],
    ["Conversao media do ano atual", formatPct(projection.summary.taxaMediaAnoAtual)],
    ["Conversao media de todos os anos", formatPct(projection.summary.taxaMediaTodosAnos)],
    ["Anos considerados na conversao", (projection.summary.anosConversao || []).join(", ") || "-"],
  ];

  autoTable(doc, {
    startY: 38,
    theme: "grid",
    head: [["Indicador", "Valor"]],
    body: resumoLinhas,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [18, 52, 86] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 80 },
    },
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Meses projetados", 14, doc.lastAutoTable.finalY + 10);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    theme: "striped",
    head: [["Mes", "Abertas", "Meta sazonal", "Meta do mes", "Mesmo mes", "Faixa sazonal", "Ritmo atual", "Base historica", "Conversao"]],
    body: (projection.projectionRows || []).map((item) => [
      item.mesLabel,
      formatInt(item.abertasProjetadas),
      formatPct(item.metaSazonalPercentual),
      formatInt(item.metaDoMes),
      formatInt(item.referenciaSazonal),
      formatInt(item.referenciaFaixa),
      formatInt(item.referenciaRitmoAtual),
      item.baseHistorica ? `${item.baseHistorica} ano(s)` : "media",
      formatPct(item.taxaProjetada),
    ]),
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [245, 124, 0] },
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Historico cadastrado", 14, doc.lastAutoTable.finalY + 10);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    theme: "striped",
    head: [["Ano", "Mes", "Abertas", "Realizadas", "Conversao"]],
    body: historico.map((item) => [
      String(item.ano),
      item.mesLabel,
      formatInt(item.abertas),
      formatInt(item.realizadas),
      formatPct(item.taxaConversao),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [46, 125, 50] },
  });

  doc.save(`analise-projecao-${selectedYear}.pdf`);
}
