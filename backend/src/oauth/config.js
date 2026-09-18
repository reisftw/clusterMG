const db = require("../db");

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

async function readOauthConfig(provider) {
	const { rows } = await db
		.query("select value from rot_settings where key = $1 limit 1", [`oauth_${provider}`])
		.catch(() => ({ rows: [] }));
	return { ...DEFAULTS[provider], ...(rows[0]?.value || {}) };
}

async function saveOauthConfig(provider, value) {
	const config = { ...DEFAULTS[provider], ...(value || {}) };
	await db.query(
		`insert into rot_settings (key, value, updated_at)
		values ($1, $2::jsonb, now())
		on conflict (key) do update set value = excluded.value, updated_at = now()`,
		[`oauth_${provider}`, JSON.stringify(config)],
	);
	return config;
}

module.exports = { DEFAULTS, readOauthConfig, saveOauthConfig };
