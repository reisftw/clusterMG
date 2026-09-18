// Roteiro Finan #27 (Fase 4A — Observabilidade): painel técnico (uptime,
// latência, erros 4xx/5xx, tamanho do Postgres, backups, filas), separado
// do financeiro.
//
// A logica de montagem do overview mora em service.js (Roteiro #26 — API
// /api/v1 reaproveita o mesmo service em vez de duplicar as queries).
const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const metricsCollector = require("./metricsCollector");
const { getOverview } = require("./service");

const router = express.Router();

router.use(requireFinanPermission("finan.configuracoes.view"));
router.use(noStore);

router.get("/overview", async (_req, res, next) => {
	try {
		res.json({ ok: true, ...(await getOverview()) });
	} catch (error) {
		next(error);
	}
});

router.get("/metricas", async (req, res, next) => {
	try {
		const hours = Number(req.query.hours) || 24;
		res.json({ ok: true, serie: await metricsCollector.getTimeSeries({ hours }) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
