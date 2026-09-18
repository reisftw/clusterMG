// Lista de presença do DSS (seção 13 do pedido): PDF A4, logo/rodapé
// institucional igual aos demais exports de SST (exportSstReports.js),
// tabela paginada com cabeçalho repetido via jspdf-autotable (mesmo
// padrão de empresasTecnicosReportService.js). Gerado 100% no cliente —
// não há geração de PDF no backend em nenhum módulo do projeto.
import { addClusterLogo } from "./pdfBranding";

function save(blob, name) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

export async function exportDssAttendanceList(execution) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const margin = 14;

	function header() {
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(14);
		pdf.setTextColor(15, 23, 42);
		pdf.text("LISTA DE PRESENÇA — DSS", margin, 18);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(9);
		pdf.setTextColor(71, 85, 105);
		const lines = [
			`Tema: ${execution.themeTitle || "-"}`,
			`Semana: ${execution.weekLabel || "-"}   ·   Prazo: ${execution.dueDate ? new Date(execution.dueDate).toLocaleDateString("pt-BR") : "-"}`,
			`Operação: ${execution.operationType || "-"}   ·   Regional: ${execution.regionalName || "-"}${execution.baseName ? `   ·   Base: ${execution.baseName}` : ""}`,
			`Responsável: ${execution.responsibleName || "Não identificado"}`,
		];
		let y = 26;
		for (const line of lines) {
			pdf.text(line, margin, y);
			y += 5;
		}
		return y + 2;
	}

	const startY = header();
	await addClusterLogo(pdf, { width: 26, height: 13, y: 8, marginRight: 12 });

	const rows = (execution.members || []).map((member, index) => [String(index + 1), member.registration || "", member.name, member.role || "", ""]);

	autoTable(pdf, {
		startY,
		head: [["Nº", "Matrícula", "Colaborador", "Cargo", "Assinatura"]],
		body: rows,
		theme: "grid",
		styles: { fontSize: 9, cellPadding: 2.5, minCellHeight: 9 },
		headStyles: { fillColor: [234, 88, 12], textColor: 255 },
		columnStyles: {
			0: { cellWidth: 10, halign: "center" },
			1: { cellWidth: 26 },
			2: { cellWidth: 62 },
			3: { cellWidth: 38 },
			4: { cellWidth: "auto" },
		},
		margin: { left: margin, right: margin },
		didDrawPage: () => {
			if (pdf.internal.getCurrentPageInfo().pageNumber > 1) header();
		},
	});

	const pages = pdf.internal.getNumberOfPages();
	for (let i = 1; i <= pages; i += 1) {
		pdf.setPage(i);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(7);
		pdf.setTextColor(148, 163, 184);
		pdf.text("Sempre Internet · Segurança do Trabalho · Gerado pelo sistema Operação", margin, pageHeight - 10);
		pdf.text(`Página ${i} de ${pages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
	}

	save(pdf.output("blob"), `lista-presenca-dss-${(execution.weekLabel || "semana").replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
