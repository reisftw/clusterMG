const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { getHubsoftActivationSyncJob, startHubsoftActivationSyncJob } = require("./jobs/activationSyncJob");
const service = require("./services/activationApiService");

const router = express.Router();
const VIEW = ["ativacoes.visualizar", "ativacoes.kanban.visualizar"];

router.use(requireRotAuth, noStore);

router.get("/dashboard", requireRotPermission("ativacoes.visualizar"), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await service.dashboard(db, req.query)), latestSync: await service.latestSync(db) });
	} catch (error) {
		next(error);
	}
});

router.get("/", requireRotPermission(VIEW), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await service.listActivations(db, req.query)) });
	} catch (error) {
		next(error);
	}
});

router.get("/kanban", requireRotPermission("ativacoes.kanban.visualizar"), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await service.kanban(db, req.query)), latestSync: await service.latestSync(db) });
	} catch (error) {
		next(error);
	}
});

router.get("/filtros", requireRotPermission(VIEW), async (_req, res, next) => {
	try {
		res.json({ ok: true, filters: await service.filters(db) });
	} catch (error) {
		next(error);
	}
});

router.get("/export.csv", requireRotPermission("ativacoes.exportar"), async (req, res, next) => {
	try {
		const data = await service.listActivations(db, { ...req.query, page: 1, limit: 10000 });
		res.setHeader("Content-Type", "text/csv; charset=utf-8");
		res.setHeader("Content-Disposition", 'attachment; filename="ativacoes.csv"');
		res.send(`\uFEFF${service.toCsv(data.items)}`);
	} catch (error) {
		next(error);
	}
});

router.post("/sync", requireRotPermission("ativacoes.sincronizar"), async (req, res, next) => {
	try {
		const job = startHubsoftActivationSyncJob(req.body || {});
		res.status(202).json({ ok: true, job });
	} catch (error) {
		next(error);
	}
});

router.get("/sync/jobs/:id", requireRotPermission("ativacoes.sincronizar"), async (req, res) => {
	const job = getHubsoftActivationSyncJob(req.params.id);
	if (!job) {
		res.status(404).json({ ok: false, error: "Job não encontrado." });
		return;
	}
	res.json({ ok: true, job });
});

router.get("/:id", requireRotPermission(VIEW), async (req, res, next) => {
	try {
		const item = await service.detail(db, req.params.id);
		if (!item) {
			res.status(404).json({ ok: false, error: "Ativação não encontrada." });
			return;
		}
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
