const express = require("express");
const {
	createMovimentacoesController,
} = require("../controllers/movimentacoesController");

function createMovimentacoesRouter({
	movimentacoesRepository,
	movimentacoesEntregas,
	movimentacoesOrdensFechadas,
	requireAuthenticated,
	requireAnyPermission,
	requireCsrfToken,
	viewPermissions,
	managePermissions,
	fallbackRoles,
}) {
	const router = express.Router();
	const controller = createMovimentacoesController({
		movimentacoesRepository,
		movimentacoesEntregas,
		movimentacoesOrdensFechadas,
	});
	const requireView = requireAnyPermission(viewPermissions, fallbackRoles);
	const requireManage = requireAnyPermission(managePermissions, fallbackRoles);

	router.get("/dashboard", requireAuthenticated, requireView, controller.getDashboard);
	router.get("/cidades", requireAuthenticated, requireView, controller.getCidades);
	router.get(
		"/equipamentos",
		requireAuthenticated,
		requireView,
		controller.getEquipamentos,
	);
	router.put(
		"/equipamentos",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		controller.saveEquipamentoConfig,
	);
	router.get("/lista", requireAuthenticated, requireView, controller.listMovimentacoes);
	router.get("/config", requireAuthenticated, requireView, controller.readConfig);
	router.put(
		"/config",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		controller.saveConfig,
	);
	router.post(
		"/scan",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		controller.startScan,
	);
	router.get("/scan/:jobId", requireAuthenticated, requireView, controller.getScanJob);
	router.post(
		"/ordens-fechadas/conciliar",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		controller.startOrdensFechadasConciliacao,
	);
	router.get(
		"/ordens-fechadas/conciliar/:jobId",
		requireAuthenticated,
		requireView,
		controller.getOrdensFechadasJob,
	);

	return router;
}

module.exports = createMovimentacoesRouter;
