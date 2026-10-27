const crypto = require("node:crypto");

const COOKIE_NAME = "documentos_google_oauth_state";
const MAX_AGE_SECONDS = 10 * 60;

function parseCookies(req) {
	return String(req?.get?.("cookie") || req?.headers?.cookie || "")
		.split(";")
		.map((part) => part.trim())
		.filter(Boolean)
		.reduce((cookies, part) => {
			const separator = part.indexOf("=");
			if (separator <= 0) return cookies;
			const name = part.slice(0, separator);
			const value = part.slice(separator + 1);
			try {
				cookies[name] = decodeURIComponent(value);
			} catch {
				cookies[name] = "";
			}
			return cookies;
		}, {});
}

function serializeCookie(value, { clear = false } = {}) {
	const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
	const maxAge = clear ? 0 : MAX_AGE_SECONDS;
	return `${COOKIE_NAME}=${encodeURIComponent(value || "")}; Path=/api/documentos/google/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function createState(res) {
	const state = crypto.randomBytes(32).toString("base64url");
	res.setHeader("Set-Cookie", serializeCookie(state));
	return state;
}

function consumeState(req, res, providedState) {
	const expectedState = parseCookies(req)[COOKIE_NAME] || "";
	res.setHeader("Set-Cookie", serializeCookie("", { clear: true }));
	const provided = String(providedState || "");
	if (!expectedState || !provided) return false;
	const expectedBuffer = Buffer.from(expectedState);
	const providedBuffer = Buffer.from(provided);
	return (
		expectedBuffer.length === providedBuffer.length &&
		crypto.timingSafeEqual(expectedBuffer, providedBuffer)
	);
}

module.exports = {
	COOKIE_NAME,
	MAX_AGE_SECONDS,
	consumeState,
	createState,
	parseCookies,
	serializeCookie,
};
