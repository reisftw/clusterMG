export function splitPdfTextToTwoLines(pdf, text, maxWidth) {
	return pdf.splitTextToSize(String(text || "-"), maxWidth).slice(0, 2);
}
