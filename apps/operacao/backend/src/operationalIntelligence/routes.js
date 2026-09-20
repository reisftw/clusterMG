const express = require("express");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { getCatalog, getDrilldown, getEvents, getJourney, getSummary, normalizePeriod } = require("./OperationalMetricsService");
const { getCockpit, getControlTower, getHealthScore } = require("./cockpitService");
const { getPendingItems } = require("./pendingService");

const router = express.Router();

router.use(requireRotAuth);
router.use(noStore);

router.get("/catalog", requireRotPermission("operational_metrics.view"), async (req, res, next) => {
	try {
		const catalog = await getCatalog();
		res.json({ ok: true, items: catalog });
	} catch (error) {
		next(error);
	}
});

router.get("/providers/status", requireRotPermission("operational_metrics.view"), async (req, res) => {
	res.json({
		ok: true,
		items: [
			{ provider: "TicketProvider", domains: ["ROT"], status: "AVAILABLE", source: "rot_tickets" },
			{ provider: "HubsoftOrderProvider", domains: ["FIELD", "DELIVERY"], status: "WAITING_INTEGRATION", source: "Hubsoft O.S" },
		],
	});
});

router.get("/metrics/summary", requireRotPermission("operational_metrics.view"), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const summary = await getSummary(req, {
			domain: req.query.domain,
			from: period.from,
			to: period.to,
		});
		res.json({ ok: true, ...summary });
	} catch (error) {
		next(error);
	}
});

router.get("/metrics/:code/drilldown", requireRotPermission("operational_metrics.view"), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const result = await getDrilldown(req, {
			code: req.params.code,
			domain: req.query.domain,
			from: period.from,
			to: period.to,
			limit: req.query.limit,
		});
		res.json({ ok: true, code: req.params.code, domain: String(req.query.domain || "ROT").toUpperCase(), period, ...result });
	} catch (error) {
		next(error);
	}
});

router.get("/events", requireRotPermission("operational_events.view"), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const events = await getEvents(req, {
			domain: req.query.domain,
			from: period.from,
			to: period.to,
			limit: req.query.limit,
		});
		res.json({ ok: true, domain: String(req.query.domain || "ROT").toUpperCase(), period, ...events });
	} catch (error) {
		next(error);
	}
});

router.get("/journey", requireRotPermission(["journey.view", "journey.team_view"]), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const result = await getJourney(req, {
			domain: req.query.domain,
			from: period.from,
			to: period.to,
			technicianId: req.query.technicianId,
		});
		res.json({ ok: true, domain: String(req.query.domain || "ROT").toUpperCase(), period, ...result });
	} catch (error) {
		next(error);
	}
});

router.get("/pending", requireRotPermission("pending.view"), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const result = await getPendingItems(req, {
			domain: req.query.domain,
			from: period.from,
			to: period.to,
		});
		res.json({ ok: true, ...result });
	} catch (error) {
		next(error);
	}
});

router.get("/cockpit", requireRotPermission("supervisor_cockpit.view"), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const result = await getCockpit(req, {
			domain: req.query.domain,
			from: period.from,
			to: period.to,
		});
		res.json({ ok: true, ...result });
	} catch (error) {
		next(error);
	}
});

router.get("/control-tower", requireRotPermission("control_tower.view"), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const result = await getControlTower(req, {
			domain: req.query.domain,
			from: period.from,
			to: period.to,
		});
		res.json({ ok: true, ...result });
	} catch (error) {
		next(error);
	}
});

router.get("/health-score", requireRotPermission("health.view"), async (req, res, next) => {
	try {
		const period = normalizePeriod(req.query);
		const result = await getHealthScore(req, {
			domain: req.query.domain,
			from: period.from,
			to: period.to,
		});
		res.json({ ok: true, ...result });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
