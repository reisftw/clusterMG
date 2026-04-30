import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { resolveFirestoreDate } from "../../../services/firestoreDate";

function formatDate(value) {
  const date = resolveFirestoreDate(value?.data) || resolveFirestoreDate(value);
  if (!date) return "Nao informado";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistory(regional) {
  return (regional.historico || [])
    .map((item) => `${item.label}: ${item.value}`)
    .join(" | ");
}

function formatTechnicians(regional) {
  if (!regional.tecnicos?.length) return "Nenhum tecnico vinculado";
  return regional.tecnicos.map((item) => item.nome).join(", ");
}

export function exportMapeamentoPDF(data) {
  const resumo = data?.resumo || {};
  const regionais = data?.regionais || [];
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("RELATORIO DE MAPEAMENTO", 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")} | Base do mapa: ${data?.sourceMapa === "fallback" ? "Fallback local" : "Resumo publico"}`, 14, 21);
  doc.text(`Ultima atualizacao do mapa: ${formatDate(data?.ultimaAtualizacaoMapa)}`, 190, 21);

  autoTable(doc, {
    startY: 34,
    head: [["Indicador", "Valor"]],
    body: [
      ["Regionais monitoradas", String(resumo.totalRegionais || 0)],
      ["Tecnicos vinculados", String(resumo.totalTecnicosVinculados || 0)],
      ["Capacidade total", String(resumo.capacidadeTotal || 0)],
      ["O.S. abertas no mes atual", String(resumo.abertasMesAtual || 0)],
      ["Alertas (< 110)", String(resumo.alertas || 0)],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 14, right: 14 },
    tableWidth: 110,
  });

  autoTable(doc, {
    startY: 34,
    head: [[
      "Regional",
      "Tecnicos CLT",
      "Capacidade",
      "O.S. abertas",
      "Sobra equipe ativa",
      "Alerta",
      "Historico 3 meses",
      "Tecnicos vinculados",
    ]],
    body: regionais.map((regional) => [
      regional.nome,
      String(regional.tecnicos.length || 0),
      String(regional.capacidadeTotal || 0),
      String(regional.abertasMesAtual || 0),
      String(regional.sobraEquipeAtiva || 0),
      regional.alerta ? "Sim" : "Nao",
      formatHistory(regional),
      formatTechnicians(regional),
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    bodyStyles: { textColor: [31, 41, 55] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`mapeamento-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`);
}
