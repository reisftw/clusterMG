const express = require("express");
const {
	createDatabaseBackupsAdminController,
} = require("../controllers/databaseBackupsAdminController");

function createDatabaseBackupsAdminRouter({
	adminRoles,
	databaseBackups,
	notificationsService,
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
}) {
	const router = express.Router();
	const controller = createDatabaseBackupsAdminController({
		databaseBackups,
		notificationsService,
	});
	const requireAdmin = requireRoles(adminRoles);

	router.get(
		"/backups",
		requireAuthenticated,
		requireAdmin,
		controller.getBackupStatus,
	);
	router.post(
		"/backups",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.createBackup,
	);
	router.post(
		"/backups/:fileName/restore",
		requireAuthenticated,
		requireCsrfToken,
		requireAdmin,
		controller.restoreBackup,
	);

	return router;
}

module.exports = createDatabaseBackupsAdminRouter;
