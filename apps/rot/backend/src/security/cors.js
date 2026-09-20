// Mesmo padrao de apps/finan/backend/src/security/cors.js — allowlist
// explicita, nunca reflete origem arbitraria com credentials:true.
const DEFAULT_DEV_ORIGINS = [
	"http://localhost:5175",
	"http://127.0.0.1:5175",
	"http://localhost:4175",
	"http://127.0.0.1:4175",
];

function parseOriginList(value) {
	return String(value || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function resolveRotCorsAllowlist(env = process.env) {
	const explicit = [
		...parseOriginList(env.ROT_CORS_ORIGINS),
		...parseOriginList(env.ROT_CORS_ORIGIN),
	];
	if (explicit.length) return Array.from(new Set(explicit));

	const fallback = [...DEFAULT_DEV_ORIGINS];
	if (env.ROT_PUBLIC_URL) fallback.push(env.ROT_PUBLIC_URL.replace(/\/$/, ""));
	return Array.from(new Set(fallback));
}

function isAllowedRotOrigin(origin, env = process.env) {
	const normalized = String(origin || "").replace(/\/$/, "");
	return Boolean(normalized) && resolveRotCorsAllowlist(env).includes(normalized);
}

function buildRotCorsOptions(env = process.env) {
	const allowlist = resolveRotCorsAllowlist(env);
	return {
		credentials: true,
		origin(origin, callback) {
			if (!origin || allowlist.includes(origin)) {
				callback(null, true);
				return;
			}
			callback(new Error(`Origem "${origin}" não permitida pelo CORS da Operação.`));
		},
	};
}

module.exports = { buildRotCorsOptions, isAllowedRotOrigin, resolveRotCorsAllowlist, DEFAULT_DEV_ORIGINS };
