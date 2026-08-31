const express = require("express");
const {
	createFinanceiroController,
} = require("../controllers/financeiroController");

function createFinanceiroRouter({
	financeiroManagePermissions,
	financeiroRoles,
	financeiroViewPermissions,
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
}) {
	const router = express.Router();
	const controller = createFinanceiroController();
	const requireFinanceiroView = requireAnyPermission(
		financeiroViewPermissions,
		financeiroRoles,
	);
	const requireFinanceiroManage = requireAnyPermission(
		financeiroManagePermissions,
		financeiroRoles,
	);
	const requireConfigView = requireAnyPermission(
		["financeiro.configuracoes.view", "financeiro.configuracoes.manage"],
		financeiroRoles,
	);
	const requireBudgetConfigView = requireAnyPermission(
		[
			"financeiro.gestao_orcamento.view",
			"financeiro.gestao_orcamento.manage",
			"financeiro.configuracoes.view",
			"financeiro.configuracoes.manage",
		],
		financeiroRoles,
	);
	const requireBudgetConfigManage = requireAnyPermission(
		["financeiro.gestao_orcamento.manage", "financeiro.configuracoes.manage"],
		financeiroRoles,
	);

	router.get(
		"/dashboard",
		requireAuthenticated,
		requireFinanceiroView,
		controller.getDashboard,
	);
	router.get(
		"/orcamento/centros-custo",
		requireAuthenticated,
		requireBudgetConfigView,
		controller.getBudgetCostCenters,
	);
	router.put(
		"/orcamento/centros-custo",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigManage,
		controller.saveBudgetCostCenters,
	);
	router.patch(
		"/orcamento/aprovacoes/:approvalId",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigView,
		controller.updateBudgetApproval,
	);
	router.get(
		"/orcamento/dados",
		requireAuthenticated,
		requireBudgetConfigView,
		controller.getBudgetData,
	);
	router.post(
		"/orcamento/dados",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigManage,
		controller.saveBudgetData,
	);
	router.delete(
		"/orcamento/dados",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigManage,
		controller.clearBudgetData,
	);
	router.get(
		"/gestao-orcamento/dre",
		requireAuthenticated,
		requireBudgetConfigView,
		controller.getDreStatement,
	);
	router.post(
		"/gestao-orcamento/dre/import",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigManage,
		controller.saveDreStatement,
	);
	router.post(
		"/gestao-orcamento/dre/fake-data",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigManage,
		controller.createFakeDreData,
	);
	router.delete(
		"/gestao-orcamento/dre/fake-data",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigManage,
		controller.deleteFakeDreData,
	);
	router.get(
		"/sheets-config",
		requireAuthenticated,
		requireConfigView,
		controller.getSheetsConfig,
	);
	router.get(
		"/reports/serasa",
		requireAuthenticated,
		requireConfigView,
		controller.getSerasaReport,
	);
	router.post(
		"/reports/serasa",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		controller.saveSerasaData,
	);
	router.delete(
		"/reports/serasa",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		controller.clearSerasaReport,
	);
	router.get(
		"/reports/tarifas",
		requireAuthenticated,
		requireConfigView,
		controller.getTariffsReport,
	);
	router.post(
		"/reports/tarifas",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		controller.saveTariffsReport,
	);
	router.delete(
		"/reports/tarifas",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		controller.clearTariffsReport,
	);
	router.put(
		"/sheets-config",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		controller.saveSheetsConfig,
	);
	router.post(
		"/sheets-config/test/:sourceId",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		controller.testSheetSource,
	);
	router.post(
		"/sheets-config/sync",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		controller.runSheetsImport,
	);
	router.get(
		"/sheets-config/logs",
		requireAuthenticated,
		requireConfigView,
		controller.listImportLogs,
	);

	return router;
}

module.exports = createFinanceiroRouter;
