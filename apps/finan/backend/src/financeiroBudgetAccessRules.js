const ACCESS_REFERENCE = require("./financeiroBudgetAccessReference");

const ACCESS_COMPANY_GROUPS = new Map([
	["1", "Sempre"],
	["2", "Sempre"],
	["3", "Sempre"],
	["4", "Sempre"],
	["5", "Sempre"],
	["6", "Sempre"],
	["7", "On"],
	["8", "On"],
	["9", "On"],
	["10", "Onnet"],
	["11", "Onnet"],
	["12", "Onnet"],
	["13", "Onnet"],
	["14", "Onnet"],
]);

const ACCESS_OUT_OF_BASAL_ACCOUNTS = new Map([
	["cofins parcelamento", "ACOMPANHAR"],
	["compra de acoes", "ACOMPANHAR"],
	["consorcio", "ACOMPANHAR"],
	["csll parcelamento", "ACOMPANHAR"],
	["emprestimos bancarios", "ACOMPANHAR"],
	["emprestimos c partes relacionadas", "ACOMPANHAR"],
	["icms parcelamento", "ACOMPANHAR"],
	["indenizacoes", "ACOMPANHAR"],
	["irpj parcelamento", "ACOMPANHAR"],
	["lucros a pagar salarios e dividendos", "ACOMPANHAR"],
	["pis parcelamento", "ACOMPANHAR"],
	["provedores", "ACOMPANHAR"],
	["veiculos", "ACOMPANHAR"],
	["devolucoes estorno de clientes", "DESCONSIDERAR"],
	["taxas", "DESCONSIDERAR"],
	["venda de acoes", "DESCONSIDERAR"],
]);

const ACCESS_PROJECT_CENTERS = (ACCESS_REFERENCE.projects || []).map((project) => [
	project.code,
	project.name,
	project.status,
]);

const ACCESS_PROJECTS_BY_CODE = new Map(
	ACCESS_PROJECT_CENTERS.map(([code, name, status]) => [
		normalizeAccessKey(code),
		{ code, name, status },
	]),
);

const ACCESS_PROJECTS_BY_NAME = new Map(
	ACCESS_PROJECT_CENTERS.map(([code, name, status]) => [
		normalizeAccessKey(name),
		{ code, name, status },
	]),
);

const ACCESS_DE_PARA_BY_NAME = new Map(
	(ACCESS_REFERENCE.dePara || []).map((item) => [
		normalizeAccessKey(item.from),
		{
			category: cleanText(item.category),
			from: cleanText(item.from),
			to: cleanText(item.to),
		},
	]),
);

const ACCESS_CENTERS_BY_CODE_AND_NAME = new Map();
const ACCESS_CENTERS_BY_CODE = new Map();
const ACCESS_CENTERS_BY_NAME = new Map();

for (const center of ACCESS_REFERENCE.centers || []) {
	const normalized = {
		code: cleanText(center.code),
		name: cleanText(center.name),
		parentName: cleanText(center.parentName),
		manager: cleanText(center.manager),
		directorate: cleanText(center.directorate),
		director: cleanText(center.director),
	};
	const codeKey = normalizeCode(normalized.code);
	const nameKey = normalizeAccessKey(normalized.name);
	if (codeKey && nameKey)
		ACCESS_CENTERS_BY_CODE_AND_NAME.set(`${codeKey}:${nameKey}`, normalized);
	if (codeKey && !ACCESS_CENTERS_BY_CODE.has(codeKey))
		ACCESS_CENTERS_BY_CODE.set(codeKey, normalized);
	if (nameKey && !ACCESS_CENTERS_BY_NAME.has(nameKey))
		ACCESS_CENTERS_BY_NAME.set(nameKey, normalized);
}

function cleanText(value) {
	return String(value ?? "").trim();
}

function normalizeAccessKey(value = "") {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeCode(value = "") {
	return cleanText(value).replace(/\D+/g, "").replace(/^0+/, "") || cleanText(value);
}

function resolveAccessCompanyGroup(value = "") {
	const raw = cleanText(value);
	const code = normalizeCode(raw.split("-")[0]);
	return ACCESS_COMPANY_GROUPS.get(code) || "";
}

function getAccessProjectCenter(row = {}) {
	const byCode = ACCESS_PROJECTS_BY_CODE.get(normalizeCode(row.codCc || row.codigo || row.id));
	if (byCode) return byCode;
	const byName = ACCESS_PROJECTS_BY_NAME.get(normalizeAccessKey(row.nomeCc || row.nome || row.name));
	return byName || null;
}

function isAccessProjectCenter(row = {}) {
	return Boolean(getAccessProjectCenter(row));
}

function accessOutOfBasalStatus(accountName = "") {
	return ACCESS_OUT_OF_BASAL_ACCOUNTS.get(normalizeAccessKey(accountName)) || "";
}

function resolveAccessDePara(accountName = "") {
	const original = cleanText(accountName);
	const mapped = ACCESS_DE_PARA_BY_NAME.get(normalizeAccessKey(original));
	if (!mapped) {
		return {
			category: "",
			from: original,
			to: original,
		};
	}
	return mapped;
}

function getAccessCostCenter(row = {}) {
	const code = normalizeCode(row.codCc || row.codigo || row.id);
	const name = normalizeAccessKey(row.nomeCc || row.nome || row.name);
	if (code && name) {
		const byCodeAndName = ACCESS_CENTERS_BY_CODE_AND_NAME.get(`${code}:${name}`);
		if (byCodeAndName) return byCodeAndName;
	}
	return (
		(code && ACCESS_CENTERS_BY_CODE.get(code)) ||
		(name && ACCESS_CENTERS_BY_NAME.get(name)) ||
		null
	);
}

function applyAccessBudgetRowRules(row = {}) {
	const grupo =
		cleanText(row.grupo) ||
		resolveAccessCompanyGroup(
			row.empresaId || row.empresa || row.branchId || row.filialId,
		);
	const originalAccountName = cleanText(row.nomeConta || row.conta || row.categoria);
	const mappedAccount = resolveAccessDePara(originalAccountName);
	const mappedAccountName = mappedAccount.to || originalAccountName;
	const center = getAccessCostCenter(row);
	const project = getAccessProjectCenter({
		...row,
		codCc: center?.code || row.codCc,
		nomeCc: center?.name || row.nomeCc,
	});
	const outOfBasalStatus =
		accessOutOfBasalStatus(originalAccountName) ||
		accessOutOfBasalStatus(mappedAccountName);
	const quebra2 = project ? "PROJETO" : outOfBasalStatus || "ORÇAMENTO";
	return {
		...row,
		grupo,
		nomeConta: mappedAccountName,
		quebra2,
		statusProjetos: project?.status || row.statusProjetos || "",
		categoria: mappedAccount.category || cleanText(row.categoria || mappedAccountName),
		nomeCc: project?.name || center?.name || row.nomeCc,
		codCc: project?.code || center?.code || row.codCc,
		entidade: center?.parentName || row.entidade,
		diretoria: center?.directorate || row.diretoria,
		diretor: center?.director || row.diretor,
		gestor: center?.manager || row.gestor,
	};
}

function shouldKeepAccessImportedRow(row = {}) {
	if (cleanText(row.layoutOrigem).toUpperCase() !== "FPCP302") return true;
	if (cleanText(row.tipo).toUpperCase() === "PRV") return false;
	return isAccessProjectCenter(row);
}

module.exports = {
	ACCESS_PROJECT_CENTERS,
	accessOutOfBasalStatus,
	applyAccessBudgetRowRules,
	getAccessCostCenter,
	getAccessProjectCenter,
	isAccessProjectCenter,
	normalizeAccessKey,
	resolveAccessDePara,
	resolveAccessCompanyGroup,
	shouldKeepAccessImportedRow,
};

