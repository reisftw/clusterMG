// Mesmo padrao de apps/finan/backend/src/security/authRateLimit.js — por
// IP (nao por identidade, pra nao virar vetor de DoS direcionado contra a
// conta de outra pessoa).
const rateLimit = require("express-rate-limit");

function authRateLimiter({ windowMs, limit, message }) {
	return rateLimit({
		windowMs,
		limit,
		standardHeaders: true,
		legacyHeaders: false,
		message: { ok: false, error: message },
	});
}

const loginRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.ROT_LOGIN_RATE_LIMIT || 20),
	message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
});

const passwordResetRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.ROT_PASSWORD_RESET_RATE_LIMIT || 10),
	message: "Muitas solicitações. Tente novamente em alguns minutos.",
});

const mfaVerifyRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.ROT_MFA_RATE_LIMIT || 30),
	message: "Muitas tentativas de verificação. Tente novamente em alguns minutos.",
});

module.exports = {
	loginRateLimit,
	passwordResetRateLimit,
	mfaVerifyRateLimit,
};
