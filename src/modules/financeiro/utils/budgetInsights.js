import { brl, decimal, integer } from "./financeiroFormatters";
import {
	BUDGET_CATEGORY_CLASSES,
	BUDGET_CATEGORY_CLASS_LABELS,
	enrichFinancialAccountWithCategory,
	getFinancialAccountCategoryCatalog,
} from "./budgetAccountCategories";

function dateFromInput(value) {
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function budgetMonthName(month) {
	return (
		[
			"",
			"Janeiro",
			"Fevereiro",
			"Marco",
			"Abril",
			"Maio",
			"Junho",
			"Julho",
			"Agosto",
			"Setembro",
			"Outubro",
			"Novembro",
			"Dezembro",
		][Number(month) || 0] || ""
	);
}

function formatBudgetMonthYear({ year, month } = {}) {
	const safeYear = Number(year) || new Date().getFullYear();
	const safeMonth = Number(month) || new Date().getMonth() + 1;
	return `${safeYear} - ${budgetMonthName(safeMonth)}`;
}

function formatBudgetPeriodDisplay(
	months = [],
	fallbackYear = new Date().getFullYear(),
) {
	const validMonths = months.filter(
		(item) => Number(item?.year) && Number(item?.month),
	);
	if (!validMonths.length) {
		return formatBudgetMonthYear({
			year: fallbackYear,
			month: new Date().getMonth() + 1,
		});
	}
	if (validMonths.length === 1) {
		return formatBudgetMonthYear(validMonths[0]);
	}
	const first = validMonths[0];
	const last = validMonths[validMonths.length - 1];
	return `${formatBudgetMonthYear(first)} até ${formatBudgetMonthYear(last)}`;
}

export function buildBudgetPeriod(selectedPeriod = {}) {
	const now = new Date();
	const currentYear = Number(selectedPeriod.referenceYear) || now.getFullYear();
	const currentMonth =
		Number(selectedPeriod.referenceMonth) || now.getMonth() + 1;
	if (selectedPeriod.mode === "year") {
		const months = Array.from({ length: 12 }, (_, index) => ({
			year: currentYear,
			month: index + 1,
		}));
		return {
			label: "ano",
			displayLabel: `${currentYear} - Ano`,
			months,
		};
	}
	if (selectedPeriod.mode === "custom") {
		const start = dateFromInput(selectedPeriod.startDate);
		const end = dateFromInput(selectedPeriod.endDate);
		if (start && end && start <= end) {
			const months = [];
			const startIndex = start.getFullYear() * 12 + start.getMonth();
			const endIndex = end.getFullYear() * 12 + end.getMonth();
			for (
				let monthIndex = startIndex;
				monthIndex <= endIndex;
				monthIndex += 1
			) {
				months.push({
					year: Math.trunc(monthIndex / 12),
					month: (monthIndex % 12) + 1,
				});
			}
			return {
				label: "período",
				displayLabel: formatBudgetPeriodDisplay(months, currentYear),
				months,
			};
		}
	}
	const months = [{ year: currentYear, month: currentMonth }];
	return {
		label: "mês",
		displayLabel: formatBudgetPeriodDisplay(months, currentYear),
		months,
	};
}

export function getBudgetPeriodKey(item = {}) {
	const year = Number(item.year || item.ano || 0);
	const month = Number(item.month || item.numMes || item.mesNumero || 0);
	return year && month ? `${year}-${month}` : "";
}

export function budgetPeriodMatches(item = {}, periodKeys = new Set()) {
	return periodKeys.has(getBudgetPeriodKey(item));
}

export function movementValue(movement = {}) {
	return (
		Number(
			movement.value ??
				movement.valor ??
				movement.realized ??
				movement.realizado ??
				movement.total ??
				0,
		) || 0
	);
}

export function movementSupplierName(movement = {}, fallback = "") {
	return (
		String(
			movement.supplier ||
				movement.fornecedor ||
				movement.partnerName ||
				movement.nomeFornecedor ||
				fallback ||
				"",
		).trim() || "Fornecedor não informado"
	);
}

export function getConfiguredCenterBudget(
	center = {},
	selectedPeriod = {},
	periodMonthCount = 1,
) {
	const monthly = Number(center.valorMensal || center.orcamentoMensal || 0);
	if (selectedPeriod.mode === "year") return monthly * 12;
	return monthly * Math.max(1, periodMonthCount);
}

function centerParentKey(center = {}) {
	return (
		String(center.parentId || center.parentCodigo || "").replace(/\D+/g, "") ||
		String(center.parentId || center.parentCodigo || "")
	);
}

function centerCodeKey(center = {}) {
	return (
		String(center.codigo || center.id || "").replace(/\D+/g, "") ||
		String(center.codigo || center.id || "")
	);
}

function sumBy(items = [], mapper = () => 0) {
	return items.reduce((sum, item, index) => sum + Number(mapper(item, index) || 0), 0);
}

function isSyntheticCenter(center = {}) {
	return center?.tipoPlano === "S";
}

function centerBreakdowns(center = {}) {
	return center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial || [];
}

function breakdownRealizedValue(item = {}) {
	return Number(item.realized ?? item.realizado ?? 0) || 0;
}

function shouldIncludeAccessBudgetItem(item = {}) {
	const quebra2 = normalizeBudgetText(item.quebra2 || item.Quebra2);
	if (quebra2 === "desconsiderar") return false;
	if (quebra2 === "projeto") return true;
	const grupo = normalizeBudgetText(item.grupo || item.Grupo);
	return !grupo || grupo === "sempre";
}

function buildChildrenByParentKey(centers = [], parentKeyResolver = centerParentKey) {
	const childrenByParentKey = new Map();
	centers
		.filter((center) => center.tipoPlano === "A")
		.forEach((center) => {
			const parentKey = parentKeyResolver(center);
			if (!parentKey) return;
			const current = childrenByParentKey.get(parentKey) || [];
			current.push(center);
			childrenByParentKey.set(parentKey, current);
		});
	return childrenByParentKey;
}

function uniqueById(items = []) {
	return items.filter(
		(item, index, allItems) =>
			allItems.findIndex((current) => current.id === item.id) === index,
	);
}

function createAnalyticChildrenResolver(centers = []) {
	const childrenByParentKey = buildChildrenByParentKey(centers);
	return (center = {}) => {
		if (!isSyntheticCenter(center)) return [];
		const key = centerCodeKey(center);
		const byId = childrenByParentKey.get(center.id) || [];
		const byCode = key ? childrenByParentKey.get(key) || [] : [];
		return uniqueById([...byId, ...byCode]);
	};
}

function rawCenterParentKey(center = {}) {
	return center.parentId || center.parentCodigo;
}

function createMatrixPeriodTotal(periodMonths = []) {
	return (row) =>
		periodMonths.reduce((sum, item) => {
			if (Number(row.year || item.year) !== item.year) return sum;
			return sum + Number(row.months?.[item.month - 1] || 0);
		}, 0);
}

function sumMatrixRows(rows = [], centers = [], rowTotal = () => 0) {
	return sumBy(rows, (row) => {
		const center = centers.find((item) => item.id === row.costCenterId);
		return isSyntheticCenter(center) ? 0 : rowTotal(row);
	});
}

function sumCenterConfiguredBudget(centers = [], selectedPeriod = {}, monthCount = 1) {
	return sumBy(centers, (center) =>
		getConfiguredCenterBudget(center, selectedPeriod, monthCount),
	);
}

function createRealizedForCenter(periodKeys = new Set()) {
	return (center) => {
		const breakdowns = centerBreakdowns(center);
		if (!breakdowns.length) return 0;
		return sumBy(
			breakdowns.filter((item) => periodKeys.has(getBudgetPeriodKey(item))),
			(item) =>
				shouldIncludeAccessBudgetItem(item) ? breakdownRealizedValue(item) : 0,
		);
	};
}

function buildMovementFromDetail(center = {}, breakdown = {}, movement = {}, index = 0) {
	return {
		...movement,
		id:
			movement.id ||
			`${center.id}-${breakdown.year || breakdown.ano}-${breakdown.month || breakdown.numMes}-${index}`,
		centerId: center.id,
		centerName: center.nome,
		accountId: movement.accountId || breakdown.accountId,
		companyId: movement.companyId || breakdown.companyId,
		branchId: movement.branchId || breakdown.branchId,
		grupo: movement.grupo || breakdown.grupo || "",
		quebra2: movement.quebra2 || breakdown.quebra2 || "",
		categoria: movement.categoria || breakdown.categoria || "",
		supplier: movementSupplierName(
			movement,
			(breakdown.suppliers || breakdown.fornecedores || [])[0],
		),
		value: movementValue(movement),
		year: Number(breakdown.year || breakdown.ano || 0),
		month: Number(breakdown.month || breakdown.numMes || 0),
	};
}

function buildMovementFromBreakdown(center = {}, breakdown = {}) {
	return {
		id: `${center.id}-${breakdown.year || breakdown.ano}-${breakdown.month || breakdown.numMes}-${breakdown.accountId || "sem-conta"}`,
		centerId: center.id,
		centerName: center.nome,
		accountId: breakdown.accountId,
		companyId: breakdown.companyId,
		branchId: breakdown.branchId,
		grupo: breakdown.grupo || "",
		quebra2: breakdown.quebra2 || "",
		categoria: breakdown.categoria || "",
		supplier:
			(breakdown.suppliers || breakdown.fornecedores || [])[0] ||
			"Fornecedor não informado",
		value: breakdownRealizedValue(breakdown),
		year: Number(breakdown.year || breakdown.ano || 0),
		month: Number(breakdown.month || breakdown.numMes || 0),
	};
}

function buildPeriodMovements(centers = [], periodKeys = new Set()) {
	return centers.flatMap((center) =>
		centerBreakdowns(center)
			.filter(
				(breakdown) =>
					budgetPeriodMatches(breakdown, periodKeys) &&
					shouldIncludeAccessBudgetItem(breakdown),
			)
			.flatMap((breakdown) => {
				const breakdownMovements = Array.isArray(
					breakdown.movements || breakdown.movimentacoes,
				)
					? breakdown.movements || breakdown.movimentacoes
					: [];
				return breakdownMovements.length
					? breakdownMovements.map((movement, index) =>
							buildMovementFromDetail(center, breakdown, movement, index),
						)
					: [buildMovementFromBreakdown(center, breakdown)];
			}),
	);
}

function buildMonthlyEvolutionRows({
	centers = [],
	referenceYear,
	plannedForMonth = () => 0,
} = {}) {
	return Array.from({ length: 12 }, (_, index) => {
		const month = index + 1;
		const realized = sumBy(centers, (center) =>
			sumBy(
				centerBreakdowns(center).filter(
					(item) =>
						Number(item.year || item.ano || referenceYear) === referenceYear &&
						Number(item.month || item.numMes || 0) === month,
				),
				breakdownRealizedValue,
			),
		);
		const planned = plannedForMonth(month);
		return {
			month,
			label: budgetMonthName(month).slice(0, 3),
			planned,
			realized,
			percent: planned ? (realized / planned) * 100 : 0,
		};
	});
}

function buildForecastRows(monthlyEvolution = []) {
	let cumulativeRealized = 0;
	return monthlyEvolution.map((row, index) => {
		cumulativeRealized += row.realized;
		const elapsedWithData =
			monthlyEvolution.slice(0, index + 1).filter((item) => item.realized > 0)
				.length || index + 1;
		const average = cumulativeRealized / Math.max(1, elapsedWithData);
		return {
			...row,
			cumulativeRealized,
			forecast: row.realized ? cumulativeRealized : average * (index + 1),
		};
	});
}

function buildAccountSummary(accountRows = []) {
	const accountSummaryMap = new Map();
	accountRows.forEach((item) => {
		const key = item.account?.id || item.row.accountId || "sem-conta";
		const current = accountSummaryMap.get(key) || {
			account: item.account,
			id: key,
			planned: 0,
			realized: 0,
		};
		current.planned += Number(item.planned || 0);
		current.realized += Number(item.realized || 0);
		accountSummaryMap.set(key, current);
	});
	return Array.from(accountSummaryMap.values())
		.map((item) => ({
			...item,
			deviation: item.realized - item.planned,
			percent: item.planned ? (item.realized / item.planned) * 100 : 0,
		}))
		.sort((left, right) => right.realized - left.realized);
}

function buildSupplierSummary(movements = [], realizedMonth = 0) {
	const supplierSummaryMap = new Map();
	movements.forEach((movement) => {
		const supplier = movementSupplierName(movement);
		const current = supplierSummaryMap.get(supplier) || {
			supplier,
			value: 0,
			rows: 0,
			centers: new Set(),
			accounts: new Set(),
		};
		current.value += movementValue(movement);
		current.rows += 1;
		if (movement.centerId) current.centers.add(movement.centerId);
		if (movement.accountId) current.accounts.add(movement.accountId);
		supplierSummaryMap.set(supplier, current);
	});
	return Array.from(supplierSummaryMap.values())
		.map((item) => ({
			...item,
			centers: Array.from(item.centers),
			accounts: Array.from(item.accounts),
			share: realizedMonth ? (item.value / realizedMonth) * 100 : 0,
		}))
		.sort((left, right) => right.value - left.value);
}

function budgetMetric(planned = 0, realized = 0) {
	return {
		planned,
		realized,
		deviation: realized - planned,
		percent: planned ? (realized / planned) * 100 : 0,
	};
}

function budgetStatusColor(percent = 0) {
	const safePercent = Number(percent || 0);
	if (safePercent > 95) return "rose";
	if (safePercent >= 70) return "amber";
	return "emerald";
}

function categoryBudgetMatchesPeriod(item = {}, periodKeys = new Set()) {
	const year = Number(item.year || item.ano || item.referenceYear);
	const month = Number(item.month || item.mes || item.numMes || item.referenceMonth);
	return year && month && periodKeys.has(`${year}-${month}`);
}

function categoryBudgetPeriodScope(item = {}) {
	return String(item.periodScope || item.escopoPeriodo || "")
		.trim()
		.toLowerCase();
}

function categoryBudgetHasRangePeriod(item = {}) {
	const scope = categoryBudgetPeriodScope(item);
	return Boolean(
		["project_range", "range", "period"].includes(scope) ||
			item.startYear ||
			item.anoInicio ||
			item.startMonth ||
			item.mesInicio ||
			item.endYear ||
			item.anoFim ||
			item.endMonth ||
			item.mesFim,
	);
}

function categoryBudgetMonthSerial(year, month) {
	const safeYear = Number(year);
	const safeMonth = Number(month);
	if (!safeYear || !safeMonth) return null;
	return safeYear * 12 + safeMonth;
}

function categoryBudgetRangeBoundary(item = {}, side = "start") {
	const isStart = side === "start";
	const year = Number(
		isStart
			? item.startYear || item.anoInicio || item.inicioAno
			: item.endYear || item.anoFim || item.fimAno,
	);
	const month = Number(
		isStart
			? item.startMonth || item.mesInicio || item.inicioMes
			: item.endMonth || item.mesFim || item.fimMes,
	);
	return categoryBudgetMonthSerial(year, month);
}

function categoryBudgetMatchesRange(item = {}, periodMonths = []) {
	if (!categoryBudgetHasRangePeriod(item)) return false;
	const months = periodMonths.length
		? periodMonths
		: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }];
	const start = categoryBudgetRangeBoundary(item, "start") || -Infinity;
	const end = categoryBudgetRangeBoundary(item, "end") || Infinity;
	return months.some((month) => {
		const selected = categoryBudgetMonthSerial(month.year, month.month);
		return selected !== null && selected >= start && selected <= end;
	});
}

function categoryBudgetHasFixedPeriod(item = {}) {
	return Boolean(
		Number(item.year || item.ano || item.referenceYear) &&
			Number(item.month || item.mes || item.numMes || item.referenceMonth),
	);
}

function categoryBudgetIsMonthlyDefault(item = {}) {
	return Boolean(
		!categoryBudgetHasRangePeriod(item) &&
			(categoryBudgetPeriodScope(item) === "monthly_default" ||
			item.appliesEveryMonth ||
			!categoryBudgetHasFixedPeriod(item)),
	);
}

function categoryBudgetAmount(item = {}) {
	return Number(item.orcado || item.planned || item.valor || item.value || 0);
}

function normalizeBudgetText(value = "") {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

const PROJECT_CENTER_SIGNALS = [
	"projeto",
	"projetos",
	"software",
	"nova loja",
	"dwdm",
	"expansa",
	"reforma",
	"vex",
	"swap zte",
	"teleporto",
	"hps",
	"construca",
	"novas portas",
	"campo belo",
	"sete lagoas",
];

function isProjectCenter(center = {}) {
	const quebra2 = normalizeBudgetText(center.quebra2 || center.Quebra2);
	const statusProjetos = normalizeBudgetText(
		center.statusProjetos || center.Status_Projetos || center.status_projetos,
	);
	if (quebra2 === "projeto" || statusProjetos) return true;

	const fields = [
		center.tipoCentro,
		center.tipo_centro,
		center.tipoDespesa,
		center.tipo_despesa,
		center.categoriaPrincipal,
		center.categoria,
		center.grupo,
		center.parentName,
		center.nome,
	];
	const text = fields.map(normalizeBudgetText).filter(Boolean).join(" ");
	return PROJECT_CENTER_SIGNALS.some((signal) => text.includes(signal));
}

function classifyBudgetRow(account = {}, center = {}, categoryCatalog = []) {
	if (account?.classificacaoImportada) {
		return account;
	}
	const enriched = enrichFinancialAccountWithCategory(account || {}, categoryCatalog);
	if (isProjectCenter(center)) {
		const projectName =
			center.nome || center.name || center.categoriaPrincipal || "Projetos";
		return {
			...enriched,
			categoriaMae: projectName,
			categoriaClasse: BUDGET_CATEGORY_CLASSES.PROJETOS,
			categoriaClasseLabel:
				BUDGET_CATEGORY_CLASS_LABELS[BUDGET_CATEGORY_CLASSES.PROJETOS],
			isBasal: false,
			isProject: true,
		};
	}
	return enriched;
}

function classifyBreakdownBudgetRow(account = {}, center = {}, breakdown = {}) {
	const quebra2 = normalizeBudgetText(breakdown.quebra2 || breakdown.Quebra2);
	const isProjectBreakdown = quebra2
		? quebra2 === "projeto"
		: isProjectCenter(center);
	const categoryName =
		isProjectBreakdown
			? center?.nome || center?.name || breakdown.categoria || "Projetos"
			: breakdown.categoria || account?.categoriaMae || account?.nome || "Sem categoria";
	const classType =
		isProjectBreakdown
			? BUDGET_CATEGORY_CLASSES.PROJETOS
			: quebra2 === "acompanhar"
				? BUDGET_CATEGORY_CLASSES.NAO_BASAL
				: quebra2 === "orcamento" || quebra2 === "orçamento"
					? BUDGET_CATEGORY_CLASSES.BASAL
					: account?.categoriaClasse || BUDGET_CATEGORY_CLASSES.BASAL;
	const classLabel =
		BUDGET_CATEGORY_CLASS_LABELS[classType] ||
		BUDGET_CATEGORY_CLASS_LABELS[BUDGET_CATEGORY_CLASSES.BASAL];
	return {
		...(account || {}),
		categoriaMae: categoryName,
		categoriaClasse: classType,
		categoriaClasseLabel: classLabel,
		isBasal: classType === BUDGET_CATEGORY_CLASSES.BASAL,
		isProject: classType === BUDGET_CATEGORY_CLASSES.PROJETOS,
		classificacaoImportada: true,
	};
}

function getBudgetCategoryContainer(classMap, classType, classLabel, categoryName) {
	const categoryKey = `${classType}:${categoryName}`;
	const currentClass = classMap.get(classType) || {
		id: classType,
		label: classLabel,
		planned: 0,
		realized: 0,
		categories: new Map(),
	};
	const currentCategory = currentClass.categories.get(categoryKey) || {
		id: categoryKey,
		name: categoryName,
		planned: 0,
		realized: 0,
		accounts: new Map(),
	};
	currentClass.categories.set(categoryKey, currentCategory);
	classMap.set(classType, currentClass);
	return { currentClass, currentCategory, categoryKey };
}

function categoryBudgetDimensionKey(item = {}) {
	const classType = item.classType || item.categoriaClasse || BUDGET_CATEGORY_CLASSES.BASAL;
	const categoryName = item.categoryName || item.categoriaMae || item.categoria || "Sem categoria";
	const accountName = item.accountName || item.contaNome || item.nomeConta || item.account || "Sem conta";
	return [
		classType,
		normalizeBudgetText(categoryName),
		normalizeBudgetText(accountName),
	].join(":");
}

function getEffectiveCategoryBudgets(categoryBudgets = [], periodMonths = []) {
	const months = periodMonths.length
		? periodMonths
		: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }];
	const periodKeys = new Set(months.map((month) => `${month.year}-${month.month}`));
	const exactBudgets = categoryBudgets.filter(
		(item) =>
			categoryBudgetMatchesPeriod(item, periodKeys) ||
			categoryBudgetMatchesRange(item, months),
	);
	const exactDimensionsByMonth = new Set(
		exactBudgets.flatMap((item) => {
			if (!categoryBudgetHasFixedPeriod(item)) return [];
			const year = Number(item.year || item.ano || item.referenceYear);
			const month = Number(item.month || item.mes || item.numMes || item.referenceMonth);
			return [`${year}-${month}:${categoryBudgetDimensionKey(item)}`];
		}),
	);
	const monthlyDefaults = categoryBudgets.filter(categoryBudgetIsMonthlyDefault);
	const defaultEntries = months.flatMap((month) =>
		monthlyDefaults
			.filter(
				(item) =>
					!exactDimensionsByMonth.has(
						`${month.year}-${month.month}:${categoryBudgetDimensionKey(item)}`,
					),
			)
			.map((item) => ({
				...item,
				year: month.year,
				ano: month.year,
				month: month.month,
				mes: month.month,
				numMes: month.month,
			})),
	);
	return [...exactBudgets, ...defaultEntries];
}

function applyCategoryBudgetOverrides(
	classMap,
	categoryBudgets = [],
	periodMonths = [],
) {
	const matchingBudgets = getEffectiveCategoryBudgets(categoryBudgets, periodMonths);
	const budgetsByAccount = new Map();
	matchingBudgets.forEach((item) => {
		const classType = item.classType || item.categoriaClasse || BUDGET_CATEGORY_CLASSES.BASAL;
		const categoryName = item.categoryName || item.categoriaMae || item.categoria || "Sem categoria";
		const accountName = item.accountName || item.contaNome || item.nomeConta || item.account || "Sem conta";
		const key = categoryBudgetDimensionKey(item);
		const current = budgetsByAccount.get(key) || {
			classType,
			categoryName,
			accountName,
			planned: 0,
		};
		current.planned += categoryBudgetAmount(item);
		budgetsByAccount.set(key, current);
	});
	budgetsByAccount.forEach((budget) => {
		const classLabel =
			BUDGET_CATEGORY_CLASS_LABELS[budget.classType] ||
			BUDGET_CATEGORY_CLASS_LABELS[BUDGET_CATEGORY_CLASSES.BASAL];
		const { currentClass, currentCategory, categoryKey } = getBudgetCategoryContainer(
			classMap,
			budget.classType,
			classLabel,
			budget.categoryName,
		);
		const normalizedAccountName = normalizeBudgetText(budget.accountName);
		const existingAccountEntry = Array.from(
			currentCategory.accounts.entries(),
		).find(
			([, account]) =>
				normalizeBudgetText(account.account?.nome || account.account?.name || account.id) ===
				normalizedAccountName,
		);
		const accountKey =
			existingAccountEntry?.[0] ||
			`${categoryKey}:orcado:${normalizedAccountName || "sem-conta"}`;
		const currentAccount = existingAccountEntry?.[1] || {
			id: accountKey,
			account: {
				id: accountKey,
				nome: budget.accountName,
				categoriaMae: budget.categoryName,
				categoriaClasse: budget.classType,
				categoriaClasseLabel: classLabel,
				isBasal: budget.classType === BUDGET_CATEGORY_CLASSES.BASAL,
			},
			planned: 0,
			realized: 0,
			centers: [],
		};
		const delta = budget.planned - Number(currentAccount.planned || 0);
		currentAccount.planned = budget.planned;
		currentClass.planned += delta;
		currentCategory.planned += delta;
		currentCategory.accounts.set(accountKey, currentAccount);
	});
}

function buildBudgetCategoryGroups(
	accountRows = [],
	accounts = [],
	categoryCatalog = [],
	options = {},
) {
	const classMap = new Map();
	getFinancialAccountCategoryCatalog(categoryCatalog).forEach((category) => {
		getBudgetCategoryContainer(
			classMap,
			category.classType,
			BUDGET_CATEGORY_CLASS_LABELS[category.classType],
			category.name,
		);
	});
	accountRows.forEach((row) => {
		const classification = classifyBudgetRow(
			row.account,
			row.center,
			categoryCatalog,
		);
		const classType =
			classification.categoriaClasse || BUDGET_CATEGORY_CLASSES.BASAL;
		const classLabel =
			classification.categoriaClasseLabel ||
			BUDGET_CATEGORY_CLASS_LABELS[classType] ||
			"BASAL";
		const categoryName = classification.categoriaMae || "Sem categoria";
		const accountId = row.account?.id || row.row?.accountId || "sem-conta";
		const { currentClass, currentCategory, categoryKey } = getBudgetCategoryContainer(
			classMap,
			classType,
			classLabel,
			categoryName,
		);
		const accountKey = `${categoryKey}:${accountId}`;
		const currentAccount = currentCategory.accounts.get(accountKey) || {
			id: accountId,
			account: classification,
			planned: 0,
			realized: 0,
			centers: [],
		};
		const planned = Number(row.planned || 0);
		const realized = Number(row.realized || 0);
		currentClass.planned += planned;
		currentClass.realized += realized;
		currentCategory.planned += planned;
		currentCategory.realized += realized;
		currentAccount.planned += planned;
		currentAccount.realized += realized;
		if (row.center) {
			currentAccount.centers.push({
				center: row.center,
				planned,
				realized,
				...budgetMetric(planned, realized),
			});
		}
		currentCategory.accounts.set(accountKey, currentAccount);
	});
	accounts
		.map((account) => enrichFinancialAccountWithCategory(account, categoryCatalog))
		.forEach((account) => {
		const classType = account.categoriaClasse || BUDGET_CATEGORY_CLASSES.BASAL;
		const classLabel =
			account.categoriaClasseLabel ||
			BUDGET_CATEGORY_CLASS_LABELS[classType] ||
			"BASAL";
		const categoryName = account.categoriaMae || "Sem categoria";
		const accountId = account.id || account.codigo || "sem-conta";
		const { currentCategory, categoryKey } = getBudgetCategoryContainer(
			classMap,
			classType,
			classLabel,
			categoryName,
		);
		const accountKey = `${categoryKey}:${accountId}`;
		if (!currentCategory.accounts.has(accountKey)) {
			currentCategory.accounts.set(accountKey, {
				id: accountId,
				account,
				planned: 0,
				realized: 0,
				centers: [],
			});
		}
		});
	applyCategoryBudgetOverrides(
		classMap,
		options.categoryBudgets || [],
		options.periodMonths || [],
	);
	return [
		BUDGET_CATEGORY_CLASSES.BASAL,
		BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		BUDGET_CATEGORY_CLASSES.PROJETOS,
	]
		.map((classType) => {
			const group = classMap.get(classType) || {
				id: classType,
				label: BUDGET_CATEGORY_CLASS_LABELS[classType],
				planned: 0,
				realized: 0,
				categories: new Map(),
			};
			const categories = Array.from(group.categories.values())
				.map((category) => ({
					...category,
					...budgetMetric(category.planned, category.realized),
					accounts: Array.from(category.accounts.values())
						.map((account) => ({
							...account,
							...budgetMetric(account.planned, account.realized),
							centers: account.centers.sort(
								(left, right) => right.realized - left.realized,
							),
						}))
						.sort((left, right) => right.realized - left.realized),
				}))
				.sort((left, right) => {
					const leftHasValue = left.planned || left.realized ? 1 : 0;
					const rightHasValue = right.planned || right.realized ? 1 : 0;
					if (leftHasValue !== rightHasValue) return rightHasValue - leftHasValue;
					return right.realized - left.realized;
				});
			return {
				...group,
				...budgetMetric(group.planned, group.realized),
				categories,
			};
		});
}

function buildAccountRows({
	accounts = [],
	centers = [],
	matrix = [],
	periodKeys = new Set(),
	projectPeriodKeys = periodKeys,
	rowPeriodTotal = () => 0,
	configuredBudgetForCenter = () => 0,
	realizedTotalForCenter = () => 0,
} = {}) {
	const selectedYears = new Set(
		Array.from(periodKeys)
			.map((key) => Number(String(key).split("-")[0] || 0))
			.filter(Boolean),
	);
	const matrixDimensionKeys = new Set(
		matrix.map((row) =>
			[
				row.costCenterId,
				row.accountId,
				Number(row.year || row.ano || 0),
			].join("|"),
		),
	);
	const matrixRows = matrix
		.map((row) => {
			const account = accounts.find((item) => item.id === row.accountId);
			const center = centers.find((item) => item.id === row.costCenterId);
			if (isSyntheticCenter(center)) return null;
			const rawPlanned = rowPeriodTotal(row);
			const rowYear = Number(row.year || row.ano || 0);
			const rowMatchesSelectedYear = !rowYear || selectedYears.has(rowYear);
			const periodBreakdowns = centerBreakdowns(center).filter(
				(item) =>
					(
						normalizeBudgetText(item.quebra2 || item.Quebra2) === "projeto" ||
						(!normalizeBudgetText(item.quebra2 || item.Quebra2) && isProjectCenter(center))
							? projectPeriodKeys
							: periodKeys
					).has(getBudgetPeriodKey(item)) &&
					shouldIncludeAccessBudgetItem(item),
			);
			const hasAccountScopedBreakdowns = periodBreakdowns.some((item) =>
				String(item.accountId || "").trim(),
			);
			const matchingBreakdowns = periodBreakdowns.filter(
				(item) => item.accountId === row.accountId,
			);
			const breakdownRealized = sumBy(
				matchingBreakdowns,
				breakdownRealizedValue,
			);
			const hasDirectBreakdown = matchingBreakdowns.length > 0;
			const accountForGrouping =
				hasDirectBreakdown && matchingBreakdowns[0]
					? classifyBreakdownBudgetRow(account, center, matchingBreakdowns[0])
					: account;
			const canFallbackToCenterRealized = !hasAccountScopedBreakdowns;
			const centerTotalPlanned = sumBy(
				matrix.filter((item) => item.costCenterId === row.costCenterId),
				rowPeriodTotal,
			);
			const configuredCenterPlanned = center
				? configuredBudgetForCenter(center)
				: 0;
			const planned =
				configuredCenterPlanned && centerTotalPlanned
					? (rawPlanned / centerTotalPlanned) * configuredCenterPlanned
					: rawPlanned;
			const centerRealized = realizedTotalForCenter(center || {});
			const realized = rowMatchesSelectedYear && hasDirectBreakdown
				? breakdownRealized
				: rowMatchesSelectedYear && canFallbackToCenterRealized && centerRealized
					? configuredCenterPlanned && planned
						? (planned / configuredCenterPlanned) * centerRealized
						: centerTotalPlanned
							? (rawPlanned / centerTotalPlanned) * centerRealized
							: 0
					: 0;
			return {
				row,
				account: accountForGrouping,
				center,
				...budgetMetric(planned, realized),
			};
		})
		.filter((item) => item && (item.planned || item.realized));
	const breakdownRows = centers.flatMap((center) => {
		if (isSyntheticCenter(center)) return [];
		return centerBreakdowns(center)
			.filter((breakdown) => {
				const quebra2 = normalizeBudgetText(breakdown.quebra2 || breakdown.Quebra2);
				const keys =
					quebra2 === "projeto" ||
					(!quebra2 && isProjectCenter(center))
						? projectPeriodKeys
						: periodKeys;
				const year = Number(breakdown.year || breakdown.ano || 0);
				const dimensionKey = [
					center.id,
					breakdown.accountId,
					year,
				].join("|");
				return (
					keys.has(getBudgetPeriodKey(breakdown)) &&
					shouldIncludeAccessBudgetItem(breakdown) &&
					!matrixDimensionKeys.has(dimensionKey)
				);
			})
			.map((breakdown) => {
				const account = accounts.find((item) => item.id === breakdown.accountId);
				const realized = breakdownRealizedValue(breakdown);
				return {
					row: {
						accountId: breakdown.accountId,
						costCenterId: center.id,
						year: Number(breakdown.year || breakdown.ano || 0),
						source: "importacao",
					},
					account: classifyBreakdownBudgetRow(account, center, breakdown),
					center,
					...budgetMetric(0, realized),
				};
			})
			.filter((item) => item.realized);
	});
	return [...matrixRows, ...breakdownRows];
}

function buildCenterRows({
	centers = [],
	matrix = [],
	rowPeriodTotal = () => 0,
	configuredBudgetForCenter = () => 0,
	realizedTotalForCenter = () => 0,
} = {}) {
	return centers.map((center) => {
		const plannedFromCenter = configuredBudgetForCenter(center);
		const planned =
			plannedFromCenter ||
			sumBy(
				matrix.filter((row) => row.costCenterId === center.id),
				rowPeriodTotal,
			);
		return {
			center,
			...budgetMetric(planned, realizedTotalForCenter(center)),
		};
	});
}

export function getBudgetInsights(config = {}, selectedPeriod = {}) {
	const categoryCatalog = config.settings?.financialAccountCategories || [];
	const categoryBudgets = config.settings?.financialCategoryBudgets || [];
	const accounts = (config.accounts || []).map((account) =>
		enrichFinancialAccountWithCategory(account, categoryCatalog),
	);
	const centers = config.centers || [];
	const matrix = config.matrix || [];
	const now = new Date();
	const period = buildBudgetPeriod(selectedPeriod);
	const referenceYear = Number(period.months[0]?.year) || now.getFullYear();
	const periodKeys = new Set(
		period.months.map((item) => `${item.year}-${item.month}`),
	);
	const projectPeriodKeys =
		selectedPeriod.mode === "month" && period.months.length === 1
			? new Set(
					Array.from({ length: Number(period.months[0]?.month || 0) }, (_, index) => {
						const month = index + 1;
						return `${period.months[0].year}-${month}`;
					}),
				)
			: periodKeys;
	const isCurrentSingleMonth =
		period.months.length === 1 &&
		Number(period.months[0]?.year) === now.getFullYear() &&
		Number(period.months[0]?.month) === now.getMonth() + 1;
	const activeMonth = period.months[0] || {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
	const daysInMonth = new Date(
		Number(activeMonth.year),
		Number(activeMonth.month),
		0,
	).getDate();
	const dayOfMonth = isCurrentSingleMonth ? now.getDate() : daysInMonth;
	const rowPeriodTotal = createMatrixPeriodTotal(period.months);
	const periodMonthCount = Math.max(1, period.months.length);
	const realizedForCenter = createRealizedForCenter(periodKeys);
	const analyticChildrenForCenter = createAnalyticChildrenResolver(centers);
	const centersForTotals = centers.filter((center) => !isSyntheticCenter(center));
	const configuredBudgetForCenter = (center) => {
		if (isSyntheticCenter(center)) {
			return sumCenterConfiguredBudget(
				analyticChildrenForCenter(center),
				selectedPeriod,
				periodMonthCount,
			);
		}
		return getConfiguredCenterBudget(center, selectedPeriod, periodMonthCount);
	};
	const realizedTotalForCenter = (center) => {
		if (isSyntheticCenter(center)) {
			return sumBy(
				analyticChildrenForCenter(center),
				(child) => realizedForCenter(child) + Number(child.comprometidoMes || 0),
			);
		}
		return realizedForCenter(center) + Number(center?.comprometidoMes || 0);
	};
	const plannedMonthFromMatrix = sumMatrixRows(matrix, centers, rowPeriodTotal);
	const plannedMonthFromCenters = sumCenterConfiguredBudget(
		centersForTotals,
		selectedPeriod,
		periodMonthCount,
	);
	const currentYearMatrix = matrix.filter(
		(row) => Number(row.year || referenceYear) === referenceYear,
	);
	const plannedYearFromMatrix = sumMatrixRows(
		currentYearMatrix,
		centers,
		(row) => sumBy(row.months || [], (value) => value),
	);
	const plannedYearFromCenters = sumCenterConfiguredBudget(
		centersForTotals,
		{ mode: "year" },
		12,
	);
	const plannedMonthFromCategories = sumBy(
		getEffectiveCategoryBudgets(categoryBudgets, period.months),
		categoryBudgetAmount,
	);
	const yearPeriodMonths = Array.from({ length: 12 }, (_, index) => ({
		year: referenceYear,
		month: index + 1,
	}));
	const plannedYearFromCategories = sumBy(
		getEffectiveCategoryBudgets(categoryBudgets, yearPeriodMonths),
		categoryBudgetAmount,
	);
	const plannedMonth = plannedMonthFromCategories || plannedMonthFromCenters || plannedMonthFromMatrix;
	const plannedYear = plannedYearFromCategories || plannedYearFromCenters || plannedYearFromMatrix;
	const realizedMonth = sumBy(centersForTotals, realizedForCenter);
	const committedMonth = sumBy(
		centersForTotals,
		(center) => center.comprometidoMes,
	);
	const availableMonth = plannedMonth - realizedMonth - committedMonth;
	const idealBurn = plannedMonth
		? (plannedMonth / daysInMonth) * dayOfMonth
		: 0;
	const usedPercent = plannedMonth
		? ((realizedMonth + committedMonth) / plannedMonth) * 100
		: 0;
	const idealPercent = plannedMonth ? (idealBurn / plannedMonth) * 100 : 0;
	const computedApprovals = centers
		.filter((center) => center.tipoPlano !== "S")
		.map((center) => {
			const centerPlanned =
				configuredBudgetForCenter(center) ||
				matrix
					.filter((row) => row.costCenterId === center.id)
					.reduce((sum, row) => sum + rowPeriodTotal(row), 0);
			const used = realizedTotalForCenter(center);
			const percent = centerPlanned ? (used / centerPlanned) * 100 : 0;
			return {
				id: `orcamento-estouro-${center.id}-${period.months[0]?.year || now.getFullYear()}-${period.months[0]?.month || now.getMonth() + 1}`,
				type: "estouro_orcamento",
				center,
				centerPlanned,
				budgeted: centerPlanned,
				used,
				realized: realizedForCenter(center),
				committed: Number(center.comprometidoMes || 0),
				percent,
				overflow: used - centerPlanned,
				reason: `Centro de custo consumiu ${decimal.format(percent)}% do orçamento.`,
				status: "pendente",
				source: "calculado",
			};
		})
		.filter((item) => item.centerPlanned && item.percent > 100);
	const approvalMap = new Map(
		computedApprovals.map((approval) => [approval.id, approval]),
	);
	(config.approvals || []).forEach((approval) => {
		const center = centers.find((item) => item.id === approval.centerId);
		const used =
			Number(approval.realized || 0) + Number(approval.committed || 0);
		approvalMap.set(approval.id, {
			...approvalMap.get(approval.id),
			...approval,
			center,
			centerPlanned: Number(
				approval.budgeted || approvalMap.get(approval.id)?.centerPlanned || 0,
			),
			budgeted: Number(
				approval.budgeted || approvalMap.get(approval.id)?.budgeted || 0,
			),
			used: used || approvalMap.get(approval.id)?.used || 0,
			overflow: Number(
				approval.overflow || approvalMap.get(approval.id)?.overflow || 0,
			),
			percent: Number(
				approval.percent || approvalMap.get(approval.id)?.percent || 0,
			),
		});
	});
	const approvalsAll = Array.from(approvalMap.values()).sort((left, right) => {
		const leftPending = left.status === "pendente" ? 1 : 0;
		const rightPending = right.status === "pendente" ? 1 : 0;
		if (leftPending !== rightPending) return rightPending - leftPending;
		return String(right.updatedAt || right.createdAt || "").localeCompare(
			String(left.updatedAt || left.createdAt || ""),
		);
	});
	const approvals = approvalsAll.filter(
		(approval) => approval.status === "pendente",
	);
	const accountRows = buildAccountRows({
		accounts,
		centers,
		matrix,
		periodKeys,
		projectPeriodKeys,
		rowPeriodTotal,
		configuredBudgetForCenter,
		realizedTotalForCenter,
	});
	const centerRows = buildCenterRows({
		centers,
		matrix,
		rowPeriodTotal,
		configuredBudgetForCenter,
		realizedTotalForCenter,
	});
	const movements = buildPeriodMovements(centersForTotals, periodKeys);
	const monthlyEvolution = buildMonthlyEvolutionRows({
		centers: centersForTotals,
		referenceYear,
		plannedForMonth: (month) => {
			const monthPeriod = [{ year: referenceYear, month }];
			const categoryPlanned = sumBy(
				getEffectiveCategoryBudgets(categoryBudgets, monthPeriod),
				categoryBudgetAmount,
			);
			if (categoryPlanned) return categoryPlanned;
			const matrixPlanned = sumMatrixRows(
				matrix,
				centers,
				createMatrixPeriodTotal(monthPeriod),
			);
			if (matrixPlanned) return matrixPlanned;
			return sumCenterConfiguredBudget(centersForTotals, { mode: "month" }, 1);
		},
	});
	const forecastRows = buildForecastRows(monthlyEvolution);
	const accountSummary = buildAccountSummary(accountRows);
	const budgetCategoryGroups = buildBudgetCategoryGroups(
		accountRows,
		accounts,
		categoryCatalog,
		{ categoryBudgets, periodMonths: period.months },
	);
	const centerSummary = centerRows
		.filter(({ center }) => center?.tipoPlano === "A")
		.map((item) => ({ ...item, id: item.center?.id }))
		.sort((left, right) => right.realized - left.realized);
	const supplierSummary = buildSupplierSummary(movements, realizedMonth);
	return {
		accounts,
		centers,
		matrix,
		plannedMonth,
		plannedYear,
		realizedMonth,
		committedMonth,
		availableMonth,
		usedPercent,
		idealPercent,
		approvals,
		approvalsAll,
		accountRows,
		budgetCategoryGroups,
		centerRows,
		movements,
		monthlyEvolution,
		forecastRows,
		accountSummary,
		centerSummary,
		supplierSummary,
		periodLabel: period.label,
		periodDisplayLabel: period.displayLabel,
	};
}

export function budgetConsumptionStatus(percent = 0) {
	if (percent > 95) {
		return {
			label: "Estourado",
			textClass: "text-red-600",
			barClass: "bg-red-500",
		};
	}
	if (percent >= 70) {
		return {
			label: "Atenção",
			textClass: "text-amber-600",
			barClass: "bg-amber-400",
		};
	}
	return {
		label: "Positivo",
		textClass: "text-emerald-600",
		barClass: "bg-emerald-500",
	};
}

export function budgetVarianceMeta(planned = 0, realized = 0) {
	const variance = Number(planned || 0) - Number(realized || 0);
	const percent = Number(planned || 0)
		? (variance / Number(planned || 0)) * 100
		: 0;
	const favorable = variance >= 0;
	return {
		variance,
		percent,
		favorable,
		textClass: favorable ? "text-emerald-600" : "text-red-600",
	};
}

function normalizeBudgetEmail(value) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

function getCurrentUserBudgetEmail(user = {}) {
	return normalizeBudgetEmail(
		user.email || user.profile?.email || user.user?.email,
	);
}

export function isBudgetCenterResponsible(user, center = {}) {
	const userEmail = getCurrentUserBudgetEmail(user);
	return Boolean(
		userEmail && normalizeBudgetEmail(center.emailResponsavel) === userEmail,
	);
}

export function buildBudgetOperationalKpis(insights = {}, config = {}) {
	const basal = (insights.budgetCategoryGroups || []).find(
		(item) => item.id === BUDGET_CATEGORY_CLASSES.BASAL,
	);
	const nonBasal = (insights.budgetCategoryGroups || []).find(
		(item) => item.id === BUDGET_CATEGORY_CLASSES.NAO_BASAL,
	);
	const projects = (insights.budgetCategoryGroups || []).find(
		(item) => item.id === BUDGET_CATEGORY_CLASSES.PROJETOS,
	);
	const usedPercent = Number(insights.usedPercent || 0);
	const statusColor = budgetStatusColor(usedPercent);
	const availablePercent = Math.max(0, Math.min(100, 100 - usedPercent));
	return [
		{
			id: "orcado",
			title:
				insights.periodLabel === "ano"
					? "Orçado no ano"
					: insights.periodLabel === "período"
						? "Orçado no período"
						: "Orçado no mês",
			value: insights.plannedMonth,
			type: "currency",
			helper: `${insights.periodDisplayLabel} · ${integer.format(insights.matrix?.length || 0)} linha(s) na matriz`,
			icon: "BadgeDollarSign",
		},
		{
			id: "realizado",
			title: "Realizado + comprometido",
			value: Number(insights.realizedMonth || 0) + Number(insights.committedMonth || 0),
			type: "currency",
			helper: insights.periodDisplayLabel,
			icon: "Wallet",
			statusColor,
			progress: {
				value: usedPercent,
				label: `${decimal.format(usedPercent)}% consumido`,
			},
		},
		{
			id: "saldo",
			title: "Saldo disponível",
			value: insights.availableMonth,
			type: "currency",
			helper:
				Number(insights.availableMonth || 0) < 0
					? "Estourado"
					: "Dentro do orçamento",
			icon: "CircleDollarSign",
			statusColor,
			progress: {
				value: availablePercent,
				label: `${decimal.format(availablePercent)}% disponível`,
			},
		},
		{
			id: "aprovacoes",
			title: "Aprovações pendentes",
			value: insights.approvals?.length || 0,
			type: "integer",
			helper: "Geradas por estouro/alerta",
			icon: "ClipboardCheck",
		},
		{
			id: "ano",
			title: "Budget anual",
			value: insights.plannedYear,
			type: "currency",
			helper: `${integer.format((config.versions || []).length)} versão(ões)`,
			icon: "Landmark",
		},
		{
			id: "basal",
			title: "BASAL",
			value: basal?.planned || 0,
			type: "currency",
			helper: `Realizado ${brl.format(basal?.realized || 0)}`,
			icon: "Landmark",
		},
		{
			id: "nao-basal",
			title: "NÃO BASAL",
			value: nonBasal?.planned || 0,
			type: "currency",
			helper: `Realizado ${brl.format(nonBasal?.realized || 0)}`,
			icon: "FileText",
		},
		{
			id: "projetos",
			title: "PROJETOS",
			value: projects?.planned || 0,
			type: "currency",
			helper: `Realizado ${brl.format(projects?.realized || 0)}`,
			icon: "FolderKanban",
		},
	];
}

export function calculateBudgetReference(selectedPeriod = {}, now = new Date()) {
	const budgetPeriod = buildBudgetPeriod(selectedPeriod);
	const budgetPeriodMonths = budgetPeriod.months || [];
	const firstBudgetMonth = budgetPeriodMonths[0] || {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
	const budgetReferenceYear = Number(firstBudgetMonth.year || now.getFullYear());
	const budgetReferenceMonth = Math.max(
		1,
		Math.min(12, ...budgetPeriodMonths.map((item) => Number(item.month || 1))),
	);
	const isCurrentBudgetMonth =
		budgetPeriodMonths.length === 1 &&
		budgetReferenceYear === now.getFullYear() &&
		budgetReferenceMonth === now.getMonth() + 1;
	const daysInBudgetMonth = new Date(
		budgetReferenceYear,
		budgetReferenceMonth,
		0,
	).getDate();
	const elapsedBudgetDays = isCurrentBudgetMonth
		? now.getDate()
		: daysInBudgetMonth;
	return {
		budgetPeriod,
		budgetPeriodMonths,
		budgetReferenceYear,
		budgetReferenceMonth,
		isCurrentBudgetMonth,
		daysInBudgetMonth,
		elapsedBudgetDays,
	};
}

export function buildCostCenterTopCards({
	insights = {},
	expiringContracts = 0,
} = {}) {
	const basal = (insights.budgetCategoryGroups || []).find(
		(item) => item.id === BUDGET_CATEGORY_CLASSES.BASAL,
	);
	const nonBasal = (insights.budgetCategoryGroups || []).find(
		(item) => item.id === BUDGET_CATEGORY_CLASSES.NAO_BASAL,
	);
	const projects = (insights.budgetCategoryGroups || []).find(
		(item) => item.id === BUDGET_CATEGORY_CLASSES.PROJETOS,
	);
	const buildCategoryBudgetCard = (group, fallback) => {
		const planned = Number(group?.planned || 0);
		const realized = Number(group?.realized || 0);
		const available = planned - realized;
		const percent = planned ? (realized / planned) * 100 : 0;
		return {
			id: `cc-${fallback.id}`,
			title: `Orçamento ${fallback.label}`,
			value: planned,
			type: "currency",
			helper: `Saldo disponível: ${brl.format(available)} · Realizado + comprometido: ${brl.format(realized)}`,
			icon: fallback.icon,
			color: fallback.color,
			statusColor: budgetStatusColor(percent),
			progress: {
				value: percent,
				label: `${decimal.format(percent)}% consumido`,
			},
			trend: {
				status: available < 0 ? "negative" : "positive",
				direction: available < 0 ? "up" : "down",
				percent,
			},
			trendLabel: "consumido",
		};
	};
	return [
		buildCategoryBudgetCard(basal, {
			id: "basal",
			label: "BASAL",
			icon: "BadgeDollarSign",
			color: "blue",
		}),
		buildCategoryBudgetCard(nonBasal, {
			id: "nao-basal",
			label: "NÃO BASAL",
			icon: "Landmark",
			color: "violet",
		}),
		buildCategoryBudgetCard(projects, {
			id: "projetos",
			label: "PROJETOS",
			icon: "FolderKanban",
			color: "emerald",
		}),
		{
			id: "cc-alertas",
			title: "Pendências & Alertas",
			value: insights.approvals?.length || 0,
			type: "integer",
			helper: `${integer.format(insights.approvals?.length || 0)} aprovações / ${integer.format(expiringContracts)} contratos a vencer`,
			icon: "AlertTriangle",
			color:
				insights.approvals?.length || expiringContracts ? "amber" : "emerald",
			trend: {
				status:
					insights.approvals?.length || expiringContracts
						? "negative"
						: "positive",
				direction:
					insights.approvals?.length || expiringContracts ? "up" : "down",
				percent: (insights.approvals?.length || 0) + expiringContracts,
			},
			trendLabel:
				insights.approvals?.length || expiringContracts
					? "atenção"
					: "sem riscos",
		},
	];
}

function isCenterInactive(center) {
	return (
		String(center?.status || "")
			.toLowerCase()
			.includes("inativo") ||
		String(center?.nome || "")
			.toUpperCase()
			.includes("INATIVO")
	);
}

function sortBudgetCenters(left, right) {
	const leftInactive = isCenterInactive(left) ? 1 : 0;
	const rightInactive = isCenterInactive(right) ? 1 : 0;
	if (leftInactive !== rightInactive) return leftInactive - rightInactive;
	return String(left.classificacao || left.codigo || left.nome).localeCompare(
		String(right.classificacao || right.codigo || right.nome),
		"pt-BR",
		{ numeric: true },
	);
}

function metricForCenter(center, sourceMap) {
	const row = sourceMap.get(center?.id);
	if (row) return row;
	const planned = Number(center?.valorMensal || center?.orcamentoMensal || 0);
	const realized = Number(center?.realizadoImportado || center?.realizadoMes || 0);
	return {
		center,
		...budgetMetric(planned, realized),
	};
}

function buildCenterLookup(centers = []) {
	const lookup = new Map();
	centers.forEach((center) => {
		if (center.id) lookup.set(center.id, center);
		if (center.codigo) lookup.set(center.codigo, center);
		if (center.reduzida) {
			lookup.set(String(center.reduzida).replace(/\D+/g, ""), center);
		}
	});
	return lookup;
}

function childCentersForParent(parent = {}, childrenByParent = new Map()) {
	return uniqueById([
		...(childrenByParent.get(parent.id) || []),
		...(parent.codigo && parent.codigo !== parent.id
			? childrenByParent.get(parent.codigo) || []
			: []),
	]).sort(sortBudgetCenters);
}

function aggregateCenterMetrics(centers = [], sourceMap = new Map()) {
	const aggregate = centers.reduce(
		(acc, center) => {
			const metric = metricForCenter(center, sourceMap);
			acc.planned += Number(metric.planned || 0);
			acc.realized += Number(metric.realized || 0);
			return acc;
		},
		{ planned: 0, realized: 0 },
	);
	return budgetMetric(aggregate.planned, aggregate.realized);
}

export function buildOperationalCenterGroups({
	config = {},
	insights = {},
	currentUser = {},
	responsibleOnly = false,
} = {}) {
	const visibleCenterRows = responsibleOnly
		? (insights.centerRows || []).filter(({ center }) =>
				isBudgetCenterResponsible(currentUser, center),
			)
		: insights.centerRows || [];
	const rowByCenterId = new Map(
		visibleCenterRows.map((row) => [row.center?.id, row]),
	);
	const allRowByCenterId = new Map(
		(insights.centerRows || []).map((row) => [row.center?.id, row]),
	);
	const sortedOperationalCenters = [...(config.centers || [])].sort(
		sortBudgetCenters,
	);
	const operationalCenterByKey = buildCenterLookup(sortedOperationalCenters);
	const operationalCategoriesByCode = new Map(
		sortedOperationalCenters
			.filter((center) => Number(center.nivel || 0) === 2)
			.map((center) => [center.codigo || center.id, center]),
	);
	// A árvore operacional usa a chave crua para preservar vínculos já salvos.
	const operationalChildrenByParent = buildChildrenByParentKey(
		sortedOperationalCenters,
		rawCenterParentKey,
	);
	const visibleCenterIdSet = new Set(
		visibleCenterRows.map(({ center }) => center?.id).filter(Boolean),
	);
	const operationalCenterGroups = sortedOperationalCenters
		.filter(
			(center) => center.tipoPlano === "S" && Number(center.nivel || 0) > 2,
		)
		.map((center) => {
			const category =
				operationalCategoriesByCode.get(center.categoriaCodigo) ||
				operationalCenterByKey.get(center.categoriaCodigo);
			const rawChildren = childCentersForParent(
				center,
				operationalChildrenByParent,
			);
			const children = responsibleOnly
				? rawChildren.filter((child) => visibleCenterIdSet.has(child.id))
				: rawChildren;
			const parentVisible =
				!responsibleOnly ||
				visibleCenterIdSet.has(center.id) ||
				children.length > 0;
			if (!parentVisible) return null;
			const aggregateSource = responsibleOnly ? children : rawChildren;
			const aggregate = aggregateCenterMetrics(
				aggregateSource,
				responsibleOnly ? rowByCenterId : allRowByCenterId,
			);
			return {
				center,
				category,
				children,
				aggregateChildren: rawChildren,
				totalChildren: rawChildren.length,
				aggregate,
			};
		})
		.filter(Boolean);
	return {
		visibleCenterRows,
		rowByCenterId,
		allRowByCenterId,
		sortedOperationalCenters,
		operationalCenterGroups,
		metricForCenter: (center, sourceMap = allRowByCenterId) =>
			metricForCenter(center, sourceMap),
	};
}

export function paginateBudgetGroups(groups = [], page = 1, pageSize = 12) {
	const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
	const safePage = Math.min(page, totalPages);
	return {
		totalPages,
		safePage,
		rows: groups.slice((safePage - 1) * pageSize, safePage * pageSize),
	};
}

export function buildDirectorateRows(insights = {}, config = {}) {
	const directorateByName = new Map(
		(config.settings?.directorates || []).map((item) => [
			String(item.nome || item.name || "")
				.trim()
				.toLowerCase(),
			item,
		]),
	);
	const directorateSummary = (insights.centerSummary || []).reduce((map, item) => {
		const rawName = String(
			item.center?.diretoria || item.center?.directorate || "",
		).trim();
		const key = rawName.toLowerCase() || "sem-diretoria";
		const directorate = directorateByName.get(key);
		const current = map.get(key) || {
			id: key,
			nome: rawName || "Diretoria não informada",
			diretor: directorate?.diretor || directorate?.director || "",
			email: directorate?.emailDiretor || directorate?.directorEmail || "",
			planned: 0,
			realized: 0,
			centers: 0,
		};
		current.planned += Number(item.planned || 0);
		current.realized += Number(item.realized || 0);
		current.centers += 1;
		map.set(key, current);
		return map;
	}, new Map());
	return Array.from(directorateSummary.values())
		.map((item) => ({
			...item,
			available: Number(item.planned || 0) - Number(item.realized || 0),
			percent: item.planned ? (item.realized / item.planned) * 100 : 0,
		}))
		.sort((left, right) => right.realized - left.realized);
}

export function findBudgetParetoRows(insights = {}, limit = 8) {
	const rows = (insights.centerRows || [])
		.filter(({ center }) => center?.tipoPlano === "A")
		.sort((a, b) => b.percent - a.percent);
	return Number.isFinite(limit) ? rows.slice(0, limit) : rows;
}
