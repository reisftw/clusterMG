const { normalizeText, text } = require("../utils/text");

function parsePlanSpeedMbps(description) {
	const raw = text(description);
	if (!raw) return null;
	const normalized = normalizeText(raw).replace(/(\d)\s+(gb|giga|mb|mbps|mega)/g, "$1$2");
	const gbMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(gbps|gb|giga)\b/);
	if (gbMatch) return Math.round(Number(gbMatch[1].replace(",", ".")) * 1000);
	const mbMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(mbps|mb|mega)\b/);
	if (mbMatch) return Math.round(Number(mbMatch[1].replace(",", ".")));
	return null;
}

module.exports = { parsePlanSpeedMbps };
