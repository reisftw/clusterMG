const express = require("express");
const {
	createSeniorAdminController,
} = require("../controllers/seniorAdminController");

function createSeniorAdminRouter({
	adminRoles,
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
	seniorIntegration,
}) {
	const router = express.Router();
	const controller = createSeniorAdminController({ seniorIntegration });
	const requireSeniorView = requireAnyPermission(
		[
			"manage_integracoes",
			"configuracao.senior.view",
			"configuracao.senior.manage",
		],
		adminRoles,
	);
	const requireSeniorManage = requireAnyPermission(
		["manage_integracoes", "configuracao.senior.manage"],
		adminRoles,
	);

	router.get(
		"/config",
		requireAuthenticated,
		requireSeniorView,
		controller.readConfig,
	);
	router.put(
		"/config",
		requireAuthenticated,
		requireCsrfToken,
		requireSeniorManage,
		controller.saveConfig,
	);
	router.post(
		"/test",
		requireAuthenticated,
		requireCsrfToken,
		requireSeniorManage,
		controller.testConnection,
	);

	return router;
}

module.exports = createSeniorAdminRouter;
