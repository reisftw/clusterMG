const express = require("express");
const {
	createEmailAdminController,
} = require("../controllers/emailAdminController");

function createEmailAdminRouter({
	adminRoles,
	emailService,
	notificationsService,
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
}) {
	const router = express.Router();
	const controller = createEmailAdminController({
		emailService,
		notificationsService,
	});
	const requireAdmin = requireRoles(adminRoles);

	router.get(
		"/config",
		requireAuthenticated,
		requireAdmin,
		controller.getConfig,
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
		controller.sendTestEmail,
	);
	router.get(
		"/logs",
		requireAuthenticated,
		requireAdmin,
		controller.listEmailLogs,
	);

	return router;
}

module.exports = createEmailAdminRouter;
