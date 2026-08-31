const financeiroReportsRepository = require("./financeiroReportsRepository");

function toBool(value) {
	if (typeof value === "boolean") return value;
	const normalized = String(value || "").trim().toLowerCase();
	return ["1", "true", "sim", "yes", "on"].includes(normalized);
}

function normalizeStatementFilters(filters = {}) {
	return {
		ano: filters.ano || filters.year,
		mes: filters.mes || filters.month,
		isFake: toBool(filters.isFake || filters.fake),
	};
}

function buildDreStatementCacheKey(filters = {}) {
	const normalized = normalizeStatementFilters(filters);
	return `dre:${normalized.ano || ""}:${normalized.mes || ""}:${normalized.isFake ? "1" : ""}`;
}

async function getDreStatement(filters = {}) {
	return financeiroReportsRepository.listDreLancamentos(
		normalizeStatementFilters(filters),
	);
}

async function saveDreStatement(payload = {}, user = {}) {
	return financeiroReportsRepository.replaceDreLancamentos(payload, user);
}

async function createFakeDreData(user = {}) {
	return financeiroReportsRepository.createFakeDreLancamentos(user);
}

async function deleteFakeDreData(user = {}) {
	return financeiroReportsRepository.deleteFakeDreLancamentos(user);
}

module.exports = {
	buildDreStatementCacheKey,
	createFakeDreData,
	deleteFakeDreData,
	getDreStatement,
	normalizeStatementFilters,
	saveDreStatement,
};
