const express = require("express");
const {
	createMensageriaEvolutionController,
} = require("../controllers/mensageriaEvolutionController");

function createMensageriaEvolutionRouter({
	adminRoles,
	evolutionMessaging,
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
}) {
	const router = express.Router();
	const controller = createMensageriaEvolutionController({
		evolutionMessaging,
	});
	const requireApiView = requireAnyPermission(
		["mensageria.api.view", "mensageria.api.manage", "manage_mensageria"],
		adminRoles,
	);
	const requireApiManage = requireAnyPermission(
		["mensageria.api.manage", "manage_mensageria"],
		adminRoles,
	);
	const requireFilaManage = requireAnyPermission(
		["mensageria.fila.manage", "manage_mensageria"],
		adminRoles,
	);

	router.get(
		"/status",
		requireAuthenticated,
		requireApiView,
		controller.getStatus,
	);
	router.post(
		"/connect",
		requireAuthenticated,
		requireCsrfToken,
		requireApiManage,
		controller.connect,
	);
	router.post(
		"/disconnect",
		requireAuthenticated,
		requireCsrfToken,
		requireApiManage,
		controller.disconnect,
	);
	router.post(
		"/webhook",
		requireAuthenticated,
		requireCsrfToken,
		requireApiManage,
		controller.configureWebhook,
	);
	router.get(
		"/webhook",
		requireAuthenticated,
		requireApiView,
		controller.getWebhookInfo,
	);
	router.get(
		"/disconnect-logs",
		requireAuthenticated,
		requireApiView,
		controller.getDisconnectLogs,
	);
	router.post(
		"/run",
		requireAuthenticated,
		requireCsrfToken,
		requireFilaManage,
		controller.runQueueOnce,
	);
	router.post(
		"/test",
		requireAuthenticated,
		requireCsrfToken,
		requireApiManage,
		controller.sendTestMessage,
	);
	router.post(
		"/pause",
		requireAuthenticated,
		requireCsrfToken,
		requireFilaManage,
		controller.pauseQueue,
	);
	router.post(
		"/resume",
		requireAuthenticated,
		requireCsrfToken,
		requireFilaManage,
		controller.resumeQueue,
	);

	return router;
}

module.exports = createMensageriaEvolutionRouter;
