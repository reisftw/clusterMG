const path = require("node:path");
const PDFDocument = require("pdfkit");

const ASSETS_DIR = path.join(__dirname, "assets");
const COLORS = Object.freeze({
	ink: "#10213B",
	muted: "#52647D",
	line: "#D8E2EE",
	soft: "#F4F7FB",
	sempre: "#0B4DA2",
	onnet: "#E65A19",
});

function text(value) {
	return String(value ?? "").trim();
}

function isOnnet(company) {
	return text(company).toUpperCase().includes("ONNET");
}

function formatDateTime(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		dateStyle: "long",
		timeStyle: "short",
	}).format(date);
}

function safeFilename(value) {
	const normalized = text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 90);
	return `Comprovante-de-devolucao-${normalized || "cliente"}.pdf`;
}

function field(doc, label, value, x, y, width) {
	doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), x, y, { width });
	doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.ink).text(text(value) || "-", x, y + 13, {
		width,
		lineBreak: false,
		ellipsis: true,
	});
}

function renderEquipment(doc, equipment, y) {
	const rows = Array.isArray(equipment) ? equipment : [];
	doc.roundedRect(40, y, 515, 36 + Math.max(1, rows.length) * 30, 7).fillAndStroke(COLORS.soft, COLORS.line);
	doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink).text("EQUIPAMENTOS DEVOLVIDOS", 54, y + 12);
	const start = y + 34;
	if (!rows.length) {
		doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text("Nenhum equipamento informado.", 54, start, { width: 485 });
		return y + 66;
	}
	rows.forEach((item, index) => {
		const rowY = start + index * 30;
		if (index) doc.moveTo(54, rowY - 6).lineTo(541, rowY - 6).strokeColor(COLORS.line).stroke();
		doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.ink).text(text(item.productName) || "Equipamento", 54, rowY, {
			width: 330,
			lineBreak: false,
			ellipsis: true,
		});
		doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(`Série/MAC: ${text(item.serial) || "Não informado"}`, 390, rowY, {
			width: 151,
			align: "right",
			lineBreak: false,
			ellipsis: true,
		});
	});
	return y + 48 + rows.length * 30;
}

function generateReturnReceiptPdf(snapshot = {}) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		const companyOnnet = isOnnet(snapshot.company);
		const accent = companyOnnet ? COLORS.onnet : COLORS.sempre;
		const logo = path.join(ASSETS_DIR, companyOnnet ? "onnet-logo.png" : "sempre-logo.png");
		const doc = new PDFDocument({
			size: "A4",
			margin: 40,
			bufferPages: false,
			info: {
				Title: `Comprovante de devolução - ${text(snapshot.clientName)}`,
				Author: companyOnnet ? "Onnet Telecomunicacoes" : "Sempre Telecomunicacoes",
				Subject: "Comprovante de devolução de equipamento",
			},
		});
		doc.on("data", (chunk) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);

		doc.rect(0, 0, 595.28, 10).fill(accent);
		doc.image(logo, 40, 30, { fit: [150, 58], align: "left", valign: "center" });
		doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.ink).text("COMPROVANTE DE DEVOLUÇÃO", 220, 34, {
			width: 335,
			align: "right",
		});
		doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text("Equipamento em comodato", 220, 59, {
			width: 335,
			align: "right",
		});
		doc.moveTo(40, 96).lineTo(555, 96).strokeColor(accent).lineWidth(1.5).stroke();

		field(doc, "Cliente", snapshot.clientName, 40, 116, 325);
		field(doc, "Código do cliente", snapshot.clientCode, 385, 116, 170);
		field(doc, "Ordem de serviço", snapshot.serviceOrderNumber, 40, 164, 245);
		field(doc, "Tipo", snapshot.serviceOrderType, 305, 164, 250);
		field(doc, "Técnico responsável", snapshot.technicianName, 40, 212, 325);
		field(doc, "Finalização", formatDateTime(snapshot.completedAt), 385, 212, 170);

		const afterEquipment = renderEquipment(doc, snapshot.equipment, 262);
		const statementY = afterEquipment + 18;
		doc.font("Helvetica-Bold").fontSize(10).fillColor(accent).text("DECLARAÇÃO", 40, statementY);
		doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink).text(
			`Declaramos, para os devidos fins, que os equipamentos relacionados neste documento foram devolvidos pelo cliente ${text(snapshot.clientName)} e registrados no controle de estoque da ${companyOnnet ? "Onnet Telecomunicações" : "Sempre Telecomunicações"}. A devolução está vinculada à O.S. ${text(snapshot.serviceOrderNumber)} e encerra a responsabilidade de guarda dos itens descritos, sem prejuízo de eventuais obrigações contratuais independentes.`,
			40,
			statementY + 20,
			{ width: 515, align: "justify", lineGap: 3 },
		);

		const signatureY = Math.min(700, statementY + 128);
		doc.moveTo(335, signatureY).lineTo(555, signatureY).strokeColor(COLORS.ink).lineWidth(0.8).stroke();
		doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.ink).text(
			companyOnnet ? "ONNET TELECOMUNICAÇÕES" : "SEMPRE TELECOMUNICAÇÕES",
			335,
			signatureY + 8,
			{ width: 220, align: "center" },
		);
		doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted).text("Reconhecimento eletrônico da devolução", 335, signatureY + 21, {
			width: 220,
			align: "center",
		});

		doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted).text(
			`Documento gerado eletronicamente em ${formatDateTime(snapshot.generatedAt || new Date())}. Autenticidade vinculada ao registro ${text(snapshot.receiptId)}.`,
			40,
			785,
			{ width: 515, align: "center" },
		);
		doc.end();
	});
}

module.exports = {
	formatDateTime,
	generateReturnReceiptPdf,
	isOnnet,
	safeFilename,
};
