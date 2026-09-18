const express = require("express");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { DEFAULTS, readOauthConfig, saveOauthConfig } = require("./config");

const router = express.Router();
router.use(requireRotAuth);

router.get("/:provider", requireRotPermission("rot.settings.manage"), noStore, async (req, res, next) => {
	try {
		const provider = String(req.params.provider || "");
		if (!DEFAULTS[provider]) {
			res.status(404).json({ ok: false, error: "Provedor OAuth desconhecido." });
			return;
		}
		res.json({ ok: true, config: await readOauthConfig(provider) });
	} catch (error) {
		next(error);
	}
});

router.put("/:provider", requireRotPermission("rot.settings.manage"), async (req, res, next) => {
	try {
		const provider = String(req.params.provider || "");
		if (!DEFAULTS[provider]) {
			res.status(404).json({ ok: false, error: "Provedor OAuth desconhecido." });
			return;
		}
		res.json({ ok: true, config: await saveOauthConfig(provider, req.body || {}) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
