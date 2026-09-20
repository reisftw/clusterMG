const express = require("express");
const {
	createAtendimentoController,
} = require("../controllers/atendimentoController");

function createAtendimentoRouter({
	adminRoles,
	atendimentoService,
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
}) {
	const router = express.Router();
	const controller = createAtendimentoController({ atendimentoService });

	const casesView = requireAnyPermission(
		["atendimento.casos.view", "atendimento.casos.manage"],
		adminRoles,
	);
	const casesManage = requireAnyPermission(
		["atendimento.casos.manage"],
		adminRoles,
	);
	const techniciansView = requireAnyPermission(
		["atendimento.tecnicos.view", "atendimento.tecnicos.manage"],
		adminRoles,
	);
	const techniciansManage = requireAnyPermission(
		["atendimento.tecnicos.manage"],
		adminRoles,
	);
	const configView = requireAnyPermission(
		["atendimento.configuracoes.view", "atendimento.configuracoes.manage"],
		adminRoles,
	);
	const configManage = requireAnyPermission(
		["atendimento.configuracoes.manage"],
		adminRoles,
	);
	const templatesManage = requireAnyPermission(
		["atendimento.templates.manage"],
		adminRoles,
	);
	const logsView = requireAnyPermission(
		["atendimento.logs.view", "atendimento.logs.manage"],
		adminRoles,
	);
	const ratingsManage = requireAnyPermission(
		["atendimento.avaliacoes.manage"],
		adminRoles,
	);
	const adminOnly = requireAnyPermission(["*"], adminRoles);
	const casesActionGuard = (req, res, next) => {
		const action = String(req.body?.action || "").toLowerCase();
		return (action === "assumir" ? casesView : casesManage)(req, res, next);
	};

	router.get("/status", requireAuthenticated, configView, controller.getStatus);
	router.get("/stats", requireAuthenticated, casesView, controller.getStats);
	router.get("/config", requireAuthenticated, configView, controller.getConfig);
	router.put(
		"/config",
		requireAuthenticated,
		requireCsrfToken,
		configManage,
		controller.saveConfig,
	);
	router.delete(
		"/operational-data",
		requireAuthenticated,
		requireCsrfToken,
		adminOnly,
		controller.clearOperationalData,
	);
	router.get(
		"/templates",
		requireAuthenticated,
		templatesManage,
		controller.getTemplates,
	);
	router.put(
		"/templates",
		requireAuthenticated,
		requireCsrfToken,
		templatesManage,
		controller.saveTemplates,
	);
	router.post(
		"/connect",
		requireAuthenticated,
		requireCsrfToken,
		configManage,
		controller.connect,
	);
	router.post(
		"/disconnect",
		requireAuthenticated,
		requireCsrfToken,
		configManage,
		controller.disconnect,
	);
	router.post(
		"/instance/reset",
		requireAuthenticated,
		requireCsrfToken,
		configManage,
		controller.resetInstance,
	);
	router.post(
		"/webhook",
		requireAuthenticated,
		requireCsrfToken,
		configManage,
		controller.configureWebhook,
	);
	router.post(
		"/test",
		requireAuthenticated,
		requireCsrfToken,
		configManage,
		controller.sendTestMessage,
	);

	router.get("/cases", requireAuthenticated, casesView, controller.listCases);
	router.get("/cases/:id", requireAuthenticated, casesView, controller.getCase);
	router.patch(
		"/cases/:id",
		requireAuthenticated,
		requireCsrfToken,
		casesActionGuard,
		controller.updateCase,
	);
	router.post(
		"/cases/:id/reply",
		requireAuthenticated,
		requireCsrfToken,
		casesManage,
		controller.replyCase,
	);

	router.get(
		"/technicians",
		requireAuthenticated,
		techniciansView,
		controller.listTechnicians,
	);
	router.patch(
		"/technicians/:phone",
		requireAuthenticated,
		requireCsrfToken,
		techniciansManage,
		controller.updateTechnician,
	);
	router.delete(
		"/technicians/:phone",
		requireAuthenticated,
		requireCsrfToken,
		techniciansManage,
		controller.deleteTechnician,
	);
	router.post(
		"/technicians/validate-email",
		requireAuthenticated,
		requireCsrfToken,
		techniciansManage,
		controller.validateHubsoftEmail,
	);

	router.get(
		"/ratings",
		requireAuthenticated,
		ratingsManage,
		controller.listRatings,
	);
	router.get("/logs", requireAuthenticated, logsView, controller.listLogs);
	router.get(
		"/messages",
		requireAuthenticated,
		logsView,
		controller.listMessages,
	);

	return router;
}

module.exports = createAtendimentoRouter;
