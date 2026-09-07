const express = require("express");
const crypto = require("node:crypto");
const argon2 = require("argon2");
const multer = require("multer");
const db = require("../db");
const {
	sendMfaLoginCodeEmail,
	sendPasswordResetEmail,
	sendPinLockedEmail,
} = require("../email/service");
const { findUserByBearer, requireFinanAuth, publicUser, tokenHash } = require("./middleware");
const {
	loginRateLimit,
	mfaVerifyRateLimit,
	passwordResetRateLimit,
	pinSetupRateLimit,
	pinVerifyRateLimit,
	pinRecoveryRequestRateLimit,
} = require("../security/authRateLimit");
const { noStore } = require("../security/noStore");

const router = express.Router();
const SESSION_TTL_DAYS = Number(process.env.FINAN_SESSION_TTL_DAYS || 7);
const RESET_TTL_MINUTES = Number(process.env.FINAN_PASSWORD_RESET_TTL_MINUTES || 30);
const MFA_TTL_MINUTES = Number(process.env.FINAN_MFA_EMAIL_TTL_MINUTES || 10);
const MFA_MAX_ATTEMPTS = Number(process.env.FINAN_MFA_MAX_ATTEMPTS || 5);
const PIN_MAX_ATTEMPTS = Number(process.env.FINAN_PIN_MAX_ATTEMPTS || 3);
const PIN_RECOVERY_TTL_MINUTES = Number(process.env.FINAN_PIN_RECOVERY_TTL_MINUTES || 30);
const PIN_PATTERN = /^\d{6}$/;
const avatarUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 700 * 1024 },
	fileFilter: (_req, file, callback) => {
		if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype || "")) {
			callback(null, true);
			return;
		}
		const error = new Error("Envie apenas imagens PNG, JPEG, WEBP ou GIF.");
		error.status = 400;
		callback(error);
	},
});

function randomToken() {
	return crypto.randomBytes(32).toString("base64url");
}

function isMfaRequiredFor(user) {
	if (String(process.env.FINAN_MFA_EMAIL_ENABLED || "true") !== "false") return true;
	return Boolean(user?.mfa_enabled);
}

function createEmailMfaCode() {
	return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function maskEmail(email) {
	const [local, domain] = String(email || "").split("@");
	if (!local || !domain) return "";
	const visible =
		local.length <= 2
			? local.slice(0, 1)
			: `${local.slice(0, 2)}${"*".repeat(Math.min(6, local.length - 2))}`;
	return `${visible}@${domain}`;
}

async function createSession(userId) {
	const token = randomToken();
	const id = crypto.randomUUID();
	await db.query(
		`insert into finan_sessions (id, user_id, token_hash, expires_at)
		values ($1, $2, $3, now() + ($4 || ' days')::interval)`,
		[id, userId, tokenHash(token), SESSION_TTL_DAYS],
	);
	return { id, token };
}

async function createMfaChallenge(user) {
	const code = createEmailMfaCode();
	const id = crypto.randomUUID();
	const ttlMinutes = Math.max(3, Math.min(30, Number(MFA_TTL_MINUTES || 10)));
	await db.query(
		`insert into finan_mfa_challenges (id, user_id, code_hash, channel, expires_at)
		values ($1, $2, $3, 'email', now() + ($4 || ' minutes')::interval)`,
		[id, user.id, tokenHash(code), ttlMinutes],
	);
	return {
		challengeId: id,
		code,
		ttlMinutes,
		maskedEmail: maskEmail(user.mfa_email || user.email),
	};
}

async function createPasswordReset(userId) {
	const token = randomToken();
	const id = crypto.randomUUID();
	await db.query(
		`insert into finan_password_resets (id, user_id, token_hash, expires_at)
		values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
		[id, userId, tokenHash(token), RESET_TTL_MINUTES],
	);
	return { id, token };
}

async function findUserByEmail(email) {
	const { rows } = await db.query(
		`select
			u.*,
			coalesce(r.permissions, '[]'::jsonb) as permissions,
			coalesce(r.is_admin, false) as is_admin
		from finan_users u
		left join finan_roles r on r.id = u.role_id
		where lower(u.email) = lower($1)
		limit 1`,
		[email],
	);
	return rows[0] || null;
}

router.post("/login", loginRateLimit, async (req, res) => {
	const email = String(req.body?.email || "").trim().toLowerCase();
	const password = String(req.body?.password || "");
	if (!email || !password) {
		res.status(400).json({ ok: false, error: "Informe e-mail e senha." });
		return;
	}

	const user = await findUserByEmail(email);
	if (!user?.password_hash || user.status !== "ativo") {
		res.status(401).json({ ok: false, error: "E-mail ou senha inválidos." });
		return;
	}

	const valid = await argon2.verify(user.password_hash, password).catch(() => false);
	if (!valid) {
		res.status(401).json({ ok: false, error: "E-mail ou senha inválidos." });
		return;
	}

	if (user.pin_locked_at) {
		res.status(423).json({
			ok: false,
			error:
				"Conta bloqueada por tentativas de PIN inválidas. Verifique seu e-mail para recuperação.",
			pinLocked: true,
		});
		return;
	}

	if (isMfaRequiredFor(user)) {
		const challenge = await createMfaChallenge(user);
		const emailResult = await sendMfaLoginCodeEmail({
			to: user.mfa_email || user.email,
			name: user.name,
			code: challenge.code,
			ttlMinutes: challenge.ttlMinutes,
		});
		if (!emailResult.sent) {
			res.status(503).json({
				ok: false,
				error:
					"MFA do Finan está ativo, mas o SMTP não está configurado para enviar o código.",
			});
			return;
		}
		res.json({
			ok: true,
			mfaRequired: true,
			method: "email",
			challengeId: challenge.challengeId,
			maskedEmail: challenge.maskedEmail,
			ttlMinutes: challenge.ttlMinutes,
		});
		return;
	}

	const session = await createSession(user.id);
	await db.query("update finan_users set last_login_at = now() where id = $1", [
		user.id,
	]);
	res.json({ ok: true, token: session.token, user: publicUser(user) });
});

router.post("/mfa/email/verify", mfaVerifyRateLimit, async (req, res) => {
	const challengeId = String(req.body?.challengeId || "").trim();
	const code = String(req.body?.code || "").replace(/\D/g, "");
	if (!challengeId || code.length !== 6) {
		res.status(400).json({ ok: false, error: "Informe o código de 6 dígitos." });
		return;
	}

	const { rows } = await db.query(
		`select
			c.id as challenge_id,
			c.user_id as challenge_user_id,
			c.code_hash,
			c.expires_at,
			c.consumed_at,
			c.attempts,
			u.*,
			coalesce(r.permissions, '[]'::jsonb) as permissions,
			coalesce(r.is_admin, false) as is_admin
		from finan_mfa_challenges c
		join finan_users u on u.id = c.user_id
		left join finan_roles r on r.id = u.role_id
		where c.id = $1
		limit 1`,
		[challengeId],
	);
	const challenge = rows[0];
	if (!challenge || challenge.consumed_at || challenge.status !== "ativo") {
		res.status(400).json({ ok: false, error: "Código MFA inválido ou expirado." });
		return;
	}
	if (new Date(challenge.expires_at).getTime() < Date.now()) {
		res.status(400).json({ ok: false, error: "Código MFA expirado." });
		return;
	}
	if (Number(challenge.attempts || 0) >= MFA_MAX_ATTEMPTS) {
		res.status(429).json({ ok: false, error: "Limite de tentativas do MFA excedido." });
		return;
	}
	if (challenge.code_hash !== tokenHash(code)) {
		await db.query(
			"update finan_mfa_challenges set attempts = attempts + 1 where id = $1",
			[challengeId],
		);
		res.status(400).json({ ok: false, error: "Código MFA inválido." });
		return;
	}

	await db.query("update finan_mfa_challenges set consumed_at = now() where id = $1", [
		challengeId,
	]);
	const session = await createSession(challenge.challenge_user_id);
	await db.query("update finan_users set last_login_at = now() where id = $1", [
		challenge.challenge_user_id,
	]);
	res.json({ ok: true, token: session.token, user: publicUser(challenge) });
});

router.post("/password/forgot", passwordResetRateLimit, async (req, res) => {
	const email = String(req.body?.email || "").trim().toLowerCase();
	if (!email) {
		res.status(400).json({ ok: false, error: "Informe o e-mail." });
		return;
	}

	const user = await findUserByEmail(email);
	if (user?.status === "ativo") {
		const reset = await createPasswordReset(user.id);
		const publicUrl = process.env.FINAN_PUBLIC_URL || "https://finan.retiradas.tech";
		const emailResult = await sendPasswordResetEmail({
			to: user.email,
			name: user.name,
			resetUrl: `${publicUrl}/login?reset=${encodeURIComponent(reset.token)}`,
		}).catch((error) => ({ sent: false, error }));
		if (!emailResult.sent) {
			console.error("[finan-password-reset-email]", emailResult.error || emailResult.reason);
			res.status(503).json({
				ok: false,
				error: "Não foi possível enviar o e-mail de recuperação. Verifique o SMTP do Finan.",
			});
			return;
		}
	}

	res.json({
		ok: true,
		message:
			"Se o e-mail estiver cadastrado no Finan, enviaremos as instruções de recuperação.",
	});
});

router.post("/password/reset", passwordResetRateLimit, async (req, res) => {
	const token = String(req.body?.token || "");
	const password = String(req.body?.password || "");
	if (!token || password.length < 8) {
		res.status(400).json({
			ok: false,
			error: "Informe token e uma senha com pelo menos 8 caracteres.",
		});
		return;
	}

	const { rows } = await db.query(
		`select r.id, r.user_id
		from finan_password_resets r
		join finan_users u on u.id = r.user_id
		where r.token_hash = $1
			and r.consumed_at is null
			and r.expires_at > now()
			and u.status = 'ativo'
		limit 1`,
		[tokenHash(token)],
	);
	const reset = rows[0];
	if (!reset) {
		res.status(400).json({ ok: false, error: "Token inválido ou expirado." });
		return;
	}

	const passwordHash = await argon2.hash(password);
	await db.query(
		`update finan_users
		set password_hash = $1, must_change_password = false, updated_at = now()
		where id = $2`,
		[passwordHash, reset.user_id],
	);
	await db.query(
		"update finan_password_resets set consumed_at = now() where id = $1",
		[reset.id],
	);
	await db.query(
		"update finan_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
		[reset.user_id],
	);
	res.json({ ok: true });
});

// Troca de senha auto-atendimento (usuario ja logado, sabe a senha atual —
// diferente do fluxo de "esqueci minha senha" acima, que usa token por
// e-mail). Qualquer usuario autenticado pode trocar a PROPRIA senha aqui,
// sem precisar de nenhuma permissao especial.
router.post("/password/change", requireFinanAuth, passwordResetRateLimit, async (req, res, next) => {
	try {
		const currentPassword = String(req.body?.currentPassword || "");
		const newPassword = String(req.body?.newPassword || "");
		if (newPassword.length < 8) {
			res.status(400).json({
				ok: false,
				error: "A nova senha precisa ter pelo menos 8 caracteres.",
			});
			return;
		}

		const user = req.finanUser;
		const currentValid = user.password_hash
			? await argon2.verify(user.password_hash, currentPassword).catch(() => false)
			: false;
		if (!currentValid) {
			res.status(401).json({ ok: false, error: "Senha atual inválida." });
			return;
		}

		const passwordHash = await argon2.hash(newPassword);
		await db.query(
			`update finan_users
			set password_hash = $1, must_change_password = false, updated_at = now()
			where id = $2`,
			[passwordHash, user.id],
		);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// Avatar auto-atendimento: qualquer usuario troca o PROPRIO avatar (grava
// como data URL, mesmo padrao de compat/routes.js:/admin/avatars — so que
// aquela rota exige finan.usuarios.manage porque atualiza o avatar de
// QUALQUER usuario; esta aqui so mexe no proprio registro, entao nao
// precisa de nenhuma permissao alem de estar autenticado).
router.post(
	"/avatar",
	requireFinanAuth,
	avatarUpload.single("avatar"),
	async (req, res, next) => {
		try {
			if (!req.file) {
				res.status(400).json({ ok: false, error: "Envie uma imagem." });
				return;
			}
			const avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
			await db.query(
				"update finan_users set avatar_url = $1, updated_at = now() where id = $2",
				[avatarUrl, req.finanUser.id],
			);
			res.json({ ok: true, avatarUrl });
		} catch (error) {
			next(error);
		}
	},
);

async function createPinRecovery(userId) {
	const token = randomToken();
	const id = crypto.randomUUID();
	await db.query(
		`insert into finan_pin_recovery (id, user_id, token_hash, expires_at)
		values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
		[id, userId, tokenHash(token), PIN_RECOVERY_TTL_MINUTES],
	);
	return { id, token };
}

// PIN de bloqueio de app: trava local exigida sempre que o PWA volta de
// background. Independente da sessao (bearer) continuar valida — e uma
// segunda camada, nao substitui login/MFA. Auto-atendimento: qualquer
// usuario autenticado mexe apenas no proprio PIN aqui (gerenciar o PIN de
// terceiros exige RBAC + hierarquia, ver pinAdminRoutes.js).

const DEFAULT_PIN_IDLE_TIMEOUT_MINUTES = Number(process.env.FINAN_PIN_IDLE_TIMEOUT_MINUTES || 20);

// Le o tempo de inatividade configurado (desktop) direto de finan_settings,
// sem passar pelo router de /configuracoes — aquele exige
// "finan.configuracoes.view", mas TODO usuario autenticado precisa saber
// esse numero para o proprio relogio de inatividade funcionar. A escrita
// continua exclusiva de quem tem "finan.configuracoes.manage" (rota
// PUT /configuracoes/section/pin_lock, ja existente e generica).
async function getPinIdleTimeoutMinutes() {
	const { rows } = await db
		.query("select value from finan_settings where key = 'pin_lock' limit 1")
		.catch(() => ({ rows: [] }));
	const minutes = Number(rows[0]?.value?.idleTimeoutMinutes);
	return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_PIN_IDLE_TIMEOUT_MINUTES;
}

router.get("/pin/status", requireFinanAuth, noStore, async (req, res, next) => {
	try {
		const idleTimeoutMinutes = await getPinIdleTimeoutMinutes();
		res.json({
			ok: true,
			configured: Boolean(req.finanUser.pin_hash),
			idleTimeoutMinutes,
		});
	} catch (error) {
		next(error);
	}
});

router.post("/pin/setup", requireFinanAuth, pinSetupRateLimit, async (req, res, next) => {
	try {
		const pin = String(req.body?.pin || "");
		const secretWord = String(req.body?.secretWord || "").trim();
		const currentPin = String(req.body?.currentPin || "");

		if (!PIN_PATTERN.test(pin)) {
			res.status(400).json({ ok: false, error: "O PIN deve ter exatamente 6 dígitos." });
			return;
		}
		if (secretWord.length < 3) {
			res.status(400).json({
				ok: false,
				error: "Informe uma palavra secreta com pelo menos 3 caracteres.",
			});
			return;
		}

		const user = req.finanUser;
		if (user.pin_hash) {
			const currentValid = PIN_PATTERN.test(currentPin)
				? await argon2.verify(user.pin_hash, currentPin).catch(() => false)
				: false;
			if (!currentValid) {
				res.status(401).json({ ok: false, error: "PIN atual inválido." });
				return;
			}
		}

		const pinHash = await argon2.hash(pin);
		const secretWordHash = await argon2.hash(secretWord.toLowerCase());
		await db.query(
			`update finan_users
			set pin_hash = $1, pin_secret_word_hash = $2, pin_failed_attempts = 0,
				pin_locked_at = null, pin_configured_at = now(), updated_at = now()
			where id = $3`,
			[pinHash, secretWordHash, user.id],
		);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/pin/verify", requireFinanAuth, pinVerifyRateLimit, async (req, res, next) => {
	try {
		const pin = String(req.body?.pin || "");
		if (!PIN_PATTERN.test(pin)) {
			res.status(400).json({ ok: false, error: "Informe o PIN de 6 dígitos." });
			return;
		}

		const user = req.finanUser;
		if (user.pin_locked_at) {
			res.status(423).json({ ok: false, error: "Conta bloqueada por tentativas de PIN inválidas." });
			return;
		}
		if (!user.pin_hash) {
			res.status(400).json({ ok: false, error: "PIN ainda não configurado." });
			return;
		}

		const valid = await argon2.verify(user.pin_hash, pin).catch(() => false);
		if (valid) {
			await db.query("update finan_users set pin_failed_attempts = 0 where id = $1", [
				user.id,
			]);
			res.json({ ok: true });
			return;
		}

		const { rows } = await db.query(
			`update finan_users set pin_failed_attempts = pin_failed_attempts + 1
			where id = $1
			returning pin_failed_attempts`,
			[user.id],
		);
		const attempts = Number(rows[0]?.pin_failed_attempts || 0);
		if (attempts >= PIN_MAX_ATTEMPTS) {
			await db.query("update finan_users set pin_locked_at = now() where id = $1", [
				user.id,
			]);
			await db.query(
				"update finan_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
				[user.id],
			);
			const recovery = await createPinRecovery(user.id);
			const publicUrl = process.env.FINAN_PUBLIC_URL || "https://finan.retiradas.tech";
			await sendPinLockedEmail({
				to: user.email,
				name: user.name,
				recoveryUrl: `${publicUrl}/pin-recovery?token=${encodeURIComponent(recovery.token)}`,
				ttlMinutes: PIN_RECOVERY_TTL_MINUTES,
			}).catch((error) => console.error("[finan-pin-locked-email]", error?.message || error));
			res.status(423).json({
				ok: false,
				error: "Conta bloqueada por tentativas de PIN inválidas. Verifique seu e-mail.",
				pinLocked: true,
			});
			return;
		}

		res.status(401).json({
			ok: false,
			error: "PIN inválido.",
			attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - attempts),
		});
	} catch (error) {
		next(error);
	}
});

router.post("/pin/recover/request", pinRecoveryRequestRateLimit, async (req, res, next) => {
	try {
		const email = String(req.body?.email || "").trim().toLowerCase();
		if (!email) {
			res.status(400).json({ ok: false, error: "Informe o e-mail." });
			return;
		}

		const user = await findUserByEmail(email);
		if (user?.status === "ativo" && user.pin_locked_at) {
			const recovery = await createPinRecovery(user.id);
			const publicUrl = process.env.FINAN_PUBLIC_URL || "https://finan.retiradas.tech";
			await sendPinLockedEmail({
				to: user.email,
				name: user.name,
				recoveryUrl: `${publicUrl}/pin-recovery?token=${encodeURIComponent(recovery.token)}`,
				ttlMinutes: PIN_RECOVERY_TTL_MINUTES,
			}).catch((error) => console.error("[finan-pin-recovery-email]", error?.message || error));
		}

		res.json({
			ok: true,
			message:
				"Se a conta estiver bloqueada, enviaremos as instruções de recuperação para o e-mail cadastrado.",
		});
	} catch (error) {
		next(error);
	}
});

router.post("/pin/recover/confirm", pinRecoveryRequestRateLimit, async (req, res, next) => {
	try {
		const token = String(req.body?.token || "");
		const secretWord = String(req.body?.secretWord || "").trim().toLowerCase();
		const newPin = String(req.body?.newPin || "");

		if (!token || !secretWord || !PIN_PATTERN.test(newPin)) {
			res.status(400).json({
				ok: false,
				error: "Informe o token, a palavra secreta e um PIN novo de 6 dígitos.",
			});
			return;
		}

		const { rows } = await db.query(
			`select r.id, r.user_id, u.pin_secret_word_hash
			from finan_pin_recovery r
			join finan_users u on u.id = r.user_id
			where r.token_hash = $1
				and r.consumed_at is null
				and r.expires_at > now()
				and u.status = 'ativo'
			limit 1`,
			[tokenHash(token)],
		);
		const recovery = rows[0];
		if (!recovery) {
			res.status(400).json({ ok: false, error: "Token inválido ou expirado." });
			return;
		}

		const secretWordValid = recovery.pin_secret_word_hash
			? await argon2.verify(recovery.pin_secret_word_hash, secretWord).catch(() => false)
			: false;
		if (!secretWordValid) {
			res.status(401).json({ ok: false, error: "Palavra secreta inválida." });
			return;
		}

		const pinHash = await argon2.hash(newPin);
		await db.query(
			`update finan_users
			set pin_hash = $1, pin_failed_attempts = 0, pin_locked_at = null,
				pin_configured_at = now(), updated_at = now()
			where id = $2`,
			[pinHash, recovery.user_id],
		);
		await db.query("update finan_pin_recovery set consumed_at = now() where id = $1", [
			recovery.id,
		]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.get("/me", async (req, res) => {
	const user = await findUserByBearer(req);
	if (!user) {
		res.status(401).json({ ok: false, error: "Sessão do Finan não autenticada." });
		return;
	}
	res.json({ ok: true, user: publicUser(user) });
});

router.post("/logout", async (req, res) => {
	const raw = String(req.headers.authorization || "");
	const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
	if (token) {
		await db.query(
			"update finan_sessions set revoked_at = now() where token_hash = $1",
			[tokenHash(token)],
		);
	}
	res.json({ ok: true });
});

module.exports = router;
