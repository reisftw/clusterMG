const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const db = require("../db");

// Diferente do Finan (token opaco + finan_sessions), o Operação usa JWT real
// (HS256) por pedido explicito — decisao registrada no plano de migracao.
// Trade-off aceito: um JWT nao pode ser revogado antes de expirar sem uma
// blocklist. Mitigado com TTL curto + sempre buscar o usuario fresco no
// banco a cada requisicao (abaixo) — um usuario desativado/excluido perde
// acesso na proxima chamada, mesmo com o token ainda "valido" pela
// assinatura. So a credencial e stateless; a autorizacao nunca e. Tecnicos
// usam o PWA em campo e podem ficar dias alternando sinal/offline, entao a
// sessao precisa cobrir uma semana operacional inteira.
const JWT_SECRET = process.env.ROT_JWT_SECRET;
const JWT_TTL = process.env.ROT_JWT_TTL || "7d";
const JWT_ISSUER = process.env.ROT_JWT_ISSUER || "operacao";
const JWT_AUDIENCE = process.env.ROT_JWT_AUDIENCE || "operacao-web";
const ALLOW_LEGACY_BEARER = String(process.env.ROT_ALLOW_LEGACY_BEARER || "false").toLowerCase() === "true";
const ALLOW_LEGACY_JWT = String(process.env.ROT_ALLOW_LEGACY_JWT || "true").toLowerCase() !== "false";
const SESSION_COOKIE_NAME = "operacao_session";

if (!JWT_SECRET && process.env.NODE_ENV !== "test") {
	// Falha alto e cedo — nunca assinar token com segredo vazio/undefined.
	throw new Error(
		"ROT_JWT_SECRET não configurado. Defina no .env antes de iniciar o backend da Operação.",
	);
}

async function signSession(user) {
	const jti = crypto.randomUUID();
	const token = jwt.sign({ sub: user.id, jti }, JWT_SECRET, {
		expiresIn: JWT_TTL,
		issuer: JWT_ISSUER,
		audience: JWT_AUDIENCE,
	});
	const decoded = jwt.decode(token) || {};
	const expiresAt = decoded.exp
		? new Date(Number(decoded.exp) * 1000)
		: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	await db.query(
		`insert into rot_sessions (id, user_id, expires_at)
		values ($1, $2, $3)`,
		[jti, user.id, expiresAt.toISOString()],
	);
	await db.query(
		`delete from rot_sessions
		where expires_at < now() - interval '7 days'
			or revoked_at < now() - interval '7 days'`,
	).catch(() => null);
	return token;
}

function verifyToken(token) {
	try {
		return jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
	} catch (error) {
		if (!ALLOW_LEGACY_JWT || !["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error?.name)) {
			return null;
		}
		try {
			const decoded = jwt.verify(token, JWT_SECRET);
			return decoded?.iss || decoded?.aud ? null : decoded;
		} catch {
			return null;
		}
	}
}

function publicUser(user) {
	return {
		id: user.id,
		name: user.name,
		username: user.username,
		email: user.email,
		avatarUrl: user.avatar_url || "",
		role: user.role_id,
		roleName: user.role_name,
		roleLevel: Number(user.role_level ?? 0),
		isGlobal: Boolean(user.is_global),
		regionalId: user.regional_id,
		regionalIds: getUserRegionalIds(user),
		cityId: user.city_id,
		permissions: Array.isArray(user.permissions) ? user.permissions : [],
		operationScopes: Array.isArray(user.operation_scopes) ? user.operation_scopes : ["ROT"],
		isAdmin: user.role_id === "site_admin",
		mfaEnabled: user.mfa_enabled !== false,
	};
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

function getRequestToken(req) {
	const raw = String(req.headers.authorization || "");
	if (ALLOW_LEGACY_BEARER && raw.startsWith("Bearer ")) return raw.slice(7);
	return getCookieValue(req, SESSION_COOKIE_NAME);
}

function userHasRotPermission(user, permission) {
	if (!user) return false;
	if (Array.isArray(permission)) return permission.some((item) => userHasRotPermission(user, item));
	const required = String(permission || "");
	if (!required) return true;
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	if (user?.role_id === "site_admin" || permissions.includes("*")) return true;
	return permissions.includes(required);
}

async function findUserByBearer(req) {
	const token = getRequestToken(req);
	if (!token) return null;
	const decoded = verifyToken(token);
	if (!decoded?.sub || !decoded?.jti) return null;

	const session = await db.query(
		`select id from rot_sessions
		where id = $1
			and user_id = $2
			and revoked_at is null
			and expires_at > now()
		limit 1`,
		[decoded.jti, decoded.sub],
	);
	if (!session.rows[0]) return null;

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
			) as operation_scopes,
			(
				select coalesce(array_agg(distinct ure.regional_id), array[]::text[])
				from rot_user_regionais_extras ure
				where ure.user_id = u.id
			) as extra_regional_ids
		from rot_users u
		join rot_roles r on r.id = u.role_id
		where u.id = $1
			and u.status = 'ativo'
			and r.active = true
		limit 1`,
		[decoded.sub],
	);
	return rows[0] || null;
}

async function revokeRotSession(req) {
	const token = getRequestToken(req);
	const decoded = token ? verifyToken(token) : null;
	if (!decoded?.jti || !decoded?.sub) return false;
	await db.query(
		`update rot_sessions
		set revoked_at = now()
		where id = $1
			and user_id = $2
			and revoked_at is null`,
		[decoded.jti, decoded.sub],
	);
	return true;
}

async function requireRotAuth(req, res, next) {
	try {
		const user = await findUserByBearer(req);
		if (!user) {
			res.status(401).json({ ok: false, error: "Sessão da Operação não autenticada." });
			return;
		}
		req.rotUser = user;
		req.user = publicUser(user);
		next();
	} catch (error) {
		next(error);
	}
}

function requireRotPermission(permission) {
	const required = Array.isArray(permission) ? permission : [permission];
	return (req, res, next) => {
		if (required.some((item) => userHasRotPermission(req.rotUser, item))) {
			next();
			return;
		}
		res.status(403).json({
			ok: false,
			error: "Você não tem permissão para acessar esta área da Operação.",
		});
	};
}

// Escopo regional: cargo "global" (is_global=true) enxerga tudo; cargo
// regional so enxerga a propria regional. Espelha shouldFilterByRegional
// do usePermissions.js atual, agora garantido no backend (o frontend
// atual so escondia visualmente — nada impedia uma chamada direta a API
// de ver dado de outra regional).
// Regional principal (user.regional_id) + regionais extras
// (rot_user_regionais_extras) — usado onde um supervisor/lider pode
// responder por mais de uma regional (hoje: lancamento de plantao).
// Nao mexe em scopeRegionalFilter (abaixo), que continua single-value
// e e usado em todo o resto do sistema.
function getUserRegionalIds(user) {
	if (!user) return [];
	const ids = new Set(Array.isArray(user.extra_regional_ids) ? user.extra_regional_ids : []);
	if (user.regional_id) ids.add(user.regional_id);
	return [...ids];
}

function scopeRegionalFilter(req) {
	const user = req.rotUser;
	if (!user || user.is_global) return null;
	return user.regional_id || "__none__";
}

// Guard reutilizavel para rotas de recurso unico (:id) que precisam
// garantir que o recurso pertence a regional do usuario autenticado antes
// de deixar o controller ler/editar/excluir (SEC-002). scopeRegionalFilter
// acima cobre listas (WHERE regional_id = $1); este guard cobre
// GET/PUT/PATCH/DELETE por :id, onde confiar cegamente no :id da URL
// permite IDOR entre regionais — o padrao encontrado em companies e
// technicians, que nao tinham nenhuma checagem de posse do recurso.
//
// getResourceRegionalIds(req) deve resolver para:
//   - null/undefined -> recurso nao encontrado (responde 404)
//   - array de regional_id que o recurso pertence (uma ou mais regionais,
//     cobre tanto coluna direta quanto relacao N:N)
// Usuario global (is_global) sempre passa. Usuario regional so passa se a
// propria regional estiver entre as regionais do recurso.
function requireRegionalOwnership(
	getResourceRegionalIds,
	{
		notFoundMessage = "Recurso não encontrado.",
		forbiddenMessage = "Você não tem acesso a este recurso de outra regional.",
	} = {},
) {
	return async (req, res, next) => {
		try {
			const regionalIds = await getResourceRegionalIds(req);
			if (regionalIds === null || regionalIds === undefined) {
				res.status(404).json({ ok: false, error: notFoundMessage });
				return;
			}
			const user = req.rotUser;
			if (user?.is_global) {
				next();
				return;
			}
			const scope = user?.regional_id;
			const owned = (Array.isArray(regionalIds) ? regionalIds : [regionalIds]).filter(Boolean);
			if (scope && owned.includes(scope)) {
				next();
				return;
			}
			res.status(403).json({ ok: false, error: forbiddenMessage });
		} catch (error) {
			next(error);
		}
	};
}

module.exports = {
	findUserByBearer,
	getUserRegionalIds,
	publicUser,
	requireRegionalOwnership,
	requireRotAuth,
	requireRotPermission,
	revokeRotSession,
	scopeRegionalFilter,
	signSession,
	SESSION_COOKIE_NAME,
	userHasRotPermission,
	verifyToken,
	JWT_AUDIENCE,
	JWT_ISSUER,
};
