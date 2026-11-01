const express = require("express");
const rateLimit = require("express-rate-limit");
const service = require("../mapsV2Service");

function createMapsV2Router({
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
	fallbackRoles = ["admin"],
} = {}) {
	const router = express.Router();
	const readLimiter = rateLimit({
		windowMs: 60_000,
		limit: Number(process.env.MAPS_READ_RATE_LIMIT || 120),
		standardHeaders: "draft-8",
		legacyHeaders: false,
	});
	const writeLimiter = rateLimit({
		windowMs: 60_000,
		limit: Number(process.env.MAPS_WRITE_RATE_LIMIT || 30),
		standardHeaders: "draft-8",
		legacyHeaders: false,
	});
	const requireAccess = requireAnyPermission([service.MAPS_PERMISSIONS.ACCESS], fallbackRoles);
	const requireRadar = requireAnyPermission([service.MAPS_PERMISSIONS.RADAR], fallbackRoles);
	const requireRequest = requireAnyPermission([service.MAPS_PERMISSIONS.REQUEST], fallbackRoles);
	const requireApprove = requireAnyPermission([service.MAPS_PERMISSIONS.APPROVE], fallbackRoles);
	const requireReject = requireAnyPermission([service.MAPS_PERMISSIONS.REJECT], fallbackRoles);
	const requireRoutes = requireAnyPermission([service.MAPS_PERMISSIONS.ROUTES], fallbackRoles);
	const requireAudit = requireAnyPermission([service.MAPS_PERMISSIONS.AUDIT], fallbackRoles);
	const requireLiveTechnicians = requireAnyPermission([service.MAPS_PERMISSIONS.LIVE_TECHNICIANS], fallbackRoles);
	const requireTracks = requireAnyPermission([service.MAPS_PERMISSIONS.VIEW_TRACKS], fallbackRoles);

	router.use(requireAuthenticated, requireAccess);
	router.use((req, res, next) => {
		if (service.featureEnabled()) {
			next();
			return;
		}
		res.status(503).json({ error: "Retiradas Maps 2.0 esta desativado.", code: "MAPS_DISABLED" });
	});

	router.get("/health", readLimiter, async (_req, res, next) => {
		try {
			res.json(await service.getHealth());
		} catch (error) {
			next(error);
		}
	});

	router.get("/points", readLimiter, async (req, res, next) => {
		try {
			res.json(await service.listPoints(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/nearby", readLimiter, async (req, res, next) => {
		try {
			res.json(await service.listPoints(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/summary", readLimiter, async (req, res, next) => {
		try {
			res.json(await service.getSummary(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/orders/:id", readLimiter, async (req, res, next) => {
		try {
			res.json({ item: await service.getOrder(req.params.id, req.user || {}) });
		} catch (error) {
			next(error);
		}
	});

	router.get("/orders/:id/navigation", readLimiter, async (req, res, next) => {
		try {
			res.json(await service.getNavigation(req.params.id, req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/radar/settings", readLimiter, requireRadar, async (req, res, next) => {
		try {
			res.json(await service.getRadarSettings(req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.put("/radar/settings", writeLimiter, requireCsrfToken, requireRadar, async (req, res, next) => {
		try {
			res.json(await service.saveRadarSettings(req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/radar/evaluate", writeLimiter, requireCsrfToken, requireRadar, async (req, res, next) => {
		try {
			res.json(await service.evaluateRadar(req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/technicians/presence", writeLimiter, requireCsrfToken, async (req, res, next) => {
		try {
			res.json(await service.saveTechnicianPresence(req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/admin/technicians/live", readLimiter, requireLiveTechnicians, async (req, res, next) => {
		try {
			res.json(await service.listTechnicianPresence(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/admin/technicians/:id/track", readLimiter, requireTracks, async (req, res, next) => {
		try {
			res.json(await service.getTechnicianTrack(req.params.id, req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/admin/visits", readLimiter, requireTracks, async (req, res, next) => {
		try {
			res.json(await service.listVisitCenter(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/radar/alerts", readLimiter, requireRadar, async (req, res, next) => {
		try {
			res.json(await service.listRadarAlerts(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/radar/alerts/:id/dismiss", writeLimiter, requireCsrfToken, requireRadar, async (req, res, next) => {
		try {
			res.json(await service.dismissAlert(req.params.id, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/radar/simulate", writeLimiter, requireCsrfToken, requireAudit, async (req, res, next) => {
		try {
			res.json(await service.simulateRadar(req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/requests/batch", writeLimiter, requireCsrfToken, requireRequest, async (req, res, next) => {
		try {
			res.status(201).json(await service.createRequestBatch(req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/requests", writeLimiter, requireCsrfToken, requireRequest, async (req, res, next) => {
		try {
			res.status(201).json(await service.createRequest(req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/requests", readLimiter, async (req, res, next) => {
		try {
			const canManage = service.hasPermission(req.user || {}, service.MAPS_PERMISSIONS.VIEW_REQUESTS) ||
				service.hasPermission(req.user || {}, service.MAPS_PERMISSIONS.APPROVE) ||
				service.hasPermission(req.user || {}, service.MAPS_PERMISSIONS.REJECT);
			res.json(await service.listRequests(req.query || {}, req.user || {}, canManage));
		} catch (error) {
			next(error);
		}
	});

	router.post("/requests/:id/approve", writeLimiter, requireCsrfToken, requireApprove, async (req, res, next) => {
		try {
			res.json(await service.resolveRequest(req.params.id, req.body || {}, req.user || {}, "approve"));
		} catch (error) {
			next(error);
		}
	});

	router.post("/requests/:id/reject", writeLimiter, requireCsrfToken, requireReject, async (req, res, next) => {
		try {
			res.json(await service.resolveRequest(req.params.id, req.body || {}, req.user || {}, "reject"));
		} catch (error) {
			next(error);
		}
	});

	router.get("/routes", readLimiter, requireRoutes, async (req, res, next) => {
		try {
			res.json(await service.listRoutes(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/routes", writeLimiter, requireCsrfToken, requireRoutes, async (req, res, next) => {
		try {
			res.status(201).json(await service.createRoute(req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.patch("/routes/:id", writeLimiter, requireCsrfToken, requireRoutes, async (req, res, next) => {
		try {
			res.json(await service.updateRoute(req.params.id, req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/routes/:id/optimize", writeLimiter, requireCsrfToken, requireRoutes, async (req, res, next) => {
		try {
			res.json(await service.optimizeRoute(req.params.id, req.body || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/geocoding/queue", writeLimiter, requireCsrfToken, requireAudit, async (req, res, next) => {
		try {
			res.json(await service.queueMissingGeocodes(req.body?.limit));
		} catch (error) {
			next(error);
		}
	});

	service.initializeGeocoderWorker();
	return router;
}

module.exports = createMapsV2Router;
