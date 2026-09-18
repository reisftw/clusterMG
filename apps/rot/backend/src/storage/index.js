const crypto = require("node:crypto");
const { registry } = require("./ProviderRegistry");

function objectMonth(date = new Date()) {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return { year, month };
}

function extensionForMime(mimeType) {
	if (mimeType === "application/pdf") return "pdf";
	if (mimeType === "image/webp") return "webp";
	if (mimeType === "image/png") return "png";
	return "jpg";
}

function generateObjectKey({ entityType, entityId, mimeType }) {
	const type = String(entityType || "").toLowerCase();
	const safeEntityId = String(entityId || "").replace(/[^a-zA-Z0-9_-]/g, "");
	if (!["apr", "rompimento", "asset", "sst_protocol", "dss_theme", "dss_execution", "vehicle_document"].includes(type) || !safeEntityId) throw new Error("Entidade inválida para anexo.");
	const { year, month } = objectMonth();
	const uuid = crypto.randomUUID();
	return `rot/${type}/${year}/${month}/${safeEntityId}/${uuid}.${extensionForMime(mimeType)}`;
}

module.exports = {
	generateObjectKey,
	getDefaultStorageProvider: () => registry.getDefaultProvider(),
	getStorageProvider: (name) => registry.getProvider(name),
};
