const express = require("express");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { syncLegacyOperationData } = require("./service");

const router = express.Router();

router.use(requireRotAuth);

router.post("/operation-legacy-sync", requireRotPermission("rot.settings.manage"), async (req, res, next) => {
	try {
		const result = await syncLegacyOperationData();
		res.json({ ok: true, result });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
