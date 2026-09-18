const express = require("express");
const {
	createHubsoftAdminController,
} = require("../controllers/hubsoftAdminController");

function createHubsoftAdminRouter({
	adminRoles,
	hubsoftIntegration,
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
}) {
	const router = express.Router();
	const controller = createHubsoftAdminController({ hubsoftIntegration });
	const requireAdmin = requireRoles(adminRoles);

	router.get(
		"/config",
		requireAuthenticated,
		requireAdmin,
		controller.readConfig,
	);
	router.put(
		"/config",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.saveConfig,
	);
	router.post(
		"/test",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.testConnection,
	);
	router.post(
		"/associate",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.associateHubsoft,
	);
	router.get(
		"/ordens-servico",
		requireAuthenticated,
		requireAdmin,
		controller.searchOrdensServico,
	);
	router.post(
		"/sync",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.startSyncJob,
	);
	router.get(
		"/sync/jobs/:jobId",
		requireAuthenticated,
		requireAdmin,
		controller.getSyncJob,
	);
	router.get(
		"/sync/runs",
		requireAuthenticated,
		requireAdmin,
		controller.listSyncRuns,
	);

	return router;
}

module.exports = createHubsoftAdminRouter;
