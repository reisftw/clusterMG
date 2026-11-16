const express = require("express");
const service = require("../portReleaseService");

function createPortReleaseRouter({ requireAnyPermission, requireAuthenticated, requireCsrfToken } = {}) {
	const router = express.Router();
	const allow = (permission) => requireAnyPermission(service.PERMISSIONS[permission], []);
	if (process.env.NODE_ENV !== "test") service.initialize().catch((error) => console.error("[port-release] initialization failed", { error: error.message }));

	router.get("/config", requireAuthenticated, allow("view"), async (_req, res, next) => {
		try { res.json({ items: await service.getConfigs(), reasons: service.REASONS }); } catch (error) { next(error); }
	});
	router.get("/catalog", requireAuthenticated, allow("manage"), async (_req, res, next) => {
		try { res.json(await service.catalog()); } catch (error) { next(error); }
	});
	router.put("/config", requireAuthenticated, requireCsrfToken, allow("manage"), async (req, res, next) => {
		try { res.json(await service.saveConfig(req.body || {}, req.user || {})); } catch (error) { next(error); }
	});
	router.post("/search", requireAuthenticated, requireCsrfToken, allow("search"), async (req, res, next) => {
		try { res.json(await service.search(req.body || {}, req.user || {})); } catch (error) { next(error); }
	});
	router.get("/search/:id", requireAuthenticated, allow("search"), async (req, res, next) => {
		try {
			const result = await service.getSearch(req.params.id, req.query || {}, req.user || {});
			if (!result) return res.status(404).json({ error: "Pesquisa expirada ou não encontrada." });
			res.json(result);
		} catch (error) { next(error); }
	});
	router.post("/batches", requireAuthenticated, requireCsrfToken, allow("execute"), async (req, res, next) => {
		try { res.status(202).json(await service.createBatch(req.body || {}, req.user || {})); } catch (error) { next(error); }
	});
	router.get("/batches/:id", requireAuthenticated, allow("view"), async (req, res, next) => {
		try {
			const batch = await service.getBatch(req.params.id);
			if (!batch) return res.status(404).json({ error: "Lote não encontrado." });
			res.json(batch);
		} catch (error) { next(error); }
	});
	router.get("/history", requireAuthenticated, allow("history"), async (req, res, next) => {
		try { res.json(await service.listHistory(req.query || {})); } catch (error) { next(error); }
	});
	router.get("/stats", requireAuthenticated, allow("view"), async (req, res, next) => {
		try { res.json(await service.stats(req.query || {})); } catch (error) { next(error); }
	});
	router.get("/export.:format", requireAuthenticated, allow("export"), async (req, res, next) => {
		try {
			if (!["csv", "xlsx"].includes(req.params.format)) return res.status(404).end();
			const file = await service.exportRows(req.query || {}, req.params.format);
			res.setHeader("Content-Type", file.contentType);
			res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
			res.send(file.content);
		} catch (error) { next(error); }
	});

	return router;
}

module.exports = createPortReleaseRouter;
