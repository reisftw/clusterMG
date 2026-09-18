const financeiroBudgetConfigRepository = require("./financeiroBudgetConfigRepository");
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

async function getSerasaStatement() {
	return financeiroReportsRepository.getSerasaFinancialReport();
}

async function saveSerasaStatement(data = {}) {
	return financeiroReportsRepository.saveSerasaFinancialReport(data);
}

async function clearSerasaStatement(data = {}) {
	return financeiroReportsRepository.clearSerasaFinancialReport(data);
}

async function getTariffsStatement() {
	return financeiroReportsRepository.getTariffsFinancialReport();
}

async function saveTariffsStatement(data = {}) {
	return financeiroReportsRepository.saveTariffsFinancialReport(data);
}

async function clearTariffsStatement(data = {}) {
	return financeiroReportsRepository.clearTariffsFinancialReport(data);
}

async function getBudgetConfigurationStatement(filters = {}) {
	return financeiroBudgetConfigRepository.getBudgetCostCenters(filters);
}

async function saveBudgetConfigurationStatement(config = {}, user = {}) {
	return financeiroBudgetConfigRepository.saveBudgetCostCenters(config, user);
}

async function getBudgetDataStatement() {
	return financeiroBudgetConfigRepository.getBudgetData();
}

async function saveBudgetDataStatement(data = {}, user = {}) {
	return financeiroBudgetConfigRepository.saveBudgetData(data, user);
}

module.exports = {
	buildDreStatementCacheKey,
	clearSerasaStatement,
	clearTariffsStatement,
	createFakeDreData,
	deleteFakeDreData,
	getBudgetConfigurationStatement,
	getBudgetDataStatement,
	getDreStatement,
	getSerasaStatement,
	getTariffsStatement,
	normalizeStatementFilters,
	saveBudgetConfigurationStatement,
	saveBudgetDataStatement,
	saveDreStatement,
	saveSerasaStatement,
	saveTariffsStatement,
};

