const crypto = require("node:crypto");

function stableObject(value) {
	if (Array.isArray(value)) return value.map(stableObject);
	if (!value || typeof value !== "object") return value;
	return Object.keys(value)
		.sort()
		.reduce((acc, key) => {
			acc[key] = stableObject(value[key]);
			return acc;
		}, {});
}

function stableJson(value) {
	return JSON.stringify(stableObject(value));
}

function buildSourceHash(value) {
	return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

module.exports = { buildSourceHash, stableJson, stableObject };
