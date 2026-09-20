// Exportacao de protocolo SST em PDF/DOCX, 1 pagina, com o logo da
// Sempre — mesmo padrao ja usado pra APR (src/utils/exportApr.js).
const LOGO_URL = "/sempre-logo-documento.webp";

const TYPE_LABELS = {
	quase_acidente: "Quase acidente",
	acidente: "Acidente",
	incidente: "Incidente",
	desvio: "Desvio de segurança",
	inspecao_nao_conforme: "Inspeção não conforme",
	solicitacao: "Solicitação ao SST",
	risco_identificado: "Risco identificado",
	atividade_interrompida: "Atividade interrompida",
	epi_epc: "Problema com EPI/EPC",
	outro: "Outro",
};

const STATUS_LABELS = {
	ABERTO: "Aberto",
	EM_TRIAGEM: "Em triagem",
	EM_ANALISE: "Em análise",
	EM_TRATATIVA: "Em tratativa",
	AGUARDANDO_INFORMACAO: "Aguardando informação",
	AGUARDANDO_VALIDACAO: "Aguardando validação",
	CONCLUIDO: "Concluído",
	CANCELADO: "Cancelado",
	DUPLICADO: "Duplicado",
};

const PRIORITY_LABELS = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };
const PRIORITY_COLORS = { baixa: [100, 116, 139], media: [37, 99, 235], alta: [217, 119, 6], critica: [220, 38, 38] };
const CONSEQUENCE_LABELS = {
	queda: "Queda", choque_eletrico: "Choque elétrico", atropelamento: "Atropelamento", colisao: "Colisão",
	queda_objeto: "Queda de objeto", dano_material: "Dano material", exposicao: "Exposição", lesao_potencial: "Lesão potencial", outro: "Outro",
};

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

function short(value, max = 140) {
	const text = String(value || "").replace(/\s+/g, " ").trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function loadLogo() {
	const response = await fetch(LOGO_URL, { cache: "force-cache" });
	if (!response.ok) throw new Error("Logo da Sempre não encontrada para gerar o documento.");
	const blob = await response.blob();
	const data = await imageData(blob);
	return { blob, data, ...(await dimensions(data)) };
}

function buildInfoRows(protocol) {
	return [
		["Tipo", TYPE_LABELS[protocol.type] || protocol.type],
		["Status", STATUS_LABELS[protocol.status] || protocol.status],
		["Prioridade", PRIORITY_LABELS[protocol.priority] || protocol.priority],
		["Colaborador", protocol.employeeName || "—"],
		["Solicitante", protocol.requestedByName || "—"],
		["Responsável SST", protocol.assignedToName || "Não atribuído"],
		["Operação", [protocol.operationScope, protocol.regionalName, protocol.baseName].filter(Boolean).join(" · ") || "—"],
		["Empresa", protocol.companyName || "—"],
		["Criado em", new Date(protocol.createdAt).toLocaleString("pt-BR")],
		["Concluído em", protocol.closedAt ? new Date(protocol.closedAt).toLocaleString("pt-BR") : "—"],
	];
}

function buildInvestigationRows(protocol) {
	const d = protocol.details || {};
	const rows = [];
	if (d.potentialConsequence) rows.push(["Potencial de consequência", CONSEQUENCE_LABELS[d.potentialConsequence] || d.potentialConsequence]);
	if (d.immediateAction) rows.push(["Ação imediata tomada", d.immediateAction]);
	if (d.rootCause) rows.push(["Causa raiz", d.rootCause]);
	if (d.correctiveMeasures) rows.push(["Medidas corretivas", d.correctiveMeasures]);
	return rows;
}

export async function exportSstProtocol(protocol, format) {
	const logo = await loadLogo();
	const filename = protocol.protocolNumber || `protocolo-${protocol.id}`;
	const infoRows = buildInfoRows(protocol);
	const investigationRows = buildInvestigationRows(protocol);
	const priorityColor = PRIORITY_COLORS[protocol.priority] || PRIORITY_COLORS.media;

	if (format === "pdf") {
		const { jsPDF } = await import("jspdf");
		const doc = new jsPDF({ unit: "mm", format: "a4" });
		const pageWidth = 210;
		const margin = 12;
		const contentWidth = pageWidth - margin * 2;

		doc.setFillColor(248, 250, 252);
		doc.rect(0, 0, 210, 297, "F");
		doc.setFillColor(255, 255, 255);
		doc.roundedRect(margin, 10, contentWidth, 274, 4, 4, "F");
		doc.setDrawColor(226, 232, 240);
		doc.roundedRect(margin, 10, contentWidth, 274, 4, 4, "S");

		const logoWidth = 22;
		const logoHeight = logo.height * (logoWidth / logo.width);
		doc.addImage(logo.data, logo.blob.type === "image/png" ? "PNG" : "JPEG", 22, 13, logoWidth, logoHeight);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(16);
		doc.setTextColor(15, 23, 42);
		doc.text(protocol.protocolNumber || "Protocolo SST", 55, 21);
		doc.setFontSize(10);
		doc.setFont("helvetica", "normal");
		doc.setTextColor(71, 85, 105);
		doc.text("Segurança do Trabalho · Operação", 55, 27);
		doc.setFillColor(...priorityColor);
		doc.roundedRect(140, 15, 50, 10, 5, 5, "F");
		doc.setTextColor(255, 255, 255);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8);
		doc.text(`PRIORIDADE ${(PRIORITY_LABELS[protocol.priority] || "").toUpperCase()}`, 165, 21.5, { align: "center", maxWidth: 46 });
		doc.setDrawColor(...priorityColor);
		doc.setLineWidth(0.8);
		doc.line(margin, 36, pageWidth - margin, 36);

		doc.setFont("helvetica", "bold");
		doc.setFontSize(13);
		doc.setTextColor(15, 23, 42);
		doc.text(short(protocol.subject, 90), margin + 6, 44, { maxWidth: contentWidth - 12 });

		const cardW = (contentWidth - 8) / 2;
		let y = 52;
		infoRows.forEach(([label, value], index) => {
			const x = margin + 6 + (index % 2) * (cardW + 8);
			if (index % 2 === 0 && index > 0) y += 15;
			doc.setFillColor(248, 250, 252);
			doc.roundedRect(x, y, cardW, 13, 3, 3, "F");
			doc.setFont("helvetica", "bold");
			doc.setFontSize(6.5);
			doc.setTextColor(100, 116, 139);
			doc.text(label.toUpperCase(), x + 3, y + 4.5);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.setTextColor(15, 23, 42);
			doc.text(short(value, 52), x + 3, y + 9.5, { maxWidth: cardW - 6 });
		});
		y += 22;

		if (protocol.description) {
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8.5);
			doc.setTextColor(15, 23, 42);
			doc.text("RESUMO", margin + 6, y);
			doc.setFont("helvetica", "normal");
			doc.setFontSize(8);
			doc.setTextColor(51, 65, 85);
			doc.text(short(protocol.description, 400), margin + 6, y + 5, { maxWidth: contentWidth - 12 });
			y += 5 + Math.ceil(short(protocol.description, 400).length / 100) * 4.2 + 6;
		}

		if (investigationRows.length) {
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8.5);
			doc.setTextColor(15, 23, 42);
			doc.text("INVESTIGAÇÃO", margin + 6, y);
			y += 5;
			investigationRows.forEach(([label, value]) => {
				doc.setFont("helvetica", "bold");
				doc.setFontSize(7);
				doc.setTextColor(71, 85, 105);
				doc.text(label.toUpperCase(), margin + 6, y);
				doc.setFont("helvetica", "normal");
				doc.setFontSize(7.5);
				doc.setTextColor(15, 23, 42);
				doc.text(short(value, 180), margin + 6, y + 4, { maxWidth: contentWidth - 12 });
				y += 10;
			});
		}

		doc.setFillColor(239, 246, 255);
		doc.roundedRect(margin + 6, 263, contentWidth - 12, 12, 3, 3, "F");
		doc.setFont("helvetica", "bold");
		doc.setFontSize(6.8);
		doc.setTextColor(30, 64, 175);
		doc.text("SUA SEGURANÇA SEMPRE EM PRIMEIRO LUGAR.", margin + 9, 268);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(6.2);
		doc.text("Documento gerado automaticamente pelo módulo de Segurança do Trabalho do Operação.", margin + 9, 272, { maxWidth: contentWidth - 18 });
		doc.setFontSize(6);
		doc.setTextColor(100, 116, 139);
		doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} · ${protocol.protocolNumber}`, pageWidth - margin, 291, { align: "right" });

		doc.save(`${filename}.pdf`);
		return;
	}

	const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = await import("docx");
	const docxBorder = { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" };
	const docxCell = (children, fill = "FFFFFF", width = 50) => new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, shading: { fill }, borders: { top: docxBorder, bottom: docxBorder, left: docxBorder, right: docxBorder }, children });
	const docxText = (text, options = {}) => new TextRun({ text: String(text || ""), font: "Arial", ...options });

	const infoTable = new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		rows: chunk(infoRows, 2).map((row) => new TableRow({
			children: row.flatMap(([label, value]) => [
				docxCell([new Paragraph({ children: [docxText(label.toUpperCase(), { bold: true, size: 14, color: "64748B" })] })], "F8FAFC", 18),
				docxCell([new Paragraph({ children: [docxText(short(value, 90), { bold: true, size: 16, color: "0F172A" })] })], "FFFFFF", 32),
			]),
		})),
	});

	const children = [
		new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: logo.blob.type === "image/png" ? "png" : "jpg", data: new Uint8Array(await logo.blob.arrayBuffer()), transformation: { width: 120, height: Math.round(logo.height * (120 / logo.width)) } })] }),
		new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 80, after: 20 }, children: [docxText(protocol.protocolNumber || "Protocolo SST", { bold: true, size: 28, color: "0F172A" })] }),
		new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [docxText(protocol.subject, { bold: true, size: 20, color: "334155" })] }),
		new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [docxText(`PRIORIDADE ${(PRIORITY_LABELS[protocol.priority] || "").toUpperCase()}`, { bold: true, size: 16, color: `${priorityColor.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase() })] }),
		infoTable,
	];

	if (protocol.description) {
		children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [docxText("Resumo", { bold: true, size: 18, color: "0F172A" })] }));
		children.push(new Paragraph({ spacing: { after: 100 }, children: [docxText(short(protocol.description, 800), { size: 14, color: "334155" })] }));
	}

	if (investigationRows.length) {
		children.push(new Paragraph({ spacing: { before: 180, after: 60 }, children: [docxText("Investigação", { bold: true, size: 18, color: "0F172A" })] }));
		children.push(new Table({
			width: { size: 100, type: WidthType.PERCENTAGE },
			rows: investigationRows.map(([label, value]) => new TableRow({
				children: [
					docxCell([new Paragraph({ children: [docxText(label.toUpperCase(), { bold: true, size: 14, color: "64748B" })] })], "F8FAFC", 28),
					docxCell([new Paragraph({ children: [docxText(short(value, 200), { size: 14, color: "0F172A" })] })], "FFFFFF", 72),
				],
			})),
		}));
	}

	children.push(new Paragraph({ spacing: { before: 200 }, children: [docxText("SUA SEGURANÇA SEMPRE EM PRIMEIRO LUGAR.", { bold: true, size: 14, color: "1D4ED8" })] }));
	children.push(new Paragraph({ children: [docxText("Documento gerado automaticamente pelo módulo de Segurança do Trabalho do Operação.", { size: 12, color: "475569" })] }));

	const doc = new Document({ sections: [{ properties: { page: { margin: { top: 520, bottom: 520, left: 520, right: 520 } } }, children }] });
	save(await Packer.toBlob(doc), `${filename}.docx`);
}

function chunk(array, size) {
	const out = [];
	for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
	return out;
}
