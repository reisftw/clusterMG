const crypto = require("node:crypto");
const argon2 = require("argon2");
const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const emailService = require("../emailService");
const { createAttemptTracker } = require("../security/attemptTracker");
const registration = require("./registration");

const COOKIE = "mercado_session";
const TTL_MS = Number(process.env.MERCADO_SESSION_TTL_MS || 1000 * 60 * 60 * 12);
const ATTEMPT_TTL_MS = Number(
	process.env.MERCADO_AUTH_ATTEMPT_TTL_MS || 15 * 60 * 1000,
);
const ATTEMPT_MAX_ENTRIES = Number(
	process.env.MERCADO_AUTH_ATTEMPT_MAX_ENTRIES || 10000,
);

const attempts = createAttemptTracker();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const marketPublicUrl = () => String(
	process.env.MERCADO_PUBLIC_APP_URL || "https://mercado.retiradas.tech",
).replace(/\/$/, "");
const cookie = (token, maxAge) => `${COOKIE}=${encodeURIComponent(token || "")}; Path=/api/mercado; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}Max-Age=${maxAge}`;
function tokenFrom(req) { return String(req.get("cookie") || "").split(";").map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || ""; }
function publicUser(row) { return { id: row.id, email: row.email, displayName: row.display_name, prestadorId: row.prestador_id || null, empresaId: row.prestador_id || row.empresa_id, empresaNome: row.nome_exibicao || row.empresa_nome, role: row.role || "PRESTADOR", emailVerifiedAt: row.email_verified_at || null, statusCadastro: row.status_cadastro || null, statusHabilitacao: row.status_habilitacao || null }; }

async function current(req) {
	const token = tokenFrom(req);
	if (!token) return null;
	const result = await db.query(`select a.id,a.email,a.display_name,a.email_verified_at,a.prestador_id,p.nome_exibicao,p.status_cadastro,p.status_habilitacao,mae.empresa_id,meh.empresa_nome,mae.role
      from mercado_sessions s join mercado_accounts a on a.id=s.account_id
	      left join mercado_prestadores p on p.id=a.prestador_id
	      left join mercado_account_empresas mae on mae.account_id=a.id and mae.active
	      left join mercado_empresa_habilitacoes meh on meh.empresa_id=mae.empresa_id
      where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and not a.disabled limit 1`, [hash(token)]);
	return result.rows[0] ? publicUser(result.rows[0]) : null;
}

function requireMercadoAuth(req, res, next) {
	current(req).then((user) => { if (!user) return res.status(401).json({ error: "Sessao do Mercado invalida." }); req.mercadoUser = user; next(); }).catch(next);
}

function createMercadoAuthRouter() {
	const router = express.Router();
	const publicAuthLimiter = rateLimit({
		windowMs: Number(
			process.env.MERCADO_AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
		),
		limit: Number(process.env.MERCADO_AUTH_RATE_LIMIT_MAX || 120),
		standardHeaders: true,
		legacyHeaders: false,
		message: { error: "Muitas tentativas. Tente novamente mais tarde." },
	});
	router.use(
		["/login", "/resend-verification", "/password-recovery", "/password-reset"],
		publicAuthLimiter,
	);
	router.post("/register", async (req,res,next) => { try { res.status(201).json(await registration.register(req.body || {}, { appUrl: marketPublicUrl() })); } catch(error) { next(error); } });
	router.post("/verify-email", async (req,res,next) => { try { res.json(await registration.verifyEmail(String(req.body?.token || ""))); } catch(error) { next(error); } });
	router.post("/resend-verification", async (req, res, next) => { try {
		const email = String(req.body?.email || "").trim().toLowerCase(); const key = `verify:${req.ip}:${email}`;
		if ((attempts.get(key) || 0) >= 4) return res.status(429).json({ error: "Tente novamente mais tarde." });
		attempts.increment(key);
		const account = (await db.query("select id,email,display_name,prestador_id,email_verified_at from mercado_accounts where lower(email)=lower($1) and not disabled limit 1", [email])).rows[0];
		if (account?.prestador_id && !account.email_verified_at) await registration.createVerification(account, marketPublicUrl());
		res.status(202).json({ ok: true, message: "Se houver uma conta pendente, enviaremos um novo link." });
	} catch (error) { next(error); } });
	router.post("/login", async (req, res, next) => {
		try {
			const email = String(req.body?.email || "").trim().toLowerCase();
			const key = `${req.ip}:${email}`;
			if ((attempts.get(key) || 0) >= 8) return res.status(429).json({ error: "Tente novamente mais tarde." });
			const result = await db.query("select id,email,display_name,password_hash,disabled,locked_until,prestador_id,email_verified_at from mercado_accounts where lower(email)=lower($1) limit 1", [email]);
			const account = result.rows[0];
			const valid = account && !account.disabled && (!account.locked_until || new Date(account.locked_until) < new Date()) && await argon2.verify(account.password_hash, String(req.body?.password || ""));
			if (!valid) { attempts.increment(key); return res.status(401).json({ error: "E-mail ou senha invalidos." }); }
			if (account.prestador_id && !account.email_verified_at) return res.status(403).json({ error: "Confirme seu e-mail antes de acessar o Mercado." });
			attempts.delete(key);
			const raw = crypto.randomBytes(32).toString("base64url");
			await db.query("insert into mercado_sessions(account_id,token_hash,expires_at) values($1,$2,$3)", [account.id, hash(raw), new Date(Date.now() + TTL_MS)]);
			res.setHeader("Set-Cookie", cookie(raw, Math.floor(TTL_MS / 1000)));
			res.json({ user: await current({ get: () => `${COOKIE}=${encodeURIComponent(raw)}` }) });
		} catch (error) { next(error); }
	});
	router.get("/me", async (req, res, next) => { try { const user = await current(req); if (!user) return res.status(401).json({ error: "Sessao do Mercado invalida." }); res.json({ user }); } catch (error) { next(error); } });
	router.post("/logout", async (req, res, next) => { try { const token = tokenFrom(req); if (token) await db.query("update mercado_sessions set revoked_at=now() where token_hash=$1", [hash(token)]); res.setHeader("Set-Cookie", cookie("", 0)); res.status(204).end(); } catch (error) { next(error); } });
	// Always answer with the same message: it prevents account enumeration.
	router.post("/password-recovery", async (req, res, next) => {
		try {
			const email = String(req.body?.email || "").trim().toLowerCase();
			const account = (await db.query(
				"select id,email,display_name from mercado_accounts where lower(email)=lower($1) and not disabled limit 1",
				[email],
			)).rows[0];
			if (account) {
				const raw = crypto.randomBytes(32).toString("base64url");
				await db.query("update mercado_password_resets set used_at=now() where account_id=$1 and used_at is null", [account.id]);
				await db.query(
					"insert into mercado_password_resets(account_id,token_hash,expires_at) values($1,$2,now() + interval '30 minutes')",
					[account.id, hash(raw)],
				);
				const resetUrl = `${marketPublicUrl()}/mercado/redefinir-senha?token=${encodeURIComponent(raw)}`;
				await emailService.sendPasswordResetEmail({ user: { uid: account.id, email: account.email, display_name: account.display_name }, resetUrl });
			}
			res.status(202).json({ ok: true, message: "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação." });
		} catch (error) { next(error); }
	});
	router.post("/password-reset", async (req, res, next) => {
		try {
			const token = String(req.body?.token || "");
			const password = String(req.body?.password || "");
			if (token.length < 32 || password.length < 10) return res.status(400).json({ error: "Informe uma nova senha com ao menos 10 caracteres." });
			const client = await db.connect();
			try {
				await client.query("begin");
				const reset = await client.query(
					`select pr.id, pr.account_id from mercado_password_resets pr
					 where pr.token_hash=$1 and pr.used_at is null and pr.expires_at > now() for update`, [hash(token)],
				);
				if (!reset.rows[0]) { const error = new Error("Link de recuperação inválido ou expirado."); error.status = 400; error.statusCode = 400; throw error; }
				const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
				await client.query("update mercado_accounts set password_hash=$2, session_version=session_version+1, failed_login_count=0, locked_until=null, updated_at=now() where id=$1", [reset.rows[0].account_id, passwordHash]);
				await client.query("update mercado_password_resets set used_at=now() where id=$1", [reset.rows[0].id]);
				await client.query("update mercado_sessions set revoked_at=now() where account_id=$1 and revoked_at is null", [reset.rows[0].account_id]);
				await client.query("commit");
			} catch (error) { await client.query("rollback").catch(() => {}); throw error; } finally { client.release(); }
			res.json({ ok: true });
		} catch (error) { next(error); }
	});
	return router;
}
module.exports = {
	createAttemptTracker,
	createMercadoAuthRouter,
	requireMercadoAuth,
	current,
};
