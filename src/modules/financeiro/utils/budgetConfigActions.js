import { normalizeImportHeader } from "./budgetImportRows";
import { enrichFinancialAccountWithCategory } from "./budgetAccountCategories";

export function budgetEntityId(value, fallback = "item") {
	return (
		String(value || "")
			.trim()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || fallback
	);
}

export function findDirectorateByName(directorates = [], name = "") {
	const key = normalizeImportHeader(name);
	return (
		(directorates || []).find(
			(item) => normalizeImportHeader(item?.nome) === key,
		) || null
	);
}

export function upsertAccount(account, config = {}) {
	const rawId = String(account.id || account.codigo || account.nome || "").trim();
	const id = budgetEntityId(rawId, `conta-${Date.now()}`);
	const nextAccount = enrichFinancialAccountWithCategory(
		{ ...account, id },
		config.settings?.financialAccountCategories || [],
	);
	const currentAccounts = config.accounts || [];
	const existingIndex = currentAccounts.findIndex(
		(item) => item.id === id || item.codigo === account.codigo,
	);
	const previousId = existingIndex >= 0 ? currentAccounts[existingIndex].id : "";
	const nextAccounts =
		existingIndex >= 0
			? currentAccounts.map((item, index) =>
					index === existingIndex ? nextAccount : item,
				)
			: [...currentAccounts, nextAccount];
	const nextCenters = (config.centers || []).map((center) => ({
		...center,
		contasFinanceiras: (center.contasFinanceiras || []).map((item) =>
			item === previousId ? id : item,
		),
		contaFinanceiraPadrao:
			center.contaFinanceiraPadrao === previousId
				? id
				: center.contaFinanceiraPadrao,
	}));

	return { ...config, accounts: nextAccounts, centers: nextCenters };
}

export function removeAccount(accountId, config = {}) {
	return {
		...config,
		accounts: (config.accounts || []).filter((account) => account.id !== accountId),
		centers: (config.centers || []).map((center) => ({
			...center,
			contasFinanceiras: (center.contasFinanceiras || []).filter(
				(item) => item !== accountId,
			),
			contaFinanceiraPadrao:
				center.contaFinanceiraPadrao === accountId
					? ""
					: center.contaFinanceiraPadrao,
		})),
	};
}

export function upsertPartner(partner, config = {}) {
	const rawId = String(
		partner.id || partner.codigo || partner.cnpj || partner.nome || "",
	).trim();
	const id = budgetEntityId(rawId, `fornecedor-${Date.now()}`);
	const centrosCusto = [
		...new Set(
			[...(partner.centrosCusto || []), partner.centroCustoPadraoId].filter(
				Boolean,
			),
		),
	];
	const nextPartner = {
		...partner,
		id,
		centrosCusto,
		centroCustoPadraoId: centrosCusto[0] || "",
	};
	const currentPartners = config.partners || [];
	const existingIndex = currentPartners.findIndex(
		(item) =>
			item.id === id ||
			(partner.codigo && item.codigo === partner.codigo) ||
			(partner.cnpj && item.cnpj === partner.cnpj),
	);
	const previousId = existingIndex >= 0 ? currentPartners[existingIndex].id : "";
	const nextPartners =
		existingIndex >= 0
			? currentPartners.map((item, index) =>
					index === existingIndex ? nextPartner : item,
				)
			: [...currentPartners, nextPartner];
	const nextCenters = (config.centers || []).map((center) => ({
		...center,
		fornecedores: (center.fornecedores || []).map((partnerId) =>
			partnerId === previousId ? id : partnerId,
		),
	}));

	return { ...config, partners: nextPartners, centers: nextCenters };
}

export function removePartner(partnerId, config = {}) {
	return {
		...config,
		partners: (config.partners || []).filter((partner) => partner.id !== partnerId),
		centers: (config.centers || []).map((center) => ({
			...center,
			fornecedores: (center.fornecedores || []).filter(
				(item) => item !== partnerId,
			),
		})),
	};
}

export function upsertCompanyOrBranch(item, type, config = {}) {
	const isBranch = type === "branch";
	const rawId = String(item.id || item.codigo || item.nome || "").trim();
	const matrixId =
		item.empresaId ||
		item.companyId ||
		item.empresas?.[0] ||
		item.companies?.[0] ||
		"";
	const id = isBranch
		? budgetEntityId(
				`${matrixId || "matriz"}-${item.codigo || rawId}`,
				`filial-${Date.now()}`,
			)
		: budgetEntityId(rawId, `matriz-${Date.now()}`);
	const nextItem = isBranch
		? {
				...item,
				id,
				empresaId: matrixId,
				companyId: matrixId,
				empresas: matrixId ? [matrixId] : [],
				companies: matrixId ? [matrixId] : [],
			}
		: {
				...item,
				id,
				filialId: item.filialId || item.branchId || item.filiais?.[0] || "",
				branchId: item.branchId || item.filialId || item.filiais?.[0] || "",
				filiais: item.filiais || [],
			};

	if (isBranch) {
		return upsertBranch(nextItem, item, id, matrixId, config);
	}

	return upsertCompany(nextItem, item, id, config);
}

function upsertBranch(nextItem, originalItem, id, matrixId, config) {
	const currentBranches = config.branches || [];
	const existingIndex = currentBranches.findIndex(
		(branch) =>
			branch.id === id ||
			(branch.codigo === originalItem.codigo &&
				(branch.empresaId ||
					branch.empresas?.[0] ||
					branch.companies?.[0] ||
					"") === matrixId),
	);
	const previousId = existingIndex >= 0 ? currentBranches[existingIndex].id : "";
	const nextBranches =
		existingIndex >= 0
			? currentBranches.map((branch, index) =>
					index === existingIndex ? nextItem : branch,
				)
			: [...currentBranches, nextItem];
	const nextCompanies = (config.companies || []).map((company) => ({
		...company,
		filialId:
			company.id === matrixId
				? company.filialId || id
				: company.filialId === previousId
					? id
					: company.filialId,
		branchId:
			company.id === matrixId
				? company.branchId || id
				: company.branchId === previousId
					? id
					: company.branchId,
		filiais:
			company.id === matrixId
				? [
						...new Set([
							...(company.filiais || []).filter(
								(branchId) => branchId !== previousId,
							),
							id,
						]),
					]
				: (company.filiais || []).map((branchId) =>
						branchId === previousId ? id : branchId,
					),
	}));
	const nextCenters = (config.centers || []).map((center) => ({
		...center,
		branches: (center.branches || center.filiais || []).map((branchId) =>
			branchId === previousId ? id : branchId,
		),
	}));

	return {
		...config,
		branches: nextBranches,
		companies: nextCompanies,
		centers: nextCenters,
	};
}

function upsertCompany(nextItem, originalItem, id, config) {
	const currentCompanies = config.companies || [];
	const existingIndex = currentCompanies.findIndex(
		(company) => company.id === id || company.codigo === originalItem.codigo,
	);
	const previousId = existingIndex >= 0 ? currentCompanies[existingIndex].id : "";
	const nextCompanies =
		existingIndex >= 0
			? currentCompanies.map((company, index) =>
					index === existingIndex
						? { ...nextItem, filiais: company.filiais || [] }
						: company,
				)
			: [...currentCompanies, nextItem];
	const nextBranches = (config.branches || []).map((branch) => {
		const companiesInBranch = [
			...new Set(
				[...(branch.empresas || branch.companies || [])]
					.map((companyId) => (companyId === previousId ? id : companyId))
					.filter(Boolean),
			),
		];
		return {
			...branch,
			empresas: [...new Set(companiesInBranch)],
			companies: [...new Set(companiesInBranch)],
			empresaId: branch.empresaId === previousId ? id : branch.empresaId,
		};
	});
	const nextCenters = (config.centers || []).map((center) => ({
		...center,
		companies: (center.companies || center.empresas || []).map((companyId) =>
			companyId === previousId ? id : companyId,
		),
	}));

	return {
		...config,
		companies: nextCompanies,
		branches: nextBranches,
		centers: nextCenters,
	};
}

export function removeCompany(companyId, config = {}) {
	return {
		...config,
		companies: (config.companies || []).filter(
			(company) => company.id !== companyId,
		),
		branches: (config.branches || []).map((branch) => {
			const companiesInBranch = (branch.empresas || branch.companies || []).filter(
				(item) => item !== companyId,
			);
			return {
				...branch,
				empresas: companiesInBranch,
				companies: companiesInBranch,
				empresaId:
					branch.empresaId === companyId
						? companiesInBranch[0] || ""
						: branch.empresaId,
			};
		}),
		centers: (config.centers || []).map((center) => ({
			...center,
			companies: (center.companies || center.empresas || []).filter(
				(item) => item !== companyId,
			),
		})),
	};
}

export function removeBranch(branchId, config = {}) {
	return {
		...config,
		branches: (config.branches || []).filter((branch) => branch.id !== branchId),
		companies: (config.companies || []).map((company) => ({
			...company,
			filialId: company.filialId === branchId ? "" : company.filialId,
			branchId: company.branchId === branchId ? "" : company.branchId,
			filiais: (company.filiais || []).filter((item) => item !== branchId),
		})),
		centers: (config.centers || []).map((center) => ({
			...center,
			branches: (center.branches || center.filiais || []).filter(
				(item) => item !== branchId,
			),
		})),
	};
}

export function upsertCenter(center, config = {}, directorates = []) {
	const currentCenters = config.centers || [];
	const rawId = String(center.id || center.codigo || center.nome || "").trim();
	const id = budgetEntityId(rawId, `centro-${Date.now()}`);
	const selectedDirectorate = findDirectorateByName(
		directorates,
		center.diretoria,
	);
	const parentCenter = currentCenters.find(
		(item) =>
			item.id === center.parentId ||
			item.codigo === center.parentCodigo ||
			item.codigo === center.parentId,
	);
	const inheritedDirectorate =
		center.tipoPlano === "A" && !center.diretoria
			? parentCenter?.diretoria || ""
			: center.diretoria || "";
	const nextCenter = {
		...center,
		id,
		diretoria: inheritedDirectorate,
		responsavel:
			center.tipoPlano === "S" && selectedDirectorate?.diretor
				? selectedDirectorate.diretor
				: center.responsavel,
		emailResponsavel:
			center.tipoPlano === "S" && selectedDirectorate?.emailDiretor
				? selectedDirectorate.emailDiretor
				: center.emailResponsavel,
		telefoneResponsavel:
			center.tipoPlano === "S" && selectedDirectorate?.numeroDiretor
				? selectedDirectorate.numeroDiretor
				: center.telefoneResponsavel,
	};
	const existingIndex = currentCenters.findIndex(
		(item) => item.id === id || item.codigo === center.codigo,
	);
	const nextCenters =
		existingIndex >= 0
			? currentCenters.map((item, index) => {
					if (index === existingIndex) return nextCenter;
					const isChild =
						nextCenter.tipoPlano === "S" &&
						(item.parentId === nextCenter.id ||
							item.parentId === nextCenter.codigo ||
							item.parentCodigo === nextCenter.codigo);
					return isChild ? { ...item, diretoria: nextCenter.diretoria } : item;
				})
			: [...currentCenters, nextCenter];

	return { ...config, centers: nextCenters };
}

export function removeCenter(centerId, config = {}) {
	return {
		...config,
		centers: (config.centers || []).filter((center) => center.id !== centerId),
	};
}
