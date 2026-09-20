const crypto = require("node:crypto");

function timingSafeEqualText(left, right) {
	const leftBuffer = Buffer.from(String(left || ""));
	const rightBuffer = Buffer.from(String(right || ""));
	if (leftBuffer.length !== rightBuffer.length) return false;
	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isProduction() {
	return process.env.NODE_ENV === "production";
}

function getProvidedWebhookSecret(req) {
	return String(
		req.get("x-retiradas-webhook-secret") ||
			req.get("x-webhook-secret") ||
			req.get("x-api-key") ||
			req.query.secret ||
			req.body?.secret ||
			"",
	);
}

function verifyWebhookSecret(req, res, envName, label) {
	const expected = String(process.env[envName] || "");
	if (!expected || expected.length < 24) {
		if (isProduction()) {
			res
				.status(503)
				.json({ error: `${label} sem segredo de webhook configurado.` });
			return false;
		}
		return true;
	}

	const provided = getProvidedWebhookSecret(req);
	if (!timingSafeEqualText(provided, expected)) {
		res.status(401).json({ error: "Webhook nao autorizado." });
		return false;
	}

	return true;
}

module.exports = {
	getProvidedWebhookSecret,
	verifyWebhookSecret,
};
