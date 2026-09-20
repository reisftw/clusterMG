const express = require("express");
const crypto = require("node:crypto");
const argon2 = require("argon2");
const multer = require("multer");
const { OAuth2Client } = require("google-auth-library");
const db = require("../db");
const { randomId } = require("../secureRandom");
const {
	sendMfaLoginCodeEmail,
	sendPasswordChangedEmail,
	sendPasswordResetEmail,
} = require("../email/service");
const {
	findUserByBearer,
	publicUser,
	requireRotAuth,
	requireRotPermission,
	revokeRotSession,
	SESSION_COOKIE_NAME,
	signSession,
} = require("./middleware");
const { loginRateLimit, passwordResetRateLimit, mfaVerifyRateLimit } = require("../security/authRateLimit");
const { noStore } = require("../security/noStore");
const { AVATAR_UPLOAD_LIMITS, assertUploadedImage, imageFileFilter } = require("../security/uploadFilters");
const { validateBody } = require("../security/bodyValidation");
const { readOauthConfig } = require("../oauth/config");

const router = express.Router();
const RESET_TTL_MINUTES = Number(process.env.ROT_PASSWORD_RESET_TTL_MINUTES || 30);
const MFA_TTL_MINUTES = Number(process.env.ROT_MFA_EMAIL_TTL_MINUTES || 10);
const MFA_MAX_ATTEMPTS = Number(process.env.ROT_MFA_MAX_ATTEMPTS || 5);

function isProduction() {
	return process.env.NODE_ENV === "production";
}

function authCookieOptions(maxAgeSeconds) {
	return [
		"HttpOnly",
		"Path=/",
		"SameSite=Strict",
		`Max-Age=${Math.max(0, Math.trunc(Number(maxAgeSeconds || 0)))}`,
		isProduction() ? "Secure" : "",
	].filter(Boolean);
}

function setSessionCookie(res, token) {
	res.setHeader(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=${encodeURIComponent(token || "")}; ${authCookieOptions(7 * 24 * 60 * 60).join("; ")}`,
	);
}

function clearSessionCookie(res) {
	res.setHeader(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=; ${authCookieOptions(0).join("; ")}`,
	);
}

function sendSession(res, session) {
	setSessionCookie(res, session.token);
	res.json({ ok: true, user: session.user });
}

// Mesmo padrao de apps/finan/backend/src/compat/routes.js: avatar vira
// data URL salvo direto em rot_users.avatar_url — sem storage externo,
// sem CDN, mesma filosofia self-hosted do resto do ecossistema.
const avatarUpload = multer({
	storage: multer.memoryStorage(),
	limits: AVATAR_UPLOAD_LIMITS,
	fileFilter: imageFileFilter,
});

function randomToken() {
	return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token) {
	return crypto.createHash("sha256").update(token).digest("hex");
}

function createEmailMfaCode() {
	return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function maskEmail(email) {
	const [local, domain] = String(email || "").split("@");
	if (!local || !domain) return "";
	const visible = local.length <= 2 ? local.slice(0, 1) : `${local.slice(0, 2)}${"*".repeat(Math.min(6, local.length - 2))}`;
	return `${visible}@${domain}`;
}

async function loadUserWithRole(where, param) {
	const { rows } = await db.query(
		`select
			u.*,
			r.name as role_name,
			r.level as role_level,
			r.is_global,
			case
				when exists (select 1 from rot_role_permissions rp where rp.role_id = r.id)
					then (
						select coalesce(jsonb_agg(rp.permission_id order by rp.permission_id), '[]'::jsonb)
						from rot_role_permissions rp
						join rot_permissions p on p.id = rp.permission_id and p.active = true
						where rp.role_id = r.id
					)
				else coalesce(r.permissions, '[]'::jsonb)
			end as permissions,
			coalesce(
				(
					select array_agg(uos.operation_type order by case when uos.is_primary then 0 else 1 end, uos.operation_type)
					from rot_user_operation_scopes uos
					join rot_operation_types ot on ot.id = uos.operation_type and ot.active = true
					where uos.user_id = u.id
				),
				array['ROT']::text[]
			) as operation_scopes
		from rot_users u
		join rot_roles r on r.id = u.role_id
		where ${where}
		limit 1`,
		[param],
	);
	return rows[0] || null;
}

async function loadUserById(id) {
	return loadUserWithRole("u.id = $1", id);
}

async function touchLastLogin(userId, req, provider) {
	await db.query(
		`update rot_users
		set last_login_at = now(), last_login_ip = $2, login_provider = $3, updated_at = now()
		where id = $1`,
		[userId, String(req?.ip || ""), provider],
	);
}

// MFA por e-mail: mesmo padrao de apps/finan/backend/src/auth/routes.js
// (createMfaChallenge). So dispara se o usuario tiver e-mail cadastrado
// (o login original da Operação era so por "username", sem e-mail obrigatorio
// — sem e-mail, nao ha como entregar o codigo, entao pula MFA nesse caso
// em vez de travar o acesso de quem nunca teve e-mail cadastrado).
const MFA_RESEND_COOLDOWN_SECONDS = Number(process.env.ROT_MFA_RESEND_COOLDOWN_SECONDS || 45);

async function createMfaChallenge(user) {
	// Reaproveita um desafio ja pendente e recente em vez de criar/enviar
	// um e-mail novo a cada tentativa — sem isso, duplo clique, reenvio de
	// formulario ou o usuario tentando de novo sem ver resposta na hora
	// spammava a caixa de entrada com um codigo novo por tentativa.
	const { rows: pending } = await db.query(
		`select id, expires_at from rot_mfa_challenges
		where user_id = $1 and channel = 'email' and consumed_at is null and expires_at > now()
			and created_at > now() - ($2 || ' seconds')::interval
		order by created_at desc
		limit 1`,
		[user.id, MFA_RESEND_COOLDOWN_SECONDS],
	);
	if (pending[0]) {
		const remainingMinutes = Math.max(
			1,
			Math.ceil((new Date(pending[0].expires_at).getTime() - Date.now()) / 60000),
		);
		return { challengeId: pending[0].id, ttlMinutes: remainingMinutes, maskedEmail: maskEmail(user.email) };
	}

	const code = createEmailMfaCode();
	const id = randomId("rotmfa");
	const ttlMinutes = Math.max(3, Math.min(30, MFA_TTL_MINUTES));
	await db.query(
		`insert into rot_mfa_challenges (id, user_id, code_hash, channel, expires_at)
		values ($1, $2, $3, 'email', now() + ($4 || ' minutes')::interval)`,
		[id, user.id, tokenHash(code), ttlMinutes],
	);
	await sendMfaLoginCodeEmail({ to: user.email, name: user.name, code, ttlMinutes }).catch((error) => {
		console.error("[rot-auth] falha ao enviar código MFA:", error?.message || error);
	});
	return { challengeId: id, ttlMinutes, maskedEmail: maskEmail(user.email) };
}

async function issueSessionResponse(user, req, provider) {
	if (user.mfa_enabled && !user.email) {
		return {
			mfaConfigurationRequired: true,
			error: "MFA_CONFIGURATION_REQUIRED",
			message: "Sua conta exige MFA, mas não possui e-mail cadastrado. Peça para um administrador corrigir seu cadastro.",
		};
	}
	if (user.mfa_enabled && user.email) {
		const challenge = await createMfaChallenge(user);
		return { mfaRequired: true, ...challenge };
	}
	await touchLastLogin(user.id, req, provider);
	return { token: await signSession(user), user: publicUser(user) };
}

// -- Login local (usuario/senha) — aceita e-mail OU username no mesmo campo
// (18 dos 21 usuarios ativos em producao nao tem e-mail cadastrado ainda,
// entao exigir e-mail travaria a maioria pra fora; aceitar os dois evita
// isso enquanto o cadastro de e-mail nao e generalizado). Comparacao em
// texto puro trocada por argon2, mesmo padrao do Finan. Depois de senha
// valida, passa por MFA por e-mail (se o usuario tiver e-mail cadastrado)
// antes de emitir o JWT — mesmo padrao de segurança do resto do ecossistema.
router.post("/login", loginRateLimit, validateBody(["username", "password"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const identifier = String(req.body?.username || "").trim().toLowerCase();
		const password = String(req.body?.password || "");
		if (!identifier || !password) {
			res.status(400).json({ ok: false, error: "Informe usuário/e-mail e senha." });
			return;
		}

		const user = await loadUserWithRole(
			"(lower(u.username) = lower($1) or lower(u.email) = lower($1))",
			identifier,
		);
		if (!user || user.status !== "ativo") {
			res.status(401).json({ ok: false, error: "Usuário ou senha inválidos." });
			return;
		}

		const valid = await argon2.verify(user.password_hash, password).catch(() => false);
		if (!valid) {
			res.status(401).json({ ok: false, error: "Usuário ou senha inválidos." });
			return;
		}

		const session = await issueSessionResponse(user, req, "local");
		if (session.mfaConfigurationRequired) {
			res.status(403).json({ ok: false, ...session });
			return;
		}
		if (session.mfaRequired) {
			res.json({ ok: true, ...session });
			return;
		}
		sendSession(res, session);
	} catch (error) {
		next(error);
	}
});

router.post("/verify-mfa", mfaVerifyRateLimit, validateBody(["challengeId", "code"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const challengeId = String(req.body?.challengeId || "");
		const code = String(req.body?.code || "").trim();
		if (!challengeId || !code) {
			res.status(400).json({ ok: false, error: "Informe o código recebido." });
			return;
		}
		const { rows } = await db.query(
			`select * from rot_mfa_challenges where id = $1 and consumed_at is null limit 1`,
			[challengeId],
		);
		const challenge = rows[0];
		if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
			res.status(400).json({ ok: false, error: "Código expirado. Faça login novamente." });
			return;
		}
		if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
			res.status(429).json({ ok: false, error: "Muitas tentativas. Faça login novamente." });
			return;
		}
		if (tokenHash(code) !== challenge.code_hash) {
			await db.query(`update rot_mfa_challenges set attempts = attempts + 1 where id = $1`, [challengeId]);
			res.status(401).json({ ok: false, error: "Código incorreto." });
			return;
		}
		await db.query(`update rot_mfa_challenges set consumed_at = now() where id = $1`, [challengeId]);
		const user = await loadUserById(challenge.user_id);
		if (!user || user.status !== "ativo") {
			res.status(401).json({ ok: false, error: "Usuário inválido ou inativo." });
			return;
		}
		await touchLastLogin(user.id, req, "local");
		sendSession(res, { token: await signSession(user), user: publicUser(user) });
	} catch (error) {
		next(error);
	}
});

// -- Config publica do login com Google: o LoginScreen consulta isso pra
// saber se mostra o botao e com qual clientId, sem precisar de env var de
// build (VITE_*) — a config e editavel em runtime pela tela de
// Integracoes (PUT /api/admin/oauth/google), mesma fonte usada no login.
router.get("/google/config", noStore, async (req, res, next) => {
	try {
		const config = await readOauthConfig("google");
		res.json({ ok: true, enabled: Boolean(config.enabled && config.clientId), clientId: config.clientId || "" });
	} catch (error) {
		next(error);
	}
});

// -- Login Google OAuth — mesmo padrao de vps/api/src/auth.js
// (loginWithGoogleIdToken): frontend usa o botao "Entrar com Google" do
// Google Identity Services, recebe um ID token, manda pra ca. Backend
// verifica a assinatura/audiencia com google-auth-library — nunca confia
// no e-mail que o frontend diz que e, so no que o Google assinou. Tambem
// passa por MFA (login social nao pula essa etapa).
router.post("/login/google", loginRateLimit, validateBody(["idToken"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const idToken = String(req.body?.idToken || "");
		if (!idToken) {
			res.status(400).json({ ok: false, error: "Token do Google ausente." });
			return;
		}

		const googleConfig = await readOauthConfig("google");
		const clientId = googleConfig.clientId || process.env.ROT_GOOGLE_OAUTH_CLIENT_ID;
		if (!googleConfig.enabled || !clientId) {
			res.status(503).json({ ok: false, error: "Login com Google não configurado." });
			return;
		}

		const client = new OAuth2Client(clientId);
		const ticket = await client.verifyIdToken({ idToken, audience: clientId });
		const payload = ticket.getPayload() || {};
		const email = String(payload.email || "").trim().toLowerCase();
		if (!email || payload.email_verified !== true) {
			res.status(401).json({ ok: false, error: "Conta Google sem e-mail verificado." });
			return;
		}

		const allowedDomains = String(googleConfig.allowedDomains || process.env.ROT_GOOGLE_OAUTH_ALLOWED_DOMAINS || "")
			.split(",")
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean);
		if (allowedDomains.length) {
			const domain = email.split("@").pop();
			if (!allowedDomains.includes(domain)) {
				res.status(403).json({ ok: false, error: "Domínio do e-mail Google não autorizado." });
				return;
			}
		}

		const user = await loadUserWithRole("lower(u.email) = lower($1)", email);
		if (!user || user.status !== "ativo") {
			console.warn("[rot-auth] google_login_denied_user_not_found", { emailDomain: email.split("@").pop() });
			res.status(401).json({
				ok: false,
				error: "Não foi possível concluir o acesso. Verifique suas permissões ou entre em contato com o responsável.",
			});
			return;
		}

		const session = await issueSessionResponse(user, req, "google");
		if (session.mfaConfigurationRequired) {
			res.status(403).json({ ok: false, ...session });
			return;
		}
		if (session.mfaRequired) {
			res.json({ ok: true, ...session });
			return;
		}
		sendSession(res, session);
	} catch (error) {
		next(error);
	}
});

router.get("/me", requireRotAuth, noStore, (req, res) => {
	res.json({ ok: true, user: req.user });
});

router.post("/logout", requireRotAuth, noStore, validateBody([]), async (req, res, next) => {
	try {
		await revokeRotSession(req);
		clearSessionCookie(res);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/change-password", requireRotAuth, validateBody(["currentPassword", "newPassword"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const currentPassword = String(req.body?.currentPassword || "");
		const newPassword = String(req.body?.newPassword || "");
		if (newPassword.length < 8) {
			res.status(400).json({ ok: false, error: "A nova senha deve ter pelo menos 8 caracteres." });
			return;
		}
		const valid = await argon2
			.verify(req.rotUser.password_hash, currentPassword)
			.catch(() => false);
		if (!valid) {
			res.status(401).json({ ok: false, error: "Senha atual incorreta." });
			return;
		}
		const passwordHash = await argon2.hash(newPassword);
		await db.query(
			`update rot_users set password_hash = $2, must_change_password = false, updated_at = now() where id = $1`,
			[req.rotUser.id, passwordHash],
		);
		if (req.rotUser.email) {
			await sendPasswordChangedEmail({ to: req.rotUser.email, name: req.rotUser.name }).catch((error) => {
				console.error("[rot-auth] falha ao notificar troca de senha:", error?.message || error);
			});
		}
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/forgot-password", passwordResetRateLimit, validateBody(["username"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const identifier = String(req.body?.username || "").trim().toLowerCase();
		// Sempre responde ok (nao revela se o usuario existe) — mesma
		// cautela padrao contra enumeracao de usuarios. Aceita e-mail OU
		// username, mesmo criterio do /login.
		const user = identifier
			? await loadUserWithRole(
					"(lower(u.username) = lower($1) or lower(u.email) = lower($1))",
					identifier,
				)
			: null;
		if (user?.email) {
			// Mesmo cooldown do MFA: evita reenviar e-mail de reset a cada
			// clique/reenvio se ja existe um link valido e recente pendente.
			const cooldownSeconds = Number(process.env.ROT_PASSWORD_RESET_RESEND_COOLDOWN_SECONDS || 60);
			const { rows: pending } = await db.query(
				`select id from rot_password_resets
				where user_id = $1 and consumed_at is null and expires_at > now()
					and created_at > now() - ($2 || ' seconds')::interval
				limit 1`,
				[user.id, cooldownSeconds],
			);
			if (!pending[0]) {
				const token = randomToken();
				await db.query(
					`insert into rot_password_resets (id, user_id, token_hash, expires_at)
					values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
					[randomId("reset"), user.id, tokenHash(token), RESET_TTL_MINUTES],
				);
				const resetUrl = `${process.env.ROT_PUBLIC_URL || "https://operacao.retiradas.tech"}/login?reset=${encodeURIComponent(token)}`;
				await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl }).catch((error) => {
					console.error("[rot-auth] falha ao enviar e-mail de reset:", error?.message || error);
				});
			}
		}
		res.json({
			ok: true,
			message: user && !user.email
				? "Este usuário não tem e-mail cadastrado. Peça para um administrador redefinir sua senha."
				: "Se o usuário existir, enviamos um link de redefinição para o e-mail cadastrado.",
		});
	} catch (error) {
		next(error);
	}
});

router.post("/reset-password", passwordResetRateLimit, validateBody(["token", "newPassword"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const token = String(req.body?.token || "");
		const newPassword = String(req.body?.newPassword || "");
		if (!token || newPassword.length < 8) {
			res.status(400).json({ ok: false, error: "Token inválido ou senha muito curta." });
			return;
		}
		const { rows } = await db.query(
			`select * from rot_password_resets
			where token_hash = $1 and consumed_at is null and expires_at > now()
			limit 1`,
			[tokenHash(token)],
		);
		const reset = rows[0];
		if (!reset) {
			res.status(400).json({ ok: false, error: "Token expirado ou já utilizado." });
			return;
		}
		const passwordHash = await argon2.hash(newPassword);
		const client = await db.connect();
		try {
			await client.query("begin");
			await client.query(
				`update rot_users set password_hash = $2, must_change_password = false, updated_at = now() where id = $1`,
				[reset.user_id, passwordHash],
			);
			await client.query(`update rot_password_resets set consumed_at = now() where id = $1`, [reset.id]);
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
		const user = await loadUserById(reset.user_id);
		if (user?.email) {
			await sendPasswordChangedEmail({ to: user.email, name: user.name }).catch((error) => {
				console.error("[rot-auth] falha ao notificar troca de senha:", error?.message || error);
			});
		}
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/avatar",
	requireRotAuth,
	avatarUpload.single("avatar"),
	async (req, res, next) => {
		try {
			if (!req.file) {
				res.status(400).json({ ok: false, error: "Nenhum arquivo enviado." });
				return;
			}
			const mime = assertUploadedImage(req.file);
			const dataUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
			await db.query(`update rot_users set avatar_url = $2, updated_at = now() where id = $1`, [
				req.rotUser.id,
				dataUrl,
			]);
			res.json({ ok: true, avatarUrl: dataUrl });
		} catch (error) {
			next(error);
		}
	},
);

// Central de notificações do usuário — o Operação ainda não tem um sistema de
// notificações internas (sininho), então em vez de simular um que não
// faz nada, esta rota mostra o que já existe de verdade: o histórico dos
// e-mails reais enviados pra essa conta (boas-vindas, código MFA, reset,
// troca de senha), mesmo padrão de fonte de dados de
// apps/finan/backend/src/compat/routes.js (GET /admin/email/logs), só
// que auto-escopado ao próprio usuário em vez de exigir permissão admin.
router.get("/notifications", requireRotAuth, noStore, async (req, res, next) => {
	try {
		if (!req.rotUser.email) {
			res.json({ ok: true, items: [] });
			return;
		}
		const { rows } = await db.query(
			`select id, type, subject, status, created_at
			from rot_email_logs
			where to_email = $1
			order by created_at desc
			limit 30`,
			[req.rotUser.email],
		);
		res.json({ ok: true, items: rows });
	} catch (error) {
		next(error);
	}
});

// Preferência de MFA por e-mail — auto-serviço (o próprio usuário liga/
// desliga o código de segurança no login). Desativar exige a senha atual
// pra não virar um jeito de outra pessoa com a sessão aberta enfraquecer
// a conta sem confirmar quem é.
router.put("/mfa-preference", requireRotAuth, validateBody(["enabled", "currentPassword"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const enabled = Boolean(req.body?.enabled);
		if (!enabled) {
			const currentPassword = String(req.body?.currentPassword || "");
			const valid = await argon2.verify(req.rotUser.password_hash, currentPassword).catch(() => false);
			if (!valid) {
				res.status(401).json({ ok: false, error: "Confirme sua senha atual para desativar o MFA." });
				return;
			}
		}
		await db.query(`update rot_users set mfa_enabled = $2, updated_at = now() where id = $1`, [
			req.rotUser.id,
			enabled,
		]);
		res.json({ ok: true, mfaEnabled: enabled });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
module.exports.findUserByBearer = findUserByBearer;
module.exports.requireRotPermission = requireRotPermission;
