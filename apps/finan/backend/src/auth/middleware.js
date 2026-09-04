const crypto = require("node:crypto");
const db = require("../db");

function tokenHash(token) {
	return crypto.createHash("sha256").update(token).digest("hex");
}

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
	return (req, res, next) => {
		const permissions = Array.isArray(req.finanUser?.permissions)
			? req.finanUser.permissions
			: [];
		if (req.finanUser?.is_admin || permissions.includes(permission)) {
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
	findUserByBearer,
	publicUser,
	requireFinanAuth,
	requireFinanPermission,
	tokenHash,
};
