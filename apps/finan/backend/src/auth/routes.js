const express = require("express");
const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../db");

const router = express.Router();
const SESSION_TTL_DAYS = Number(process.env.FINAN_SESSION_TTL_DAYS || 7);

function publicUser(user) {
	return {
		id: user.id,
		uid: user.id,
		name: user.name,
		email: user.email,
		role: user.role_id,
		permissions: user.permissions || [],
		isAdmin: Boolean(user.is_admin),
	};
}

function randomToken() {
	return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token) {
	return crypto.createHash("sha256").update(token).digest("hex");
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

async function findUserByBearer(req) {
	const raw = String(req.headers.authorization || "");
	const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
	if (!token) return null;
	const { rows } = await db.query(
		`select
			u.*,
			coalesce(r.permissions, '[]'::jsonb) as permissions,
			coalesce(r.is_admin, false) as is_admin
		from finan_sessions s
		join finan_users u on u.id = s.user_id
		left join finan_roles r on r.id = u.role_id
		where s.token_hash = $1
			and s.revoked_at is null
			and s.expires_at > now()
			and u.status = 'ativo'
		limit 1`,
		[tokenHash(token)],
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
