const express = require("express");

function createEquipmentRecoveryRouter({
	equipmentRecoveryService,
	requireAuthenticated,
	requireRoles,
	fullOperationRoles,
} = {}) {
	const router = express.Router();
	const authorize = [
		requireAuthenticated,
		requireRoles(fullOperationRoles || ["admin", "supervisor", "backoffice"]),
	];

	router.get("/impact", ...authorize, async (req, res, next) => {
		try {
			res.json(await equipmentRecoveryService.getImpact(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/summary", ...authorize, async (req, res, next) => {
		try {
			res.json(await equipmentRecoveryService.getSummary(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/technicians", ...authorize, async (req, res, next) => {
		try {
			res.json({ items: await equipmentRecoveryService.listTechnicians(req.query || {}) });
		} catch (error) {
			next(error);
		}
	});

	router.get("/pending", ...authorize, async (req, res, next) => {
		try {
			res.json(await equipmentRecoveryService.listPending(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/pending.csv", ...authorize, async (req, res, next) => {
		try {
			const csv = await equipmentRecoveryService.exportCsv(req.query || {});
			res.setHeader("Content-Type", "text/csv; charset=utf-8");
			res.setHeader(
				"Content-Disposition",
				'attachment; filename="equipamentos-pendentes.csv"',
			);
			res.send(`\ufeff${csv}`);
		} catch (error) {
			next(error);
		}
	});

	router.post("/reprocess", ...authorize, async (req, res, next) => {
		try {
			res.json(
				await equipmentRecoveryService.reprocess(req.body || {}, req.user || {}),
			);
		} catch (error) {
			next(error);
		}
	});

	return router;
}

module.exports = createEquipmentRecoveryRouter;
