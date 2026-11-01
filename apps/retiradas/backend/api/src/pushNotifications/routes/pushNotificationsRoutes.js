const express = require("express");
const push = require("../../pushNotificationsService");

function profile(req) {
	return req.user?.profile || req.user || {};
}

function createPushNotificationsRouter({ requireAuthenticated, requireCsrfToken, requireAnyPermission, notificationsService, pushService = push, adminRoles = ["admin"] }) {
	const router = express.Router();
	const requireView = requireAnyPermission(["configuracao.push.view", "configuracao.push.manage"], adminRoles);
	const requireManage = requireAnyPermission(["configuracao.push.manage"], adminRoles);

	router.get("/config", requireAuthenticated, async (_req, res, next) => {
		try { res.json(await pushService.getPublicConfig()); } catch (error) { next(error); }
	});
	router.post("/subscribe", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
		try { res.json(await pushService.saveSubscription({ user: profile(req), subscription: req.body?.subscription, topics: req.body?.topics, userAgent: req.get("user-agent") })); } catch (error) { next(error); }
	});
	router.delete("/subscribe", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
		try { res.json(await pushService.removeSubscription({ user: profile(req), endpoint: req.body?.endpoint })); } catch (error) { next(error); }
	});
	router.post("/events/open", requireAuthenticated, async (req, res, next) => {
		try { res.json(await pushService.recordOpen({ user: profile(req), notificationId: req.body?.notificationId, channel: req.body?.channel || "IN_APP" })); } catch (error) { next(error); }
	});
	router.get("/overview", requireAuthenticated, requireView, async (_req, res, next) => {
		try { res.json(await pushService.getOverview()); } catch (error) { next(error); }
	});
	router.get("/admin/recipients", requireAuthenticated, requireView, async (req, res, next) => {
		try { res.json({ items: await pushService.listRecipients(req.query || {}) }); } catch (error) { next(error); }
	});
	router.get("/admin/campaigns", requireAuthenticated, requireView, async (req, res, next) => {
		try { res.json(await pushService.listCampaigns(req.query || {})); } catch (error) { next(error); }
	});
	router.post("/send", requireAuthenticated, requireManage, requireCsrfToken, async (req, res, next) => {
		try {
			const body = req.body || {};
			const title = String(body.title || "").trim().slice(0, 100);
			const message = String(body.message || "").trim().slice(0, 500);
			const targetMode = String(body.targetMode || "ALL").trim().toUpperCase();
			const severity = String(body.severity || "info").trim().toLowerCase();
			const requestedPath = String(body.targetPath || "/").trim().slice(0, 300);
			const targetPath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
			const targetValues = [...new Set((Array.isArray(body.targetValues) ? body.targetValues : []).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
			if (!title || !message) return res.status(400).json({ error: "Informe titulo e mensagem." });
			if (!["ALL", "USERS", "ROLES"].includes(targetMode)) return res.status(400).json({ error: "Publico da notificacao invalido." });
			if (targetMode !== "ALL" && !targetValues.length) return res.status(400).json({ error: "Selecione ao menos um destinatario." });
			const targets = targetMode === "ALL"
				? { all: true }
				: targetMode === "USERS"
					? { users: targetValues }
					: { roles: targetValues };
			const audienceCount = await pushService.estimateAudience(targets);
			const notification = await notificationsService.createNotification({
				type: "geral",
				title,
				message,
				targetPath,
				severity: ["info", "success", "warning", "critical"].includes(severity) ? severity : "info",
				user: profile(req),
				targets,
				meta: { module: "comunicados", topic: "comunicados", pushEnabled: true, manualCampaign: true },
			});
			const campaign = await pushService.saveCampaign({ notification, targetMode, targetValues, audienceCount, user: profile(req) });
			res.status(201).json({ ok: true, campaign });
		} catch (error) { next(error); }
	});

	return router;
}

module.exports = createPushNotificationsRouter;
