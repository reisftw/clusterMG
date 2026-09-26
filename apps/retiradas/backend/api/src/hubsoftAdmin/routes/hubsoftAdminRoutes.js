const express = require("express");
const {
	createHubsoftAdminController,
} = require("../controllers/hubsoftAdminController");

function createHubsoftAdminRouter({
	adminRoles,
	hubsoftIntegration,
	hubsoftSyncProfiles,
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
}) {
	const router = express.Router();
	const controller = createHubsoftAdminController({
		hubsoftIntegration,
		hubsoftSyncProfiles,
	});
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
	router.get(
		"/profiles",
		requireAuthenticated,
		requireAdmin,
		controller.listProfiles,
	);
	router.get(
		"/profiles/runs",
		requireAuthenticated,
		requireAdmin,
		controller.listProfileRuns,
	);
	router.post(
		"/profiles/:profile/run",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.runProfile,
	);
	router.get(
		"/records",
		requireAuthenticated,
		requireAdmin,
		controller.listRecords,
	);
	router.get(
		"/withdrawal-technicians",
		requireAuthenticated,
		requireAdmin,
		controller.listWithdrawalTechnicians,
	);
	router.put(
		"/withdrawal-technicians",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.saveWithdrawalTechnician,
	);
	router.post(
		"/withdrawal-technicians/discover",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.discoverWithdrawalTechnicians,
	);

	return router;
}

module.exports = createHubsoftAdminRouter;
