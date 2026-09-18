const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth);

const DEFAULTS = {
	google: {
		enabled: false,
		clientId: "",
		allowedDomains: "",
		autoProvision: false,
		defaultRole: "visitante",
	},
	okta: {
		enabled: false,
		issuer: "",
		clientId: "",
		redirectUri: "",
		allowedDomains: "",
		autoProvision: false,
		defaultRole: "visitante",
	},
};

async function readConfig(provider) {
	const { rows } = await db.query("select value from rot_settings where key = $1 limit 1", [`oauth_${provider}`]).catch(() => ({ rows: [] }));
	return { ...DEFAULTS[provider], ...(rows[0]?.value || {}) };
}

async function saveConfig(provider, value) {
	const config = { ...DEFAULTS[provider], ...(value || {}) };
	await db.query(
		`insert into rot_settings (key, value, updated_at)
		values ($1, $2::jsonb, now())
		on conflict (key) do update set value = excluded.value, updated_at = now()`,
		[`oauth_${provider}`, JSON.stringify(config)],
	);
	return config;
}

router.get("/:provider", requireRotPermission("rot.settings.manage"), noStore, async (req, res, next) => {
	try {
		const provider = String(req.params.provider || "");
		if (!DEFAULTS[provider]) {
			res.status(404).json({ ok: false, error: "Provedor OAuth desconhecido." });
			return;
		}
		res.json({ ok: true, config: await readConfig(provider) });
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
		res.json({ ok: true, config: await saveConfig(provider, req.body || {}) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
