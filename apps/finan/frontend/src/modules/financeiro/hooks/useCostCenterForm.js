import { useMemo, useState } from "react";
import { normalizeImportHeader } from "../utils/budgetImportRows";
import { parseMoneyInput } from "../utils/financeiroFormatters";

function getInitialMonthlyBudget(center = {}) {
	return (
		center?.valorMensal ??
		center?.orcamentoMensal ??
		(center?.valorAnual || center?.orcamentoAnual
			? Number(center?.valorAnual || center?.orcamentoAnual || 0) / 12
			: "")
	);
}

function buildInitialCostCenterForm(center = {}, emptyCostCenter = {}) {
	const initialMonthlyBudget = getInitialMonthlyBudget(center);

	return {
		...emptyCostCenter,
		...center,
		valorMensal: initialMonthlyBudget,
		valorAnual: initialMonthlyBudget
			? parseMoneyInput(initialMonthlyBudget) * 12
			: "",
		realizadoMes: center?.realizadoMes || "",
		companies: Array.isArray(center?.companies || center?.empresas)
			? center.companies || center.empresas
			: [],
		branches: Array.isArray(center?.branches || center?.filiais)
			? center.branches || center.filiais
			: [],
		contasFinanceiras: Array.isArray(center?.contasFinanceiras)
			? center.contasFinanceiras
			: [],
	};
}

function filterSearchResults(items = [], selectedIds = [], search, matcher) {
	const normalizedSearch = normalizeImportHeader(search);
	if (!normalizedSearch) return [];

	return items
		.filter((item) => !selectedIds.includes(item.id))
		.filter((item) => matcher(item, normalizedSearch))
		.slice(0, 8);
}

export function useCostCenterForm({
	center,
	accounts = [],
	companies = [],
	branches = [],
	budgetSettings,
	emptyCostCenter,
	findDirectorateByName,
	onSave,
}) {
	const [form, setForm] = useState(() =>
		buildInitialCostCenterForm(center, emptyCostCenter),
	);
	const [validationMessage, setValidationMessage] = useState("");
	const [accountSearchInCenter, setAccountSearchInCenter] = useState("");
	const [branchSearchInCenter, setBranchSearchInCenter] = useState("");
	const [companySearchInCenter, setCompanySearchInCenter] = useState("");
	const [activeMovementMonth, setActiveMovementMonth] = useState("");

	const directorateOptions = budgetSettings.directorates || [];
	const accountById = useMemo(
		() => new Map(accounts.map((account) => [account.id, account])),
		[accounts],
	);
	const companyById = useMemo(
		() => new Map(companies.map((company) => [company.id, company])),
		[companies],
	);
	const branchById = useMemo(
		() => new Map(branches.map((branch) => [branch.id, branch])),
		[branches],
	);

	const update = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));

	const selectedCenterAccounts = (form.contasFinanceiras || [])
		.map((accountId) => accountById.get(accountId))
		.filter(Boolean);
	const centerAccountResults = filterSearchResults(
		accounts,
		form.contasFinanceiras || [],
		accountSearchInCenter,
		(account, normalizedSearch) =>
			normalizeImportHeader(
				[
					account.codigo,
					account.reduzida,
					account.classificacao,
					account.nome,
					account.id,
				]
					.filter(Boolean)
					.join(" "),
			).includes(normalizedSearch),
	);

	const addCenterAccount = (accountId) => {
		const nextAccounts = [
			...new Set([...(form.contasFinanceiras || []), accountId]),
		];
		update("contasFinanceiras", nextAccounts);
		setAccountSearchInCenter("");
	};

	const removeCenterAccount = (accountId) => {
		const nextAccounts = (form.contasFinanceiras || []).filter(
			(item) => item !== accountId,
		);
		update("contasFinanceiras", nextAccounts);
		if (!nextAccounts.includes(form.contaFinanceiraPadrao)) {
			update("contaFinanceiraPadrao", "");
		}
	};

	const selectedCenterBranches = (form.branches || [])
		.map((branchId) => branchById.get(branchId))
		.filter(Boolean);
	const selectedCenterCompanies = (form.companies || [])
		.map((companyId) => companyById.get(companyId))
		.filter(Boolean);
	const centerBranchResults = filterSearchResults(
		branches,
		form.branches || [],
		branchSearchInCenter,
		(branch, normalizedSearch) =>
			normalizeImportHeader(
				[branch.codigo, branch.id, branch.nome, branch.cidade, branch.uf]
					.filter(Boolean)
					.join(" "),
			).includes(normalizedSearch),
	);
	const centerCompanyResults = filterSearchResults(
		companies,
		form.companies || [],
		companySearchInCenter,
		(company, normalizedSearch) => {
			const branch = branchById.get(
				company.filialId || company.branchId || company.filiais?.[0],
			);
			return normalizeImportHeader(
				[
					company.codigo,
					company.id,
					company.nome,
					company.razaoSocial,
					company.cnpj,
					branch?.codigo,
					branch?.nome,
				]
					.filter(Boolean)
					.join(" "),
			).includes(normalizedSearch);
		},
	);

	const addCenterBranch = (branchId) => {
		update("branches", [...new Set([...(form.branches || []), branchId])]);
		setBranchSearchInCenter("");
	};

	const removeCenterBranch = (branchId) => {
		update(
			"branches",
			(form.branches || []).filter((item) => item !== branchId),
		);
	};

	const addCenterCompany = (company) => {
		const branchId =
			company.filialId || company.branchId || company.filiais?.[0] || "";
		update("companies", [...new Set([...(form.companies || []), company.id])]);
		if (branchId) {
			update("branches", [...new Set([...(form.branches || []), branchId])]);
		}
		setCompanySearchInCenter("");
	};

	const removeCenterCompany = (companyId) => {
		update(
			"companies",
			(form.companies || []).filter((item) => item !== companyId),
		);
	};

	const updateDirectorate = (value) => {
		const selected = findDirectorateByName(directorateOptions, value);
		setForm((current) => ({
			...current,
			diretoria: value,
			responsavel: selected?.diretor || current.responsavel || "",
			emailResponsavel:
				selected?.emailDiretor || current.emailResponsavel || "",
			telefoneResponsavel:
				selected?.numeroDiretor || current.telefoneResponsavel || "",
		}));
	};

	const save = () => {
		const isSyntheticCenter = form.tipoPlano === "S";
		const monthlyBudget = isSyntheticCenter
			? 0
			: parseMoneyInput(form.valorMensal);
		const next = {
			...form,
			companies: Array.isArray(form.companies) ? form.companies : [],
			branches: Array.isArray(form.branches) ? form.branches : [],
			contasFinanceiras: Array.isArray(form.contasFinanceiras)
				? form.contasFinanceiras
				: [],
			contaFinanceiraPadrao: form.contaFinanceiraPadrao || "",
			valorMensal: monthlyBudget,
			valorAnual: monthlyBudget * 12,
			orcamentoMensal: monthlyBudget,
			orcamentoAnual: monthlyBudget * 12,
			comprometidoMes: isSyntheticCenter
				? 0
				: parseMoneyInput(form.comprometidoMes),
			realizadoImportado: isSyntheticCenter ? 0 : form.realizadoImportado,
			orcadoImportado: isSyntheticCenter ? 0 : form.orcadoImportado,
			saldoImportado: isSyntheticCenter ? 0 : form.saldoImportado,
			realizedByCompanyBranch: isSyntheticCenter
				? []
				: form.realizedByCompanyBranch,
			realizadoPorEmpresaFilial: isSyntheticCenter
				? []
				: form.realizadoPorEmpresaFilial,
			linhasImportadas: isSyntheticCenter ? 0 : form.linhasImportadas,
			alertaPercentual: Number(form.alertaPercentual || 85),
		};
		delete next.realizadoMes;
		setValidationMessage("");
		onSave(next);
	};

	const monthlyBudgetPreview = parseMoneyInput(form.valorMensal);
	const annualBudgetPreview = monthlyBudgetPreview * 12;
	const saldoMes = monthlyBudgetPreview - parseMoneyInput(form.comprometidoMes);
	const usoPercentual = monthlyBudgetPreview
		? (parseMoneyInput(form.comprometidoMes) / monthlyBudgetPreview) * 100
		: 0;

	return {
		accountById,
		accountSearchInCenter,
		activeMovementMonth,
		addCenterAccount,
		addCenterBranch,
		addCenterCompany,
		annualBudgetPreview,
		branchById,
		branchSearchInCenter,
		centerAccountResults,
		centerBranchResults,
		centerCompanyResults,
		companyById,
		companySearchInCenter,
		directorateOptions,
		form,
		removeCenterAccount,
		removeCenterBranch,
		removeCenterCompany,
		saldoMes,
		save,
		selectedCenterAccounts,
		selectedCenterBranches,
		selectedCenterCompanies,
		setAccountSearchInCenter,
		setActiveMovementMonth,
		setBranchSearchInCenter,
		setCompanySearchInCenter,
		update,
		updateDirectorate,
		usoPercentual,
		validationMessage,
	};
}

export const __testables = {
	buildInitialCostCenterForm,
	filterSearchResults,
	getInitialMonthlyBudget,
};
