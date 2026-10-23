const express = require("express");
const service = require("../returnReceiptsService");

function contentDisposition(filename) {
	const ascii = String(filename || "comprovante.pdf")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9._-]+/g, "-");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function createReturnReceiptsRouter({
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
} = {}) {
	const router = express.Router();
	const requireCreate = requireAnyPermission(service.CREATE_PERMISSIONS, [
		"admin",
		"tecnico",
	]);
	const requireHistory = requireAnyPermission(service.HISTORY_PERMISSIONS, ["admin"]);

	router.get("/lookup", requireAuthenticated, requireCreate, async (req, res, next) => {
		try {
			res.json(await service.lookup(req.query.clientCode, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/mine", requireAuthenticated, requireCreate, async (req, res, next) => {
		try {
			res.json(await service.listMine(req.user || {}, req.query || {}));
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

	router.get("/:id/download", requireAuthenticated, requireCreate, async (req, res, next) => {
		try {
			const file = await service.getDownload(req.params.id, req.user || {});
			res.setHeader("Content-Type", "application/pdf");
			res.setHeader("Content-Length", String(file.data.length));
			res.setHeader("Content-Disposition", contentDisposition(file.filename));
			res.setHeader("Cache-Control", "private, no-store");
			res.send(file.data);
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
				res.status(201).json(await service.createReceipt(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createReturnReceiptsRouter;
