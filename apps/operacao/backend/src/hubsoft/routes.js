const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { getHubsoftActivationSyncJob, startHubsoftActivationSyncJob } = require("./jobs/activationSyncJob");
const service = require("./services/activationApiService");
const healthService = require("./services/activationHealthApiService");
const qualityService = require("./services/activationQualityApiService");

const router = express.Router();
const VIEW = ["ativacoes.visualizar", "ativacoes.kanban.visualizar"];
const HEALTH_VIEW = ["ativacoes.saude.visualizar", "ativacoes.visualizar"];
const QUALITY_VIEW = ["ativacoes.qualidade.visualizar", "ativacoes.visualizar"];

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

router.get("/fechamentos-outros", requireRotPermission("ativacoes.visualizar"), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await service.closedReasons(db, req.query)) });
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

router.get("/saude/resumo", requireRotPermission(HEALTH_VIEW), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await healthService.summary(db, req.query)) });
	} catch (error) {
		next(error);
	}
});

router.get("/saude", requireRotPermission(HEALTH_VIEW), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await healthService.listHealth(db, req.query)) });
	} catch (error) {
		next(error);
	}
});

router.get("/saude/filtros", requireRotPermission(HEALTH_VIEW), async (_req, res, next) => {
	try {
		res.json({ ok: true, filters: await healthService.filters(db) });
	} catch (error) {
		next(error);
	}
});

router.get("/saude/export.csv", requireRotPermission("ativacoes.saude.exportar"), async (req, res, next) => {
	try {
		const data = await healthService.listHealth(db, { ...req.query, page: 1, limit: 10000 });
		res.setHeader("Content-Type", "text/csv; charset=utf-8");
		res.setHeader("Content-Disposition", 'attachment; filename="ativacoes-saude.csv"');
		res.send(`\uFEFF${healthService.toCsv(data.items)}`);
	} catch (error) {
		next(error);
	}
});

router.get("/qualidade/resumo", requireRotPermission(QUALITY_VIEW), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await qualityService.summary(db, req.query)) });
	} catch (error) {
		next(error);
	}
});

router.get("/qualidade/filtros", requireRotPermission(QUALITY_VIEW), async (_req, res, next) => {
	try {
		res.json({ ok: true, filters: await qualityService.filters(db) });
	} catch (error) {
		next(error);
	}
});

router.get("/qualidade/detalhe", requireRotPermission(QUALITY_VIEW), async (req, res, next) => {
	try {
		res.json({ ok: true, ...(await qualityService.detail(db, req.query)) });
	} catch (error) {
		next(error);
	}
});

router.get("/qualidade/export.csv", requireRotPermission("ativacoes.qualidade.exportar"), async (req, res, next) => {
	try {
		const dimension = req.query.dimension || "technician";
		const data = await qualityService.grouped(db, { ...req.query, page: 1, limit: 10000 }, dimension);
		res.setHeader("Content-Type", "text/csv; charset=utf-8");
		res.setHeader("Content-Disposition", 'attachment; filename="ativacoes-qualidade.csv"');
		res.send(`\uFEFF${qualityService.toCsv(data.items)}`);
	} catch (error) {
		next(error);
	}
});

router.get("/qualidade/:dimension", requireRotPermission(QUALITY_VIEW), async (req, res, next) => {
	try {
		const map = { tecnicos: "technician", empresas: "company", cidades: "city", tipos: "type" };
		const dimension = map[req.params.dimension];
		if (!dimension) {
			res.status(404).json({ ok: false, error: "Dimensão de qualidade não encontrada." });
			return;
		}
		res.json({ ok: true, ...(await qualityService.grouped(db, req.query, dimension)) });
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

router.get("/saude/:id", requireRotPermission(HEALTH_VIEW), async (req, res, next) => {
	try {
		const item = await healthService.detail(db, req.params.id);
		if (!item) {
			res.status(404).json({ ok: false, error: "Saúde da ativação não encontrada." });
			return;
		}
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
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
