// Relatório do DSS (seção 24 do pedido): PDF com logo/institucional
// (mesmo padrão de exportSstReports.js) e XLSX (mesmo padrão de
// empresasTecnicosReportService.js, via ExcelJS). Gerado no cliente a
// partir das linhas já carregadas na tela — sem geração de PDF/XLSX no
// backend, igual ao resto do projeto.
import { addClusterLogo } from "./pdfBranding";

function triggerXlsxDownload(buffer, fileName) {
	const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function savePdf(pdf, name) {
	const url = URL.createObjectURL(pdf.output("blob"));
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

const STATUS_LABEL = { planejado: "Planejado", disponivel: "Disponível", em_andamento: "Em andamento", enviado: "Enviado", validado: "Validado", rejeitado: "Rejeitado", cancelado: "Cancelado", atrasado: "Atrasado" };

function statusLabel(status) {
	return STATUS_LABEL[status] || status;
}

function rowsFor(items) {
	return items.map((item) => [
		item.weekLabel,
		item.themeTitle || "-",
		item.operationType,
		item.regionalName || "-",
		item.baseName || "-",
		item.responsibleName || "Não identificado",
		item.dueDate ? new Date(item.dueDate).toLocaleDateString("pt-BR") : "-",
		statusLabel(item.status),
		`${item.presentesCount ?? 0}/${item.previstosCount ?? 0}`,
		item.participationPct !== null && item.participationPct !== undefined ? `${item.participationPct}%` : "-",
	]);
}

export async function exportDssReportPdf(items, filtersLabel) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

	pdf.setFillColor(234, 88, 12);
	pdf.rect(0, 0, 297, 26, "F");
	pdf.setTextColor(255, 255, 255);
	pdf.setFontSize(16);
	pdf.text("DSS — Diálogo Semanal de Segurança", 12, 13);
	pdf.setFontSize(9);
	pdf.text(filtersLabel || "Todos os registros", 12, 20);
	pdf.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 210, 20);
	await addClusterLogo(pdf, { width: 16, y: 5, marginRight: 12 });

	autoTable(pdf, {
		startY: 32,
		head: [["Semana", "Tema", "Operação", "Regional", "Base", "Responsável", "Prazo", "Status", "Presença", "Participação"]],
		body: rowsFor(items),
		theme: "grid",
		styles: { fontSize: 7.5, cellPadding: 2 },
		headStyles: { fillColor: [234, 88, 12] },
		margin: { left: 12, right: 12 },
	});

	const pages = pdf.internal.getNumberOfPages();
	for (let i = 1; i <= pages; i += 1) {
		pdf.setPage(i);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(7);
		pdf.setTextColor(148, 163, 184);
		pdf.text("Sempre Internet · Segurança do Trabalho · Gerado pelo sistema Operação", 12, 205);
		pdf.text(`Página ${i} de ${pages}`, 285, 205, { align: "right" });
	}

	savePdf(pdf, `relatorio-dss-${Date.now()}.pdf`);
}

export async function exportDssReportXlsx(items) {
	const { default: ExcelJS } = await import("exceljs");
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("DSS");
	sheet.columns = [
		{ header: "Semana", key: "weekLabel", width: 18 },
		{ header: "Tema", key: "theme", width: 30 },
		{ header: "Operação", key: "operation", width: 12 },
		{ header: "Regional", key: "regional", width: 20 },
		{ header: "Base", key: "base", width: 20 },
		{ header: "Responsável", key: "responsible", width: 24 },
		{ header: "Prazo", key: "dueDate", width: 14 },
		{ header: "Status", key: "status", width: 16 },
		{ header: "Presentes", key: "presentes", width: 12 },
		{ header: "Previstos", key: "previstos", width: 12 },
		{ header: "Participação (%)", key: "participation", width: 16 },
	];
	sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
	sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEA580C" } };
	for (const item of items) {
		sheet.addRow({
			weekLabel: item.weekLabel,
			theme: item.themeTitle || "-",
			operation: item.operationType,
			regional: item.regionalName || "-",
			base: item.baseName || "-",
			responsible: item.responsibleName || "Não identificado",
			dueDate: item.dueDate ? new Date(item.dueDate).toLocaleDateString("pt-BR") : "-",
			status: statusLabel(item.status),
			presentes: item.presentesCount ?? 0,
			previstos: item.previstosCount ?? 0,
			participation: item.participationPct ?? "",
		});
	}
	const buffer = await workbook.xlsx.writeBuffer();
	triggerXlsxDownload(buffer, `relatorio-dss-${Date.now()}.xlsx`);
}
