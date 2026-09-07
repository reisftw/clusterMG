import BudgetAccountsDetail from "./BudgetAccountsDetail";
import BudgetCentersDetail from "./BudgetCentersDetail";
import BudgetDirectoratesDetail from "./BudgetDirectoratesDetail";
import BudgetForecastDetail from "./BudgetForecastDetail";
import BudgetMonthlyDetail from "./BudgetMonthlyDetail";
import BudgetMovementsDetail from "./BudgetMovementsDetail";
import BudgetRhythmDetail from "./BudgetRhythmDetail";
import BudgetSuppliersDetail from "./BudgetSuppliersDetail";
import BudgetTreemapDetail from "./BudgetTreemapDetail";
import BudgetVillainsDetail from "./BudgetVillainsDetail";
import BudgetWaterfallDetail from "./BudgetWaterfallDetail";

export const BUDGET_DASHBOARD_DETAIL_RENDERERS = {
	ritmo: BudgetRhythmDetail,
	viloes: BudgetVillainsDetail,
	mensal: BudgetMonthlyDetail,
	forecast: BudgetForecastDetail,
	cascata: BudgetWaterfallDetail,
	contas: BudgetAccountsDetail,
	centros: BudgetCentersDetail,
	treemap: BudgetTreemapDetail,
	fornecedores: BudgetSuppliersDetail,
	diretorias: BudgetDirectoratesDetail,
	movimentacoes: BudgetMovementsDetail,
};

export function getBudgetDashboardDetailRenderer(detail) {
	return BUDGET_DASHBOARD_DETAIL_RENDERERS[detail] || null;
}
