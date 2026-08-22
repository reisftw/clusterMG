import ExcelJS from "exceljs";

import { addClusterLogo } from "../../../utils/pdfBranding";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatMonth(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (!match) return text || "Todos";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text || "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function triggerDownload(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applyHeaderStyle(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF003087" },
  };
}

function buildFileName(empresa, mes, extension) {
  const empresaSlug = slugify(empresa?.nome) || "empresa";
  const mesSlug = mes && mes !== "todos" ? slugify(mes) : "todos-os-meses";
  return `relatorio-empresa-${empresaSlug}-${mesSlug}.${extension}`;
}

function resumoRows(empresa, mes, stats) {
  return [
    ["Empresa", empresa?.nome || "-"],
    ["Documento", empresa?.documento || "-"],
    ["Atuação", empresa?.atuacao || "-"],
    ["Status", empresa?.status || "-"],
    ["Mês", mes && mes !== "todos" ? formatMonth(mes) : "Todos os meses"],
    ["Responsável", empresa?.responsavel?.nome || "-"],
    ["Telefone", empresa?.responsavel?.telefone || "-"],
    ["Regionais", (empresa?.regionais || []).join(", ") || "-"],
    ["Cidades", (empresa?.cidades || []).join(", ") || "-"],
    ["Serviços", Number(stats?.total || 0)],
    ["Válidas", Number(stats?.validas || 0)],
    ["Pendentes", Number(stats?.pendentes || 0)],
    ["Inválidas", Number(stats?.invalidas || 0)],
    ["Valor previsto", money(stats?.valor || 0)],
  ];
}

export async function exportEmpresaRelatorioXlsx({ empresa, mes, stats }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão Retiradas";
  workbook.created = new Date();

  const resumo = workbook.addWorksheet("Resumo");
  resumo.addRow(["Indicador", "Valor"]);
  applyHeaderStyle(resumo.getRow(1));
  resumoRows(empresa, mes, stats).forEach((row) => resumo.addRow(row));
  resumo.columns = [{ width: 22 }, { width: 52 }];

  const tecnicos = workbook.addWorksheet("Técnicos");
  tecnicos.addRow(["Técnico", "Telefone", "Total", "Válidas", "Pendentes", "Inválidas", "Valor"]);
  applyHeaderStyle(tecnicos.getRow(1));
  (stats?.porTecnico || []).forEach((item) => {
    tecnicos.addRow([
      item.nome || "-",
      item.telefone || "-",
      Number(item.total || 0),
      Number(item.validas || 0),
      Number(item.pendentes || 0),
      Number(item.invalidas || 0),
      Number(item.valor || 0),
    ]);
  });
  tecnicos.columns = [
    { width: 32 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
  ];

  const servicos = workbook.addWorksheet("Serviços");
  servicos.addRow([
    "Mês",
    "OS",
    "Técnico",
    "Regional",
    "Cidade",
    "Equipamento",
    "Identificador",
    "Fechamento OS",
    "Entrega",
    "Status",
    "Motivo",
    "Valor",
  ]);
  applyHeaderStyle(servicos.getRow(1));
  (stats?.rows || []).forEach((item) => {
    servicos.addRow([
      item.mes || "",
      item.os || "",
      item.tecnico || "",
      item.regional || "",
      item.cidade || "",
      item.equipamento || "",
      item.identificador || "",
      formatDate(item.fechamentoOs),
      formatDate(item.entrega),
      item.status || "",
      item.motivo || "",
      Number(item.valorCalculado || 0),
    ]);
  });
  servicos.columns = [
    { width: 14 },
    { width: 18 },
    { width: 28 },
    { width: 20 },
    { width: 22 },
    { width: 24 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 44 },
    { width: 14 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, buildFileName(empresa, mes, "xlsx"));
}

export async function exportEmpresaRelatorioPdf({ empresa, mes, stats }) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = `Relatório da empresa - ${empresa?.nome || "-"}`;
  const subtitle = mes && mes !== "todos" ? formatMonth(mes) : "Todos os meses";

  pdf.setFillColor(0, 48, 135);
  pdf.rect(0, 0, 297, 32, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(17);
  pdf.text(title, 12, 14);
  pdf.setFontSize(10);
  pdf.text(`Período: ${subtitle}`, 12, 22);
  pdf.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 210, 22);
  await addClusterLogo(pdf, { width: 24, height: 12, y: 8, marginRight: 12 });

  autoTable(pdf, {
    startY: 40,
    head: [["Indicador", "Valor"]],
    body: resumoRows(empresa, mes, stats),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 48, 135] },
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 96 } },
    margin: { left: 12, right: 12 },
  });

  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 8,
    head: [["Técnico", "Telefone", "Total", "Válidas", "Pendentes", "Inválidas", "Valor"]],
    body: (stats?.porTecnico || []).map((item) => [
      item.nome || "-",
      item.telefone || "-",
      Number(item.total || 0),
      Number(item.validas || 0),
      Number(item.pendentes || 0),
      Number(item.invalidas || 0),
      money(item.valor || 0),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 48, 135] },
    margin: { left: 12, right: 12 },
  });

  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 8,
    head: [["Mês", "OS", "Técnico", "Regional", "Cidade", "Status", "Entrega", "Valor"]],
    body: (stats?.rows || []).map((item) => [
      item.mes || "-",
      item.os || "-",
      item.tecnico || "-",
      item.regional || "-",
      item.cidade || "-",
      item.status || "-",
      formatDate(item.entrega),
      money(item.valorCalculado || 0),
    ]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [0, 48, 135] },
    margin: { left: 12, right: 12 },
  });

  pdf.save(buildFileName(empresa, mes, "pdf"));
}

