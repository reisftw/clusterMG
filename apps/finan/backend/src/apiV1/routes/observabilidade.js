// Roteiro Finan #26: equivalente v1 de /api/finan/observabilidade.
const express = require("express");
const { requireApiV1Permission } = require("../auth");
const { noStore } = require("../../security/noStore");
const metricsCollector = require("../../observabilidade/metricsCollector");
const { getOverview } = require("../../observabilidade/service");
const { sendData } = require("../envelope");

const router = express.Router();

router.use(requireApiV1Permission("finan.configuracoes.view"));
router.use(noStore);

router.get("/overview", async (_req, res, next) => {
	try {
		sendData(res, await getOverview());
	} catch (error) {
		next(error);
	}
});

router.get("/metricas", async (req, res, next) => {
	try {
		const hours = Number(req.query.hours) || 24;
		sendData(res, await metricsCollector.getTimeSeries({ hours }));
	} catch (error) {
		next(error);
	}
});

module.exports = router;
