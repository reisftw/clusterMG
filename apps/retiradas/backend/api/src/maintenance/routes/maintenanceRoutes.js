const express = require("express");

function createMaintenanceRouter({
	maintenanceService,
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
	publicEventLimiter,
}) {
	const router = express.Router();
	const requireAdmin = [requireAuthenticated, requireRoles(["admin"])];

	router.get("/status", async (_req, res, next) => {
		try {
			res.set("Cache-Control", "no-store");
			res.json(await maintenanceService.getPublicStatus());
		} catch (error) {
			next(error);
		}
	});

	router.post("/service-worker/events", publicEventLimiter, async (req, res, next) => {
		try {
			res.json(
				await maintenanceService.recordServiceWorkerEvent(
					req.body || {},
					req.get("user-agent") || "",
				),
			);
		} catch (error) {
			next(error);
		}
	});

	router.get("/dashboard", ...requireAdmin, async (req, res, next) => {
		try {
			res.json(await maintenanceService.getDashboard(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/history", ...requireAdmin, async (req, res, next) => {
		try {
			res.json(await maintenanceService.listHistory(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/activate",
		...requireAdmin,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				res.json(
					await maintenanceService.activateMaintenance(req.body || {}, req.user || {}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/deactivate",
		...requireAdmin,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				res.json(
					await maintenanceService.deactivateMaintenance(req.user || {}, "MANUAL"),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createMaintenanceRouter;
