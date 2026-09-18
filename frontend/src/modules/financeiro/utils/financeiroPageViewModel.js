export const BUDGET_OPERATIONAL_PAGES = [
	"orcamentoDashboard",
	"orcamentoCentrosCusto",
	"orcamentoDre",
	"orcamentoAprovacoes",
];

export const HIDDEN_HEADER_CONTROL_PAGES = [
	"orcamentoDados",
	"orcamentoConfiguracoes",
	"reportsSerasa",
	"reportsTarifas",
	"reportsTarifasFaturas",
	"reportsTarifasRecCliente",
	"reportsTarifasFormasPagamento",
	"equipe",
];

export const COMPACT_REPORT_PAGES = [
	"reportsSerasa",
	"reportsTarifas",
	"reportsTarifasFaturas",
	"reportsTarifasRecCliente",
	"reportsTarifasFormasPagamento",
];

export const SIMPLE_SECTION_PAGES = [
	"contasPagar",
	"contasReceber",
	"faturamento",
	"notas",
];

export function getFinanceiroPageFlags(page) {
	const normalizedPage = String(page || "");
	return {
		isBudgetPage: normalizedPage.startsWith("orcamento"),
		isBudgetOperationalPage: BUDGET_OPERATIONAL_PAGES.includes(page),
		hideHeaderControls: HIDDEN_HEADER_CONTROL_PAGES.includes(page),
		isCompactReportPage: COMPACT_REPORT_PAGES.includes(page),
		isSimpleSectionPage: SIMPLE_SECTION_PAGES.includes(page),
	};
}

export function getBudgetReference(_config = {}, now = new Date()) {
	const referenceYear = now.getFullYear();
	const referenceMonth = now.getMonth() + 1;
	return { referenceYear, referenceMonth };
}

export function getBudgetMonthSelectorYear(
	selectedReference = {},
	budgetReference = {},
	fallbackYear = new Date().getFullYear(),
) {
	return Number(
		selectedReference.referenceYear ||
			budgetReference.referenceYear ||
			fallbackYear,
	);
}
