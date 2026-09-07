const express = require("express");
const multer = require("multer");
const {
	createFinanceiroController,
} = require("../controllers/financeiroController");

const budgetUpload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: Number(
			process.env.FINANCEIRO_UPLOAD_LIMIT_BYTES || 30 * 1024 * 1024,
		),
		files: Number(process.env.FINANCEIRO_UPLOAD_MAX_FILES || 10),
	},
	fileFilter: (_req, file, callback) => {
		if (/\.xlsx$/i.test(file.originalname || "")) {
			callback(null, true);
			return;
		}
		callback(new Error("Envie apenas arquivos XLSX."));
	},
});

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
	const requireEquipeView = requireAnyPermission(
		["financeiro.equipe.view", "financeiro.equipe.manage"],
		financeiroRoles,
	);
	const requireEquipeManage = requireAnyPermission(
		["financeiro.equipe.manage"],
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
	router.post(
		"/orcamento/dados/import-jobs",
		requireAuthenticated,
		requireCsrfToken,
		requireBudgetConfigManage,
		budgetUpload.array("files", 10),
		controller.createBudgetDataImportJob,
	);
	router.get(
		"/orcamento/dados/import-jobs/:jobId",
		requireAuthenticated,
		requireBudgetConfigView,
		controller.getBudgetDataImportJob,
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
	router.get(
		"/equipe",
		requireAuthenticated,
		requireEquipeView,
		controller.getEquipe,
	);
	router.put(
		"/equipe/config",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.updateEquipeConfig,
	);
	router.post(
		"/equipe/setores",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.createEquipeSetor,
	);
	router.put(
		"/equipe/setores/:setorId",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.updateEquipeSetor,
	);
	router.delete(
		"/equipe/setores/:setorId",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.deleteEquipeSetor,
	);
	router.post(
		"/equipe/cargos",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.createEquipeCargo,
	);
	router.put(
		"/equipe/cargos/:cargoId",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.updateEquipeCargo,
	);
	router.delete(
		"/equipe/cargos/:cargoId",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.deleteEquipeCargo,
	);
	router.post(
		"/equipe/colaboradores",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.createEquipeColaborador,
	);
	router.put(
		"/equipe/colaboradores/:colaboradorId",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.updateEquipeColaborador,
	);
	router.patch(
		"/equipe/colaboradores/:colaboradorId/move",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.moveEquipeColaborador,
	);
	router.delete(
		"/equipe/colaboradores/:colaboradorId",
		requireAuthenticated,
		requireCsrfToken,
		requireEquipeManage,
		controller.deleteEquipeColaborador,
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
