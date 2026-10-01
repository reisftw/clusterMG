function text(value) {
	return String(value ?? "").trim();
}

function normalizeText(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/gi, " ")
		.trim()
		.toLowerCase();
}

function toNumberOrNull(value) {
	if (value === null || value === undefined || value === "") return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function toBooleanOrNull(value) {
	if (value === true || value === false) return value;
	if (value === null || value === undefined || value === "") return null;
	const normalized = normalizeText(value);
	if (["true", "sim", "s", "1"].includes(normalized)) return true;
	if (["false", "nao", "não", "n", "0"].includes(normalized)) return false;
	return null;
}

function toIsoOrNull(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = { normalizeText, text, toBooleanOrNull, toIsoOrNull, toNumberOrNull };
