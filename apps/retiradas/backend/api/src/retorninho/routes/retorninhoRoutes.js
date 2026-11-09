const express = require("express");
const rateLimit = require("express-rate-limit");
const service = require("../retorninhoService");

function createRetorninhoRouter({ requireAnyPermission, requireAuthenticated, requireCsrfToken } = {}) {
	const router = express.Router();
	const readLimiter = rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false });
	const writeLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false });
	const webhookLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-8", legacyHeaders: false });
	const requireView = requireAnyPermission(["retorninho.view"], ["admin"]);
	const requireManage = requireAnyPermission(["retorninho.manage"], ["admin"]);
	const requireAudit = requireAnyPermission(["retorninho.audit"], ["admin"]);
	const requireReprocess = requireAnyPermission(["retorninho.reprocess"], ["admin"]);

	router.post("/webhook/evolution", webhookLimiter, async (req, res, next) => {
		try {
			if (!(await service.verifyWebhookSecret(req.query.secret))) {
				res.status(401).json({ error: "Webhook não autorizado." });
				return;
			}
			const result = await service.enqueueWebhook(req.body || {}, req.body?.event || "messages.upsert");
			res.status(202).json({ ok: true, ...result });
		} catch (error) {
			next(error);
		}
	});

	router.use(requireAuthenticated);

	router.get("/dashboard", readLimiter, requireView, async (req, res, next) => {
		try { res.json(await service.dashboard(req.query || {})); } catch (error) { next(error); }
	});
	router.get("/config", readLimiter, requireView, async (_req, res, next) => {
		try { res.json(await service.getConfig()); } catch (error) { next(error); }
	});
	router.put("/config", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.json(await service.saveConfig(req.body || {}, req.user || {})); } catch (error) { next(error); }
	});
	router.delete("/config/secrets/:name", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.json(await service.clearSecret(req.params.name, req.user || {})); } catch (error) { next(error); }
	});
	router.get("/instance", readLimiter, requireView, async (_req, res, next) => {
		try { res.json(await service.instanceStatus()); } catch (error) { next(error); }
	});
	router.post("/instance/connect", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.json(await service.connectInstance(req.user || {})); } catch (error) { next(error); }
	});
	router.post("/instance/disconnect", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.json(await service.disconnectInstance(req.user || {})); } catch (error) { next(error); }
	});

	router.get("/authorized-users", readLimiter, requireView, async (req, res, next) => {
		try { res.json(await service.listUsers(req.query || {})); } catch (error) { next(error); }
	});
	router.post("/authorized-users", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.status(201).json(await service.authorizeUser(req.body || {}, req.user || {})); } catch (error) { next(error); }
	});
	router.patch("/authorized-users/:id", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.json(await service.updateAuthorization(req.params.id, req.body || {}, req.user || {})); } catch (error) { next(error); }
	});

	router.get("/knowledge", readLimiter, requireView, async (req, res, next) => {
		try { res.json(await service.listKnowledge(req.query || {})); } catch (error) { next(error); }
	});
	router.post("/knowledge", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.status(201).json(await service.saveKnowledge(null, req.body || {}, req.user || {})); } catch (error) { next(error); }
	});
	router.put("/knowledge/:id", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.json(await service.saveKnowledge(req.params.id, req.body || {}, req.user || {})); } catch (error) { next(error); }
	});

	router.get("/conversations", readLimiter, requireView, async (req, res, next) => {
		try { res.json(await service.listConversations(req.query || {})); } catch (error) { next(error); }
	});
	router.get("/conversations/:id/messages", readLimiter, requireView, async (req, res, next) => {
		try { res.json(await service.listMessages(req.params.id, req.query || {})); } catch (error) { next(error); }
	});
	router.patch("/conversations/:id", writeLimiter, requireCsrfToken, requireManage, async (req, res, next) => {
		try { res.json(await service.setConversationStatus(req.params.id, req.body?.status, req.user || {})); } catch (error) { next(error); }
	});

	router.get("/protocols", readLimiter, requireView, async (req, res, next) => {
		try { res.json(await service.listProtocols(req.query || {})); } catch (error) { next(error); }
	});
	router.get("/queue", readLimiter, requireAudit, async (req, res, next) => {
		try { res.json(await service.listQueue(req.query || {})); } catch (error) { next(error); }
	});
	router.get("/events/:category", readLimiter, requireAudit, async (req, res, next) => {
		try {
			const category = String(req.params.category || "").toUpperCase();
			if (!["TECHNICAL", "OPERATIONAL", "AUDIT"].includes(category)) {
				res.status(400).json({ error: "Categoria inválida." });
				return;
			}
			res.json(await service.listEvents(category, req.query || {}));
		} catch (error) { next(error); }
	});
	router.get("/events/:category/export", readLimiter, requireAudit, async (req, res, next) => {
		try {
			const category = String(req.params.category || "").toUpperCase();
			if (!["TECHNICAL", "OPERATIONAL", "AUDIT"].includes(category)) {
				res.status(400).json({ error: "Categoria inválida." });
				return;
			}
			res.json(await service.exportEvents(category, req.query || {}));
		} catch (error) { next(error); }
	});
	router.post("/queue/:id/reprocess", writeLimiter, requireCsrfToken, requireReprocess, async (req, res, next) => {
		try { res.json(await service.reprocessQueue(req.params.id, req.user || {})); } catch (error) { next(error); }
	});

	return router;
}

module.exports = createRetorninhoRouter;
