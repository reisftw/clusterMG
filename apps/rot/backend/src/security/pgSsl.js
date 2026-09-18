function buildPgSslConfig({ sslMode, rejectUnauthorized, ca } = {}) {
	const mode = String(sslMode || "").toLowerCase();
	if (mode !== "require" && mode !== "verify-full") return undefined;
	const explicitReject = rejectUnauthorized === undefined || rejectUnauthorized === null
		? true
		: String(rejectUnauthorized).toLowerCase() !== "false";
	const config = { rejectUnauthorized: explicitReject };
	if (ca) config.ca = ca;
	return config;
}

module.exports = { buildPgSslConfig };
