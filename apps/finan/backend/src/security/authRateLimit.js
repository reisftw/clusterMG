// Rate limiting dedicado para rotas sensiveis de autenticacao.
//
// O rateLimit global do app.js (FINAN_RATE_LIMIT_PER_MINUTE, default 600/min)
// e generoso demais pra proteger login/MFA/reset de senha especificamente —
// 600 tentativas por minuto e mais que suficiente pra um brute-force
// pratico contra uma conta com senha fraca. Estes limitadores adicionais
// sao mais restritos e cobrem so as rotas de autenticacao.
//
// Chave por IP (nao por e-mail/identidade): se fosse por e-mail, um
// atacante poderia bloquear deliberadamente a conta de outra pessoa so
// mandando tentativas invalidas com o e-mail dela (DoS direcionado). Por
// IP, o pior caso e o proprio atacante ficar bloqueado.
const rateLimit = require("express-rate-limit");

function authRateLimiter({ windowMs, limit, message }) {
	return rateLimit({
		windowMs,
		limit,
		standardHeaders: true,
		legacyHeaders: false,
		message: { ok: false, error: message },
		// Nao usa o IP + rota como chave composta: cada limiter ja e
		// instanciado por rota, entao o keyGenerator padrao (por IP) basta.
	});
}

// Login: permite tentativas normais de digitar a senha errada 1-2 vezes,
// mas barra um brute-force de dezenas/centenas de tentativas.
const loginRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.FINAN_LOGIN_RATE_LIMIT || 20),
	message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
});

// Verificacao de codigo MFA: ja tem limite de 5 tentativas POR CHALLENGE
// (finan_mfa_challenges.attempts), mas nada impedia gerar varios challenges
// novos rapido — este limite cobre a rota como um todo.
const mfaVerifyRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.FINAN_MFA_RATE_LIMIT || 30),
	message: "Muitas tentativas de verificação. Tente novamente em alguns minutos.",
});

// Esqueci minha senha / reset: mais restrito, ja que cada chamada dispara
// um envio de e-mail real (custo de SMTP) e um token novo.
const passwordResetRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.FINAN_PASSWORD_RESET_RATE_LIMIT || 10),
	message: "Muitas solicitações. Tente novamente em alguns minutos.",
});

// PIN de bloqueio de app: cadastro/troca do PIN pessoal. Nao e o limite que
// bloqueia a conta (isso e o contador pin_failed_attempts no banco, por
// usuario) — e so uma defesa em profundidade contra abuso da rota em si.
const pinSetupRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.FINAN_PIN_SETUP_RATE_LIMIT || 20),
	message: "Muitas tentativas de configurar o PIN. Tente novamente em alguns minutos.",
});

// Verificacao do PIN de bloqueio: o limite real de 3 erros ja mora em
// finan_users.pin_failed_attempts (por conta, nao por IP) — este limitador
// so cobre a rota contra flood/distribuicao de tentativas.
const pinVerifyRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.FINAN_PIN_RATE_LIMIT || 30),
	message: "Muitas tentativas de verificação do PIN. Tente novamente em alguns minutos.",
});

// Recuperacao de PIN por e-mail + palavra secreta: mais restrito, mesmo
// raciocinio do passwordResetRateLimit (cada chamada dispara SMTP real).
const pinRecoveryRequestRateLimit = authRateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.FINAN_PIN_RECOVERY_RATE_LIMIT || 10),
	message: "Muitas solicitações. Tente novamente em alguns minutos.",
});

module.exports = {
	loginRateLimit,
	mfaVerifyRateLimit,
	passwordResetRateLimit,
	pinSetupRateLimit,
	pinVerifyRateLimit,
	pinRecoveryRequestRateLimit,
};
