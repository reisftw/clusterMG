// Exportacao do relatorio SST em PDF/DOCX — mesmo padrao institucional
// (logo da Sempre, cabecalho, rodape) ja usado em exportApr.js e
// exportSstProtocol.js. Reusa os DADOS JA CARREGADOS na pagina (mesmos
// filtros/periodo/RBAC do backend), nao busca nada novo.
const LOGO_URL = "/sempre-logo-documento.webp";

function save(blob, name) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function imageData(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

async function dimensions(src) {
	const img = new Image();
	img.src = src;
	await img.decode();
	return { width: img.naturalWidth, height: img.naturalHeight };
}

async function loadLogo() {
	const response = await fetch(LOGO_URL, { cache: "force-cache" });
	if (!response.ok) throw new Error("Logo da Sempre não encontrada para gerar o documento.");
	const blob = await response.blob();
	const data = await imageData(blob);
	return { blob, data, ...(await dimensions(data)) };
}

const TYPE_LABELS = { quase_acidente: "Quase acidente", acidente: "Acidente", incidente: "Incidente", desvio: "Desvio de segurança", inspecao_nao_conforme: "Inspeção não conforme", solicitacao: "Solicitação ao SST", risco_identificado: "Risco identificado", atividade_interrompida: "Atividade interrompida", epi_epc: "Problema com EPI/EPC", outro: "Outro" };
const STATUS_LABELS = { ABERTO: "Aberto", EM_TRIAGEM: "Em triagem", EM_ANALISE: "Em análise", EM_TRATATIVA: "Em tratativa", AGUARDANDO_INFORMACAO: "Aguardando informação", AGUARDANDO_VALIDACAO: "Aguardando validação", CONCLUIDO: "Concluído", CANCELADO: "Cancelado", DUPLICADO: "Duplicado" };

function fmtDate(value) {
	return value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "—";
}
function fmtMinutes(minutes) {
	if (minutes === null || minutes === undefined) return "Sem dados";
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}
function fmtPct(value) {
	return value === null || value === undefined ? "Sem dados" : `${String(value).replace(".", ",")}%`;
}

function filtersSummary(filters) {
	const labels = {
		operationScope: "Operação", regionalId: "Regional", baseId: "Base", companyId: "Empresa",
		type: "Tipo", status: "Status", priority: "Prioridade", assignedTo: "Responsável",
	};
	const active = Object.entries(filters || {}).filter(([, v]) => v);
	if (!active.length) return "Nenhum filtro adicional aplicado.";
	return active.map(([k, v]) => `${labels[k] || k}: ${TYPE_LABELS[v] || STATUS_LABELS[v] || v}`).join(" · ");
}

export async function exportSstReports(format, payload) {
	// timeline e workload chegam com dados reais (SstReportsPage.jsx busca as
	// duas séries antes de exportar), mas o documento gerado abaixo ainda não
	// tem uma seção para elas — decisão de produto sobre incluir no PDF/XLSX,
	// fora do escopo desta correção mecânica.
	const { period, filters, summary, distribution, occurrences, actionPlans, details, timeline: _timeline, workload: _workload } = payload;
	const logo = await loadLogo();
	const generatedAt = new Date().toLocaleString("pt-BR");
	const periodLabel = `${fmtDate(period.from)} a ${fmtDate(period.to)}`;
	const filename = `Relatorio_SST_${period.from}_a_${period.to}`;

	const kpis = summary?.kpis;
	const kpiRows = kpis ? [
		["Protocolos abertos", String(kpis.opened.value)],
		["Protocolos concluídos", String(kpis.closed.value)],
		["Em tratativa", String(kpis.inProgress.value)],
		["SLA cumprido", fmtPct(kpis.slaCompliancePct.value)],
		["Tempo médio de tratativa", fmtMinutes(kpis.avgResolutionMinutes.value)],
		["Ações vencidas", String(kpis.overdueActions.value)],
	] : [];

	function distRows(list, labelMap) {
		return (list || []).filter((i) => i.key).map((i) => [labelMap ? labelMap[i.key] || i.label || i.key : (i.label || i.key), String(i.count)]);
	}

	if (format === "pdf") {
		const { jsPDF } = await import("jspdf");
		const doc = new jsPDF({ unit: "mm", format: "a4" });
		const pageWidth = 210;
		const pageHeight = 297;
		const margin = 16;
		const contentWidth = pageWidth - margin * 2;
		const pageBottom = pageHeight - 16;
		const logoWidth = 22;
		const logoHeight = logo.height * (logoWidth / logo.width);

		// Motor de layout vertical simples: tudo flui a partir de `y`, nunca
		// coordenadas fixas reaproveitadas entre elementos diferentes — foi
		// exatamente a falta disso que causava o titulo sobrepondo o
		// cabecalho (header() nunca avancava `y` antes desta correcao).
		let y = margin;

		function fullHeader() {
			doc.addImage(logo.data, logo.blob.type === "image/png" ? "PNG" : "JPEG", margin, y, logoWidth, logoHeight);
			const textX = margin + logoWidth + 6;
			const textWidth = contentWidth - logoWidth - 6;
			doc.setFont("helvetica", "bold");
			doc.setFontSize(15);
			doc.setTextColor(15, 23, 42);
			doc.text("RELATÓRIO DE SEGURANÇA DO TRABALHO", textX, y + 6, { maxWidth: textWidth });
			doc.setFont("helvetica", "normal");
			doc.setFontSize(8.5);
			doc.setTextColor(71, 85, 105);
			doc.text(`Período analisado: ${periodLabel}`, textX, y + 12);
			doc.text(`Gerado em: ${generatedAt}`, textX, y + 16.5);
			doc.setFontSize(7.5);
			doc.setTextColor(100, 116, 139);
			doc.text(`Filtros: ${filtersSummary(filters)}`, textX, y + 21, { maxWidth: textWidth });
			const headerHeight = Math.max(logoHeight, 24);
			y += headerHeight + 4;
			doc.setDrawColor(234, 88, 12);
			doc.setLineWidth(0.8);
			doc.line(margin, y, pageWidth - margin, y);
			y += 8;
		}

		function compactHeader() {
			const smallLogoW = 12;
			const smallLogoH = logo.height * (smallLogoW / logo.width);
			doc.addImage(logo.data, logo.blob.type === "image/png" ? "PNG" : "JPEG", margin, y, smallLogoW, smallLogoH);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(9.5);
			doc.setTextColor(15, 23, 42);
			doc.text("Relatório SST", margin + smallLogoW + 4, y + smallLogoH / 2 + 1.2);
			const headerHeight = Math.max(smallLogoH, 8);
			y += headerHeight + 3;
			doc.setDrawColor(226, 232, 240);
			doc.setLineWidth(0.4);
			doc.line(margin, y, pageWidth - margin, y);
			y += 6;
		}

		function newPage() {
			doc.addPage();
			y = margin;
			compactHeader();
		}

		function ensureSpace(needed) {
			if (y + needed > pageBottom) newPage();
		}

		function sectionTitle(title) {
			ensureSpace(14);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(11);
			doc.setTextColor(15, 23, 42);
			doc.text(title.toUpperCase(), margin, y);
			y += 3;
			doc.setDrawColor(226, 232, 240);
			doc.setLineWidth(0.3);
			doc.line(margin, y, pageWidth - margin, y);
			y += 6;
		}

		function keyValueGrid(rows) {
			if (!rows.length) {
				doc.setFont("helvetica", "normal");
				doc.setFontSize(8.5);
				doc.setTextColor(148, 163, 184);
				doc.text("Sem dados.", margin, y);
				y += 8;
				return;
			}
			const cols = 3;
			const gap = 4;
			const cardW = (contentWidth - gap * (cols - 1)) / cols;
			const cardH = 17;
			rows.forEach(([label, value], index) => {
				const col = index % cols;
				if (col === 0 && index > 0) y += cardH + gap;
				if (col === 0) ensureSpace(cardH);
				const x = margin + col * (cardW + gap);
				doc.setFillColor(248, 250, 252);
				doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
				doc.setFont("helvetica", "bold");
				doc.setFontSize(6.5);
				doc.setTextColor(100, 116, 139);
				doc.text(label.toUpperCase(), x + 3.5, y + 5.5, { maxWidth: cardW - 7 });
				doc.setFont("helvetica", "bold");
				doc.setFontSize(10.5);
				doc.setTextColor(15, 23, 42);
				doc.text(String(value), x + 3.5, y + 13);
			});
			y += cardH + 10;
		}

		function table(rows, colWidths = [contentWidth * 0.62, contentWidth * 0.38]) {
			if (!rows.length) {
				doc.setFont("helvetica", "normal");
				doc.setFontSize(8.5);
				doc.setTextColor(148, 163, 184);
				doc.text("Sem dados.", margin, y);
				y += 8;
				return;
			}
			rows.forEach(([label, value]) => {
				ensureSpace(7.5);
				doc.setFont("helvetica", "normal");
				doc.setFontSize(8.5);
				doc.setTextColor(51, 65, 85);
				doc.text(String(label), margin, y, { maxWidth: colWidths[0] });
				doc.setFont("helvetica", "bold");
				doc.setTextColor(15, 23, 42);
				doc.text(String(value), margin + colWidths[0] + 4, y, { maxWidth: colWidths[1] });
				y += 6;
			});
			y += 4;
		}

		function subTitle(text) {
			ensureSpace(7);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.setTextColor(71, 85, 105);
			doc.text(text, margin, y);
			y += 5;
		}

		function footer() {
			const pages = doc.internal.getNumberOfPages();
			for (let i = 1; i <= pages; i += 1) {
				doc.setPage(i);
				doc.setFont("helvetica", "normal");
				doc.setFontSize(6.5);
				doc.setTextColor(148, 163, 184);
				doc.text("Sempre Internet · Segurança do Trabalho · Gerado pelo sistema Operação", margin, pageHeight - 10);
				doc.text(`Página ${i} de ${pages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
			}
		}

		fullHeader();

		sectionTitle("1. Resumo executivo");
		keyValueGrid(kpiRows);

		sectionTitle("2. Ocorrências no período");
		table([
			["Quase acidentes", occurrences?.nearMiss?.total ?? "—"],
			["Acidentes", occurrences?.accidentsIncidents?.byType?.find((i) => i.key === "acidente")?.count ?? 0],
			["Incidentes", occurrences?.accidentsIncidents?.byType?.find((i) => i.key === "incidente")?.count ?? 0],
			["Desvios de segurança", occurrences?.deviations?.total ?? "—"],
			["Desvios com plano de ação", occurrences?.deviations?.withActionPlan ?? "—"],
			["Inspeções / não conformidades", occurrences?.inspections?.total ?? "—"],
		]);

		sectionTitle("3. Eficiência das tratativas");
		table([
			["SLA cumprido", fmtPct(kpis?.slaCompliancePct?.value)],
			["Tempo médio de primeira resposta", fmtMinutes(kpis?.avgFirstResponseMinutes?.value)],
			["Tempo médio de conclusão", fmtMinutes(kpis?.avgResolutionMinutes?.value)],
		]);

		sectionTitle("4. Planos de ação");
		table([
			["Criados no período", actionPlans?.created ?? "—"],
			["Concluídos no período", actionPlans?.completed ?? "—"],
			["Vencidos (atual)", actionPlans?.overdue ?? "—"],
			["Concluídos no prazo", fmtPct(actionPlans?.onTimeCompletionPct)],
		]);

		sectionTitle("5. Distribuição");
		subTitle("Por tipo");
		table(distRows(distribution?.byType, TYPE_LABELS));
		subTitle("Por regional");
		table(distRows(distribution?.byRegional));

		if (details?.length) {
			sectionTitle("6. Protocolos do período (amostra da página atual)");
			const cols = ["Protocolo", "Abertura", "Tipo", "Status", "Prioridade", "Responsável", "SLA"];
			const widths = [26, 18, 34, 28, 18, 38, 20];
			function tableHeader() {
				let x = margin;
				doc.setFont("helvetica", "bold");
				doc.setFontSize(7);
				doc.setTextColor(71, 85, 105);
				cols.forEach((c, i) => { doc.text(c, x, y); x += widths[i]; });
				y += 2;
				doc.setDrawColor(226, 232, 240);
				doc.line(margin, y, margin + widths.reduce((a, b) => a + b, 0), y);
				y += 4.5;
			}
			ensureSpace(20);
			tableHeader();
			doc.setFont("helvetica", "normal");
			doc.setFontSize(7);
			doc.setTextColor(51, 65, 85);
			details.slice(0, 60).forEach((row) => {
				if (y + 5 > pageBottom) { newPage(); ensureSpace(20); tableHeader(); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(51, 65, 85); }
				let x = margin;
				const cells = [row.protocolNumber, fmtDate(row.createdAt?.slice(0, 10)), TYPE_LABELS[row.type] || row.type, STATUS_LABELS[row.status] || row.status, row.priority, row.assignedToName || "Não atribuído", row.slaCompliant === null ? "—" : row.slaCompliant ? "Cumprido" : "Vencido"];
				cells.forEach((c, i) => { doc.text(String(c ?? "—"), x, y, { maxWidth: widths[i] - 2 }); x += widths[i]; });
				y += 5;
			});
		}

		footer();
		doc.save(`${filename}.pdf`);
		return;
	}

	const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = await import("docx");
	const border = { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" };
	const cell = (children, fill = "FFFFFF", width = 50) => new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, shading: { fill }, borders: { top: border, bottom: border, left: border, right: border }, children });
	const text = (t, options = {}) => new TextRun({ text: String(t ?? ""), font: "Arial", ...options });
	const kvTable = (rows) => new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		rows: rows.map(([label, value]) => new TableRow({ children: [cell([new Paragraph({ children: [text(label, { bold: true, size: 16, color: "334155" })] })], "F8FAFC", 60), cell([new Paragraph({ children: [text(value, { bold: true, size: 16, color: "0F172A" })] })], "FFFFFF", 40)] })),
	});

	const children = [
		new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: logo.blob.type === "image/png" ? "png" : "jpg", data: new Uint8Array(await logo.blob.arrayBuffer()), transformation: { width: 110, height: Math.round(logo.height * (110 / logo.width)) } })] }),
		new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 100, after: 40 }, children: [text("Relatório de Segurança do Trabalho", { bold: true, size: 30, color: "0F172A" })] }),
		new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [text(`Período: ${periodLabel}`, { size: 18, color: "334155" })] }),
		new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [text(`Gerado em ${generatedAt}`, { size: 14, color: "64748B" })] }),
		new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [text(filtersSummary(filters), { size: 14, color: "64748B" })] }),

		new Paragraph({ spacing: { before: 100, after: 60 }, children: [text("Resumo executivo", { bold: true, size: 20, color: "0F172A" })] }),
		kvTable(kpiRows),

		new Paragraph({ spacing: { before: 200, after: 60 }, children: [text("Ocorrências no período", { bold: true, size: 20, color: "0F172A" })] }),
		kvTable([
			["Quase acidentes", String(occurrences?.nearMiss?.total ?? "—")],
			["Acidentes", String(occurrences?.accidentsIncidents?.byType?.find((i) => i.key === "acidente")?.count ?? 0)],
			["Incidentes", String(occurrences?.accidentsIncidents?.byType?.find((i) => i.key === "incidente")?.count ?? 0)],
			["Desvios de segurança", String(occurrences?.deviations?.total ?? "—")],
			["Desvios com plano de ação", String(occurrences?.deviations?.withActionPlan ?? "—")],
		]),

		new Paragraph({ spacing: { before: 200, after: 60 }, children: [text("Eficiência das tratativas", { bold: true, size: 20, color: "0F172A" })] }),
		kvTable([
			["SLA cumprido", fmtPct(kpis?.slaCompliancePct?.value)],
			["1ª resposta (média)", fmtMinutes(kpis?.avgFirstResponseMinutes?.value)],
			["Tempo médio de conclusão", fmtMinutes(kpis?.avgResolutionMinutes?.value)],
		]),

		new Paragraph({ spacing: { before: 200, after: 60 }, children: [text("Planos de ação", { bold: true, size: 20, color: "0F172A" })] }),
		kvTable([
			["Criados no período", String(actionPlans?.created ?? "—")],
			["Concluídos no período", String(actionPlans?.completed ?? "—")],
			["Vencidos (atual)", String(actionPlans?.overdue ?? "—")],
			["Concluídos no prazo", fmtPct(actionPlans?.onTimeCompletionPct)],
		]),

		new Paragraph({ spacing: { before: 200, after: 60 }, children: [text("Distribuição por tipo", { bold: true, size: 20, color: "0F172A" })] }),
		kvTable(distRows(distribution?.byType, TYPE_LABELS).length ? distRows(distribution?.byType, TYPE_LABELS) : [["Sem dados", "—"]]),

		new Paragraph({ spacing: { before: 200, after: 60 }, children: [text("Distribuição por regional", { bold: true, size: 20, color: "0F172A" })] }),
		kvTable(distRows(distribution?.byRegional).length ? distRows(distribution?.byRegional) : [["Sem dados", "—"]]),

		new Paragraph({ spacing: { before: 260 }, children: [text("Observações da Segurança do Trabalho", { bold: true, size: 16, color: "1D4ED8" })] }),
		new Paragraph({ spacing: { before: 160, after: 60 }, children: [text("Responsável: _______________________________", { size: 14, color: "475569" })] }),
		new Paragraph({ children: [text("Data: _____/_____/________", { size: 14, color: "475569" })] }),
		new Paragraph({ spacing: { before: 200 }, children: [text("Sempre Internet · Segurança do Trabalho · Gerado automaticamente pelo sistema Operação", { size: 11, color: "94A3B8" })] }),
	];

	const doc = new Document({ sections: [{ properties: { page: { margin: { top: 520, bottom: 520, left: 520, right: 520 } } }, children }] });
	save(await Packer.toBlob(doc), `${filename}.docx`);
}
