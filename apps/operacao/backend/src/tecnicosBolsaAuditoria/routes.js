const express = require("express");
const service = require("./service");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth);

const VIEW = ["rot.bag_audit.view", "rot.bag_audit.manage", "rot.audit_reports.view"];
const MANAGE = ["rot.bag_audit.manage", "rot.audit_reports.manage"];

router.get("/", requireRotPermission(VIEW), noStore, async (req, res, next) => {
	try {
		res.json(await service.getDashboard(req.user));
	} catch (error) {
		next(error);
	}
});

router.get("/config", requireRotPermission(VIEW), noStore, async (_req, res, next) => {
	try {
		res.json(await service.readConfig({ sanitized: true }));
	} catch (error) {
		next(error);
	}
});

router.put("/config", requireRotPermission(MANAGE), async (req, res, next) => {
	try {
		res.json(await service.saveConfig(req.body || {}, req.user));
	} catch (error) {
		next(error);
	}
});

router.get("/logs", requireRotPermission(VIEW), noStore, async (req, res, next) => {
	try {
		res.json(await service.listLogs({ page: req.query.page, limit: req.query.limit, user: req.user }));
	} catch (error) {
		next(error);
	}
});

router.get("/historico", requireRotPermission(VIEW), noStore, async (req, res, next) => {
	try {
		res.json(await service.getHistory({
			user: req.user,
			tipo: req.query.tipo,
			id: req.query.id,
			periodo: req.query.periodo,
			dataInicio: req.query.dataInicio,
			dataFim: req.query.dataFim,
			year: req.query.ano,
		}));
	} catch (error) {
		next(error);
	}
});

router.get("/relatorios", requireRotPermission(["rot.audit_reports.view", "rot.bag_audit.view", "rot.bag_audit.manage"]), noStore, async (req, res, next) => {
	try {
		res.json(await service.getReports({ user: req.user, query: req.query }));
	} catch (error) {
		next(error);
	}
});

router.post("/relatorios/refresh", requireRotPermission(MANAGE), async (req, res, next) => {
	try {
		res.status(202).json(await service.startReportRefreshJob(req.user, req.body || {}));
	} catch (error) {
		next(error);
	}
});

router.post("/relatorios/email", requireRotPermission(VIEW), async (req, res, next) => {
	try {
		res.json(await service.sendReportByEmail(req.body || {}, req.user));
	} catch (error) {
		next(error);
	}
});

router.post("/refresh", requireRotPermission(MANAGE), async (req, res, next) => {
	try {
		res.status(202).json(await service.startRefreshAllJob(req.user));
	} catch (error) {
		next(error);
	}
});

router.get("/jobs/:jobId", requireRotPermission(VIEW), noStore, async (req, res, next) => {
	try {
		const job = await service.getRefreshJob(req.params.jobId);
		if (!job) {
			res.status(404).json({ ok: false, error: "Atualização não encontrada." });
			return;
		}
		res.json(job);
	} catch (error) {
		next(error);
	}
});

router.post("/refresh/:id", requireRotPermission(MANAGE), async (req, res, next) => {
	try {
		res.json(await service.refreshBySnapshotId(req.params.id, req.user));
	} catch (error) {
		next(error);
	}
});

router.post("/run-daily", requireRotPermission(MANAGE), async (req, res, next) => {
	try {
		res.status(202).json(await service.startRefreshAllJob(req.user));
	} catch (error) {
		next(error);
	}
});

module.exports = router;
