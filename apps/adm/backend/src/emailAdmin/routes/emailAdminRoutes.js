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
	requireAnyPermission,
	requireRoles,
}) {
	const router = express.Router();
	const controller = createEmailAdminController({
		emailService,
		notificationsService,
	});
	const requireEmailView = requireAnyPermission
		? requireAnyPermission(
				[
					"administrativo.email.view",
					"administrativo.email.manage",
					"mensageria.email_config.view",
					"mensageria.email_config.manage",
				],
				adminRoles,
			)
		: requireRoles(adminRoles);
	const requireEmailManage = requireAnyPermission
		? requireAnyPermission(
				[
					"administrativo.email.manage",
					"mensageria.email_config.manage",
				],
				adminRoles,
			)
		: requireRoles(adminRoles);

	router.get(
		"/config",
		requireAuthenticated,
		requireEmailView,
		controller.getConfig,
	);
	router.put(
		"/config",
		requireAuthenticated,
		requireCsrfToken,
		requireEmailManage,
		controller.saveConfig,
	);
	router.post(
		"/test",
		requireAuthenticated,
		requireCsrfToken,
		requireEmailManage,
		controller.sendTestEmail,
	);
	router.get(
		"/logs",
		requireAuthenticated,
		requireEmailView,
		controller.listEmailLogs,
	);

	return router;
}

module.exports = createEmailAdminRouter;
