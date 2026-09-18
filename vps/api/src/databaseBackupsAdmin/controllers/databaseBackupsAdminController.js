const auditLog = require("../../auditLog");

function getProfile(req) {
	return req.user?.profile || req.user || {};
}

function createDatabaseBackupsAdminController({
	databaseBackups,
	notificationsService,
}) {
	async function getBackupStatus(_req, res, next) {
		try {
			res.json(await databaseBackups.getBackupStatus());
		} catch (error) {
			next(error);
		}
	}

	async function createBackup(req, res, next) {
		try {
			const result = await databaseBackups.createBackup({
				reason: "manual",
				user: req.user,
			});
			// Auditoria (docs/TECHNICAL-AUDIT.md, achado #5): acao administrativa
			// sensivel, sem rastro nenhum ate aqui.
			auditLog.recordAuditLog({
				action: "create",
				module: "configuracao",
				entity: "database_backups",
				recordId: result?.latestBackup?.fileName || null,
				beforeData: null,
				afterData: result?.latestBackup || null,
				changedFields: ["latestBackup"],
			});
			notificationsService
				.createNotification({
					type: "backup",
					title: "Backup gerado",
					message: "Backup manual do PostgreSQL concluído com sucesso.",
					targetPath: "/configuracoes/banco-de-dados",
					severity: "success",
					user: getProfile(req),
					targets: { roles: ["admin"] },
					meta: {
						event: "backup_created",
						latestBackup: result.latestBackup || null,
					},
				})
				.catch((error) =>
					console.warn(
						"[notifications] Falha ao avisar backup:",
						error?.message || error,
					),
				);
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function restoreBackup(req, res, next) {
		try {
			if (String(req.body?.confirmation || "") !== "RESTAURAR BANCO") {
				res
					.status(400)
					.json({ error: "Digite RESTAURAR BANCO para confirmar." });
				return;
			}

			const result = await databaseBackups.restoreBackup(req.params.fileName, {
				user: req.user,
			});
			// Auditoria (docs/TECHNICAL-AUDIT.md, achado #5): restauracao de
			// backup e a acao administrativa mais sensivel deste controller
			// (reverte o banco inteiro) e nao deixava rastro nenhum ate aqui.
			auditLog.recordAuditLog({
				action: "restore",
				module: "configuracao",
				entity: "database_backups",
				recordId: req.params.fileName,
				beforeData: null,
				afterData: { fileName: req.params.fileName, result },
				changedFields: ["*"],
			});
			notificationsService
				.createNotification({
					type: "backup",
					title: "Rollback executado",
					message: `Backup ${req.params.fileName} restaurado no PostgreSQL.`,
					targetPath: "/configuracoes/banco-de-dados",
					severity: "warning",
					user: getProfile(req),
					targets: { roles: ["admin"] },
					meta: { event: "backup_restored", fileName: req.params.fileName },
				})
				.catch((error) =>
					console.warn(
						"[notifications] Falha ao avisar restore:",
						error?.message || error,
					),
				);
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	return {
		createBackup,
		getBackupStatus,
		restoreBackup,
	};
}

module.exports = {
	createDatabaseBackupsAdminController,
};
