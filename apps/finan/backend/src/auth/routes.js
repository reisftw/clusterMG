const express = require("express");
const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../db");
const { sendMfaLoginCodeEmail, sendPasswordResetEmail } = require("../email/service");
const { findUserByBearer, publicUser, tokenHash } = require("./middleware");

const router = express.Router();
const SESSION_TTL_DAYS = Number(process.env.FINAN_SESSION_TTL_DAYS || 7);
const RESET_TTL_MINUTES = Number(process.env.FINAN_PASSWORD_RESET_TTL_MINUTES || 30);
const MFA_TTL_MINUTES = Number(process.env.FINAN_MFA_EMAIL_TTL_MINUTES || 10);
const MFA_MAX_ATTEMPTS = Number(process.env.FINAN_MFA_MAX_ATTEMPTS || 5);

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

router.post("/login", async (req, res) => {
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

router.post("/mfa/email/verify", async (req, res) => {
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

router.post("/password/forgot", async (req, res) => {
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

router.post("/password/reset", async (req, res) => {
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
