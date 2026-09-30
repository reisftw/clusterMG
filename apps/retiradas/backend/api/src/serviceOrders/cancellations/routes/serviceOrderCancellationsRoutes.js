const express = require("express");
const service = require("../serviceOrderCancellationsService");

function createServiceOrderCancellationsRouter({
	fallbackRoles = [],
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
} = {}) {
	const router = express.Router();
	const requireView = requireAnyPermission(service.VIEW_PERMISSIONS, fallbackRoles);
	const requireManage = requireAnyPermission(
		service.MANAGE_PERMISSIONS,
		fallbackRoles,
	);

	router.get("/", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.listCancellations(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/resumo", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.getSummary(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get(
		"/competencias",
		requireAuthenticated,
		requireView,
		async (_req, res, next) => {
			try {
				res.json(await service.listCompetencies());
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/filters", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.listFilterOptions(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get(
		"/sync/history",
		requireAuthenticated,
		requireView,
		async (req, res, next) => {
			try {
				res.json(await service.listSyncHistory(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/export.csv", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			const buffer = await service.exportCsv(req.query || {});
			res.setHeader("Content-Type", "text/csv; charset=utf-8");
			res.setHeader(
				"Content-Disposition",
				'attachment; filename="cancelamentos.csv"',
			);
			res.send(buffer);
		} catch (error) {
			next(error);
		}
	});

	router.get("/:id", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			const item = await service.getRecord(req.params.id);
			if (!item) {
				res.status(404).json({ error: "Cancelamento nao encontrado." });
				return;
			}
			res.json({ item });
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/sync",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		async (req, res, next) => {
			try {
				res.status(202).json(await service.startSync(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/sync/history",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		async (req, res, next) => {
			try {
				res
					.status(202)
					.json(await service.startHistorySync(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:competencia/validate",
		requireAuthenticated,
		requireCsrfToken,
		requireManage,
		async (req, res, next) => {
			try {
				res.json(
					await service.validateCompetency(req.params.competencia, req.user || {}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createServiceOrderCancellationsRouter;
