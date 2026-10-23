const express = require("express");
const service = require("../serviceOrderRequestsService");

function createServiceOrderRequestsRouter({
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
} = {}) {
	const router = express.Router();
	const requireCreate = requireAnyPermission(service.CREATE_PERMISSIONS);
	const requireHistory = requireAnyPermission(service.HISTORY_PERMISSIONS, ["admin"]);

	router.get("/mine", requireAuthenticated, requireCreate, async (req, res, next) => {
		try {
			res.json(await service.listOwnRequests(req.user || {}, req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/history", requireAuthenticated, requireHistory, async (req, res, next) => {
		try {
			res.json(await service.listHistory(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/:id", requireAuthenticated, requireCreate, async (req, res, next) => {
		try {
			const item = await service.getRequest(req.params.id, req.user || {});
			if (!item) {
				res.status(404).json({ error: "Solicitacao nao encontrada." });
				return;
			}
			res.json({ item });
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/",
		requireAuthenticated,
		requireCsrfToken,
		requireCreate,
		async (req, res, next) => {
			try {
				res.status(202).json(await service.createRequest(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	service.initialize().catch((error) => {
		console.error("[serviceOrderRequests] Falha ao inicializar fila:", error?.message || error);
	});

	return router;
}

module.exports = createServiceOrderRequestsRouter;
