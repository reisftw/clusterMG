const crypto = require("node:crypto");
const db = require("../db");

// SEC-004: sessao do Finan passa a viajar em cookie HttpOnly, igual ao
// padrao ja usado e revisado em apps/operacao/backend/src/auth/middleware.js.
// SameSite=Strict (em vez de um token CSRF separado) e suficiente aqui
// porque o cookie so e enviado em requisicoes de mesmo site — o mesmo
// raciocinio usado no cookie "operacao_session" do Operacao.
const SESSION_COOKIE_NAME = "finan_session";
const SESSION_TTL_DAYS = Number(process.env.FINAN_SESSION_TTL_DAYS || 7);
const ALLOW_LEGACY_BEARER = String(process.env.FINAN_ALLOW_LEGACY_BEARER || "true").toLowerCase() !== "false";

function tokenHash(token) {
	return crypto.createHash("sha256").update(token).digest("hex");
}

function getCookieValue(req, name) {
	const cookieHeader = req.get?.("cookie") || req.headers?.cookie || "";
	const prefix = `${name}=`;
	const cookie = String(cookieHeader || "")
		.split(";")
		.map((item) => item.trim())
		.find((item) => item.startsWith(prefix));
	if (!cookie) return "";
	try {
		return decodeURIComponent(cookie.slice(prefix.length));
	} catch {
		return cookie.slice(prefix.length);
	}
}

// Cookie e a fonte de verdade; Authorization Bearer continua aceito como
// fallback (ALLOW_LEGACY_BEARER, default true) para não deslogar de
// imediato quem ainda tinha o token antigo em localStorage de antes desta
// correção, e para integrações não-browser. Pode ser desligado depois de
// um período de transição sem sessões antigas em uso.
function getRequestToken(req) {
	const cookieToken = getCookieValue(req, SESSION_COOKIE_NAME);
	if (cookieToken) return cookieToken;
	if (!ALLOW_LEGACY_BEARER) return "";
	const raw = String(req.headers.authorization || "");
	return raw.startsWith("Bearer ") ? raw.slice(7) : "";
}

function setFinanSessionCookie(res, token) {
	res.cookie(SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/",
		maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
	});
}

function clearFinanSessionCookie(res) {
	res.clearCookie(SESSION_COOKIE_NAME, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/",
	});
}

function publicUser(user) {
	const permissions = normalizePublicPermissions(user);
	return {
		id: user.id,
		uid: user.id,
		name: user.name,
		email: user.email,
		avatarUrl: user.avatar_url || user.source_profile?.avatarUrl || "",
		role: user.role_id,
		permissions,
		isAdmin: Boolean(user.is_admin),
	};
}

function normalizePublicPermissions(user) {
	const source = Array.isArray(user?.permissions) ? user.permissions : [];
	const permissions = new Set(source);
	for (const permission of source) {
		const mapped = mapFinanToFinanceiroPermission(permission);
		if (mapped) permissions.add(mapped);
	}
	if (user?.is_admin) {
		permissions.add("*");
		permissions.add("financeiro.visao_geral.view");
		permissions.add("financeiro.visao_geral.manage");
		permissions.add("financeiro.gestao_orcamento.view");
		permissions.add("financeiro.gestao_orcamento.manage");
		permissions.add("relatorios_financeiros:visualizar");
		permissions.add("relatorios_financeiros:gerenciar");
		permissions.add("financeiro.reports.view");
		permissions.add("financeiro.reports.manage");
		permissions.add("financeiro.equipe.view");
		permissions.add("financeiro.equipe.manage");
		permissions.add("financeiro.configuracoes.manage");
	}
	return Array.from(permissions);
}

function mapFinanToFinanceiroPermission(permission) {
	const value = String(permission || "");
	if (value === "finan.dashboard.view") return "financeiro.visao_geral.view";
	if (value === "finan.gestao_orcamentaria.view") {
		return "financeiro.gestao_orcamento.view";
	}
	if (value === "finan.gestao_orcamentaria.manage") {
		return "financeiro.gestao_orcamento.manage";
	}
	if (value.startsWith("finan.")) return value.replace(/^finan\./, "financeiro.");
	return "";
}

function mapFinanceiroToFinanPermission(permission) {
	const value = String(permission || "");
	if (value === "financeiro.visao_geral.view") return "finan.dashboard.view";
	if (value === "financeiro.visao_geral.manage") return "finan.dashboard.view";
	if (value.startsWith("financeiro.gestao_orcamento.")) {
		return value.replace(/^financeiro\.gestao_orcamento\./, "finan.gestao_orcamentaria.");
	}
	if (value.startsWith("financeiro.")) return value.replace(/^financeiro\./, "finan.");
	return "";
}

function userHasFinanPermission(user, permission) {
	const required = String(permission || "");
	if (!required) return true;
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	if (user?.is_admin || permissions.includes("*")) return true;
	if (permissions.includes(required)) return true;
	const financeiroPermission = mapFinanToFinanceiroPermission(required);
	if (financeiroPermission && permissions.includes(financeiroPermission)) return true;
	const finanPermission = mapFinanceiroToFinanPermission(required);
	if (finanPermission && permissions.includes(finanPermission)) return true;
	return false;
}

async function findUserByBearer(req) {
	const token = getRequestToken(req);
	if (!token) return null;
	const { rows } = await db.query(
		`select
			u.*,
			coalesce(r.permissions, '[]'::jsonb) as permissions,
			coalesce(r.is_admin, false) as is_admin,
			coalesce(r.hierarchy_level, 999) as hierarchy_level
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

async function requireFinanAuth(req, res, next) {
	try {
		const user = await findUserByBearer(req);
		if (!user) {
			res
				.status(401)
				.json({ ok: false, error: "Sessão do Finan não autenticada." });
			return;
		}
		req.finanUser = user;
		req.user = publicUser(user);
		next();
	} catch (error) {
		next(error);
	}
}

function requireFinanPermission(permission) {
	const required = Array.isArray(permission) ? permission : [permission];
	return (req, res, next) => {
		if (required.some((item) => userHasFinanPermission(req.finanUser, item))) {
			next();
			return;
		}
		res.status(403).json({
			ok: false,
			error: "Você não tem permissão para acessar esta área do Finan.",
		});
	};
}

module.exports = {
	clearFinanSessionCookie,
	findUserByBearer,
	getRequestToken,
	publicUser,
	requireFinanAuth,
	requireFinanPermission,
	setFinanSessionCookie,
	SESSION_COOKIE_NAME,
	tokenHash,
	userHasFinanPermission,
};
