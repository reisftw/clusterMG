const express = require("express");
const {
	createEvidenciasController,
} = require("../controllers/evidenciasController");

function createEvidenciasRouter({
	requireAuthenticated,
	requireAnyPermission,
	requireCsrfToken,
}) {
	const router = express.Router();
	const controller = createEvidenciasController();
	const requireView = requireAnyPermission([
		"evidencias.view",
		"evidencias.manage",
		"view_mensageria",
		"manage_mensageria",
	]);
	const requireManage = requireAnyPermission([
		"evidencias.manage",
		"manage_mensageria",
	]);

	router.get("/dashboard", requireAuthenticated, requireView, controller.dashboard);
	router.get("/", requireAuthenticated, requireView, controller.list);
	router.get("/:id", requireAuthenticated, requireView, controller.detail);
	router.post(
		"/:id/retry",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		controller.retry,
	);

	return router;
}

module.exports = createEvidenciasRouter;
