const express = require("express");

function asyncHandler(handler) {
	return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createWhatsappCloudRouter({
	service,
	requireAuthenticated,
	requireCsrfToken,
	requireAnyPermission,
	adminRoles = ["admin"],
}) {
	const router = express.Router();
	const requireView = requireAnyPermission(
		["whatsapp.visualizar", "whatsapp.diagnostico"],
		adminRoles,
	);
	const requireConfigure = requireAnyPermission(
		["whatsapp.configurar"],
		adminRoles,
	);
	const requireTest = requireAnyPermission(["whatsapp.testar"], adminRoles);
	const requireTemplates = requireAnyPermission(
		["whatsapp.templates"],
		adminRoles,
	);
	const requireDiagnostics = requireAnyPermission(
		["whatsapp.diagnostico"],
		adminRoles,
	);
	const requireActivate = requireAnyPermission(
		["whatsapp.ativar"],
		adminRoles,
	);
	const requireRollback = requireAnyPermission(
		["whatsapp.reverter"],
		adminRoles,
	);

	router.use(requireAuthenticated);

	router.get(
		"/overview",
		requireView,
		asyncHandler(async (_req, res) => res.json(await service.getOverview())),
	);
	router.get(
		"/config",
		requireView,
		asyncHandler(async (_req, res) => res.json(await service.getConfig())),
	);
	router.put(
		"/config",
		requireCsrfToken,
		requireConfigure,
		asyncHandler(async (req, res) =>
			res.json(await service.saveConfig(req.body || {}, req.user)),
		),
	);
	router.post(
		"/verify-token",
		requireCsrfToken,
		requireConfigure,
		asyncHandler(async (req, res) =>
			res.status(201).json(await service.generateVerifyToken(req.user)),
		),
	);
	router.put(
		"/secrets",
		requireCsrfToken,
		requireConfigure,
		asyncHandler(async (req, res) =>
			res.json(await service.saveSecrets(req.body || {}, req.user)),
		),
	);
	router.delete(
		"/secrets/:name",
		requireCsrfToken,
		requireConfigure,
		asyncHandler(async (req, res) =>
			res.json(await service.deleteSecret(req.params.name, req.user)),
		),
	);
	router.post(
		"/diagnostics",
		requireCsrfToken,
		requireTest,
		asyncHandler(async (req, res) =>
			res.json(await service.validateConnection(req.user)),
		),
	);

	router.get(
		"/recipients",
		requireView,
		asyncHandler(async (_req, res) =>
			res.json({ items: await service.listRecipients() }),
		),
	);
	router.post(
		"/recipients",
		requireCsrfToken,
		requireConfigure,
		asyncHandler(async (req, res) =>
			res.status(201).json(await service.addRecipient(req.body || {}, req.user)),
		),
	);
	router.delete(
		"/recipients/:id",
		requireCsrfToken,
		requireConfigure,
		asyncHandler(async (req, res) =>
			res.json(await service.revokeRecipient(req.params.id, req.user)),
		),
	);

	router.get(
		"/templates",
		requireView,
		asyncHandler(async (_req, res) =>
			res.json({ items: await service.listTemplates() }),
		),
	);
	router.post(
		"/templates/sync",
		requireCsrfToken,
		requireTemplates,
		asyncHandler(async (req, res) =>
			res.json(await service.syncTemplates(req.user)),
		),
	);

	router.get(
		"/tests",
		requireView,
		asyncHandler(async (req, res) =>
			res.json(await service.listTestMessages(req.query || {})),
		),
	);
	router.post(
		"/tests/send",
		requireCsrfToken,
		requireTest,
		asyncHandler(async (req, res) =>
			res.status(202).json(await service.sendTestMessage(req.body || {}, req.user)),
		),
	);

	router.get(
		"/webhooks",
		requireDiagnostics,
		asyncHandler(async (req, res) =>
			res.json(await service.listWebhookEvents(req.query || {})),
		),
	);
	router.get(
		"/activation/readiness",
		requireView,
		asyncHandler(async (_req, res) =>
			res.json(await service.getActivationReadiness()),
		),
	);
	router.post(
		"/activation",
		requireCsrfToken,
		requireActivate,
		asyncHandler(async (req, res) =>
			res.json(await service.activateProvider(req.body || {}, req.user)),
		),
	);
	router.post(
		"/rollback",
		requireCsrfToken,
		requireRollback,
		asyncHandler(async (req, res) =>
			res.json(await service.rollbackProvider(req.body || {}, req.user)),
		),
	);

	return router;
}

module.exports = createWhatsappCloudRouter;
