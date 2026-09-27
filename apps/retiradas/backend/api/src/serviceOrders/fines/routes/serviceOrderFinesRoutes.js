const express = require("express");
const {
	SIMULATE_PERMISSIONS,
	VIEW_PERMISSIONS,
	listFineAudit,
	simulateFineAudit,
} = require("../serviceOrderFinesService");

function createServiceOrderFinesRouter({
	fallbackRoles = [],
	hubsoftSyncProfiles,
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
} = {}) {
	const router = express.Router();
	const requireView = requireAnyPermission(VIEW_PERMISSIONS, fallbackRoles);
	const requireSimulate = requireAnyPermission(SIMULATE_PERMISSIONS, fallbackRoles);

	router.get("/audit", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await listFineAudit(req.query || {}, { hubsoftSyncProfiles }));
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/simulate",
		requireAuthenticated,
		requireCsrfToken,
		requireSimulate,
		async (req, res, next) => {
			try {
				res.status(202).json(
					await simulateFineAudit(
						hubsoftSyncProfiles,
						req.body || {},
						req.user || {},
					),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createServiceOrderFinesRouter;
