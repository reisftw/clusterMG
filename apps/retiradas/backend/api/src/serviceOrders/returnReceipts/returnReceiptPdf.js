const path = require("node:path");
const PDFDocument = require("pdfkit");

const ASSETS_DIR = path.join(__dirname, "assets");
const COLORS = Object.freeze({
	ink: "#10213B",
	muted: "#52647D",
	line: "#D8E2EE",
	soft: "#F4F7FB",
	sempre: "#F26A00",
	onnet: "#0B8F55",
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
		const detail = item.serial
			? `Série/MAC: ${text(item.serial)}`
			: `Origem: ${text(item.sourceLabel) || "O.S. finalizada"}`;
		doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(detail, 370, rowY, {
			width: 171,
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

		doc.rect(0, 0, 595.28, 100).fill(accent);
		if (companyOnnet) {
			doc.image(logo, 40, 25, {
				fit: [160, 60],
				align: "center",
				valign: "center",
			});
		} else {
			doc.save();
			doc.rect(40, 18, 160, 76).clip();
			doc.image(logo, 15, -55, { width: 205 });
			doc.restore();
		}
		const headingColor = "#FFFFFF";
		const subheadingColor = companyOnnet ? "#DDF6E8" : "#FFF0E3";
		doc.font("Helvetica-Bold").fontSize(18).fillColor(headingColor).text("COMPROVANTE DE DEVOLUÇÃO", 220, 34, {
			width: 335,
			align: "right",
		});
		doc.font("Helvetica").fontSize(9).fillColor(subheadingColor).text("Equipamento em comodato", 220, 59, {
			width: 335,
			align: "right",
		});
		doc.moveTo(40, 96).lineTo(555, 96).strokeColor("#FFFFFF").lineWidth(1.5).stroke();

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
			`Declaramos, para os devidos fins, que a retirada vinculada ao cliente ${text(snapshot.clientName)} foi concluída por meio da O.S. ${text(snapshot.serviceOrderNumber)}. Os dados de equipamento apresentados foram obtidos das bases internas disponíveis na data de emissão deste documento, formalizando o encerramento operacional da devolução, sem prejuízo de eventuais obrigações contratuais independentes.`,
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
