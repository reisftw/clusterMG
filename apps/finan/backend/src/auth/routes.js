const express = require("express");
const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../db");
const { sendPasswordResetEmail } = require("../email/service");
const { findUserByBearer, publicUser, tokenHash } = require("./middleware");

const router = express.Router();
const SESSION_TTL_DAYS = Number(process.env.FINAN_SESSION_TTL_DAYS || 7);
const RESET_TTL_MINUTES = Number(process.env.FINAN_PASSWORD_RESET_TTL_MINUTES || 30);

function randomToken() {
	return crypto.randomBytes(32).toString("base64url");
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

	if (user.mfa_enabled) {
		res.status(501).json({
			ok: false,
			error:
				"MFA próprio do Finan já está reservado, mas o envio de e-mail será ligado após migrarmos a configuração SMTP.",
		});
		return;
	}

	const session = await createSession(user.id);
	await db.query("update finan_users set last_login_at = now() where id = $1", [
		user.id,
	]);
	res.json({ ok: true, token: session.token, user: publicUser(user) });
});

router.post("/mfa/email/verify", (_req, res) => {
	res.status(501).json({
		ok: false,
		error: "MFA próprio do Finan reservado.",
	});
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
		const publicUrl = process.env.FINAN_PUBLIC_URL || "https://finan.retirada.tech";
		await sendPasswordResetEmail({
			to: user.email,
			name: user.name,
			resetUrl: `${publicUrl}/login?reset=${encodeURIComponent(reset.token)}`,
		});
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
