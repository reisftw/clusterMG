const express = require("express");
const push = require("../../pushNotificationsService");

function profile(req) {
	return req.user?.profile || req.user || {};
}

function createPushNotificationsRouter({ requireAuthenticated, requireCsrfToken, requireAnyPermission, adminRoles = ["admin"] }) {
	const router = express.Router();
	const requireManage = requireAnyPermission(["configuracao.notificacoes.manage", "tentativas.gestao.visualizar"], adminRoles);

	router.get("/config", requireAuthenticated, async (_req, res, next) => {
		try { res.json(await push.getPublicConfig()); } catch (error) { next(error); }
	});
	router.post("/subscribe", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
		try { res.json(await push.saveSubscription({ user: profile(req), subscription: req.body?.subscription, topics: req.body?.topics, userAgent: req.get("user-agent") })); } catch (error) { next(error); }
	});
	router.delete("/subscribe", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
		try { res.json(await push.removeSubscription({ user: profile(req), endpoint: req.body?.endpoint })); } catch (error) { next(error); }
	});
	router.post("/events/open", requireAuthenticated, async (req, res, next) => {
		try { res.json(await push.recordOpen({ user: profile(req), notificationId: req.body?.notificationId, channel: req.body?.channel || "IN_APP" })); } catch (error) { next(error); }
	});
	router.get("/overview", requireAuthenticated, requireManage, async (_req, res, next) => {
		try { res.json(await push.getOverview()); } catch (error) { next(error); }
	});

	return router;
}

module.exports = createPushNotificationsRouter;
