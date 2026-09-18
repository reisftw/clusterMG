const { isAllowedRotOrigin } = require("./cors");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originFromReferer(referer) {
	try {
		return new URL(referer).origin;
	} catch {
		return "";
	}
}

function sameSiteOriginGuard(req, res, next) {
	if (!MUTATING_METHODS.has(String(req.method || "").toUpperCase())) {
		next();
		return;
	}

	const origin = String(req.get("origin") || "").replace(/\/$/, "");
	const refererOrigin = originFromReferer(req.get("referer") || "");
	const suppliedOrigin = origin || refererOrigin;

	if (!suppliedOrigin || isAllowedRotOrigin(suppliedOrigin)) {
		next();
		return;
	}

	res.status(403).json({ ok: false, error: "Origem da requisição não autorizada." });
}

module.exports = { sameSiteOriginGuard };
