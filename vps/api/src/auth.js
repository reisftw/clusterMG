const crypto = require("node:crypto");
const argon2 = require("argon2");
const { OAuth2Client } = require("google-auth-library");
const db = require("./db");
const normalizedDualWrite = require("./normalizedDualWrite");
const rolePermissions = require("./rolePermissions");

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;
const TOKEN_TTL_SECONDS = Number(
	process.env.ACCESS_TOKEN_TTL_SECONDS || DEFAULT_TOKEN_TTL_SECONDS,
);
const PASSWORD_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const LEGACY_PASSWORD_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_ALGORITHM = "argon2id";
const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = process.env.APP_AUTH_ISSUER || "retiradas-api";
const JWT_AUDIENCE = process.env.APP_AUTH_AUDIENCE || "retiradas-web";
const DEFAULT_KEY_ID = "current";
const PASSWORD_RESET_TTL_MINUTES = Number(
	process.env.PASSWORD_RESET_TTL_MINUTES || 30,
);
const EMAIL_MFA_MAX_ATTEMPTS = Number(process.env.EMAIL_MFA_MAX_ATTEMPTS || 5);
const GOOGLE_OAUTH_CONFIG_PATH = "config/google_oauth";
const OKTA_OAUTH_CONFIG_PATH = "config/okta_oauth";
const GOOGLE_OAUTH_DEFAULT_AUTO_ROLE = "visitante";
const OKTA_OAUTH_DEFAULT_AUTO_ROLE = "visitante";
const oktaJwksCache = new Map();
const AUTH_REQUEST_CACHE_TTL_MS = Math.max(
	Number(process.env.AUTH_REQUEST_CACHE_TTL_MS || 2000),
	0,
);
const authRequestCache = new Map();

const FULL_OPERATION_ROLES = ["admin", "backoffice_retirada", "supervisor"];
const DASHBOARD_ROLES = [
	...FULL_OPERATION_ROLES,
	"lider_empresa",
	"backoffice",
	GOOGLE_OAUTH_DEFAULT_AUTO_ROLE,
];

const SNAPSHOT_READ_ROLES = Object.freeze({
	dashboard: new Set(DASHBOARD_ROLES),
	rh: new Set(FULL_OPERATION_ROLES),
	operacional: new Set(FULL_OPERATION_ROLES),
	financeiro: new Set(FULL_OPERATION_ROLES),
});

function getAuthSecret() {
	const secret = process.env.APP_AUTH_SECRET;
	if (!secret || secret.length < 24) {
		throw new Error("APP_AUTH_SECRET precisa ter ao menos 24 caracteres.");
	}
	return secret;
}

function getCurrentKeyId() {
	return (
		String(process.env.APP_AUTH_SECRET_ID || DEFAULT_KEY_ID).trim() ||
		DEFAULT_KEY_ID
	);
}

function getAuthSecrets() {
	const secrets = new Map([[getCurrentKeyId(), getAuthSecret()]]);
	String(process.env.APP_AUTH_PREVIOUS_SECRETS || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.forEach((entry) => {
			const [kid, ...secretParts] = entry.split(":");
			const secret = secretParts.join(":");
			if (kid && secret && secret.length >= 24) {
				secrets.set(kid, secret);
			}
		});
	return secrets;
}

function getSecretForKeyId(keyId) {
	const secrets = getAuthSecrets();
	const kid = String(keyId || getCurrentKeyId()).trim() || getCurrentKeyId();
	const secret = secrets.get(kid);
	if (!secret) throw new Error("Chave JWT desconhecida.");
	return secret;
}

function normalizeRole(role) {
	return String(role || "")
		.trim()
		.toLowerCase();
}

function normalizeEmail(email) {
	return String(email || "")
		.trim()
		.toLowerCase();
}

function parseBoolean(value, fallback = false) {
	if (value === undefined || value === null || value === "") return fallback;
	return ["1", "true", "yes", "sim", "on"].includes(
		String(value).trim().toLowerCase(),
	);
}

function base64url(input) {
	return Buffer.from(input)
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function base64urlJson(value) {
	return base64url(JSON.stringify(value));
}

function decodeBase64url(value) {
	const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
	return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function timingSafeEqualText(left, right) {
	const leftBuffer = Buffer.from(String(left || ""));
	const rightBuffer = Buffer.from(String(right || ""));
	if (leftBuffer.length !== rightBuffer.length) return false;
	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashLegacyPassword(
	password,
	salt = crypto.randomBytes(16).toString("hex"),
) {
	const hash = crypto
		.pbkdf2Sync(
			String(password || ""),
			salt,
			PASSWORD_ITERATIONS,
			PASSWORD_KEY_LENGTH,
			PASSWORD_DIGEST,
		)
		.toString("hex");

	return {
		passwordHash: hash,
		passwordSalt: salt,
		passwordAlgorithm: LEGACY_PASSWORD_ALGORITHM,
	};
}

async function hashPassword(password) {
	const passwordHash = await argon2.hash(String(password || ""), {
		type: argon2.argon2id,
		memoryCost: Number(process.env.ARGON2_MEMORY_COST || 19456),
		timeCost: Number(process.env.ARGON2_TIME_COST || 2),
		parallelism: Number(process.env.ARGON2_PARALLELISM || 1),
	});

	return {
		passwordHash,
		passwordSalt: "",
		passwordAlgorithm: PASSWORD_ALGORITHM,
	};
}

async function verifyPassword(password, user) {
	if (!user?.password_hash) return false;
	if (
		user.password_algorithm === LEGACY_PASSWORD_ALGORITHM ||
		!user.password_algorithm
	) {
		if (!user.password_salt) return false;
		const next = hashLegacyPassword(password, user.password_salt);
		return timingSafeEqualText(next.passwordHash, user.password_hash);
	}
	if (user.password_algorithm === PASSWORD_ALGORITHM) {
		return argon2.verify(user.password_hash, String(password || ""));
	}
	return false;
}

function signToken(payload) {
	const header = { alg: JWT_ALGORITHM, kid: getCurrentKeyId(), typ: "JWT" };
	const issuedAt = Math.floor(Date.now() / 1000);
	const body = {
		...payload,
		iss: JWT_ISSUER,
		aud: JWT_AUDIENCE,
		iat: issuedAt,
		exp: issuedAt + TOKEN_TTL_SECONDS,
	};
	const unsigned = `${base64urlJson(header)}.${base64urlJson(body)}`;
	const signature = crypto
		.createHmac("sha256", getSecretForKeyId(header.kid))
		.update(unsigned)
		.digest("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
	return `${unsigned}.${signature}`;
}

function verifyToken(token) {
	const parts = String(token || "").split(".");
	if (parts.length !== 3) throw new Error("Token invalido.");

	const [header, body, signature] = parts;
	const decodedHeader = JSON.parse(decodeBase64url(header).toString("utf8"));
	if (decodedHeader.alg !== JWT_ALGORITHM || decodedHeader.typ !== "JWT") {
		throw new Error("Header JWT invalido.");
	}

	const expected = crypto
		.createHmac("sha256", getSecretForKeyId(decodedHeader.kid))
		.update(`${header}.${body}`)
		.digest("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");

	if (!timingSafeEqualText(signature, expected)) {
		throw new Error("Assinatura invalida.");
	}

	const payload = JSON.parse(decodeBase64url(body).toString("utf8"));
	if (
		!payload?.uid ||
		!payload?.exp ||
		payload.exp < Math.floor(Date.now() / 1000)
	) {
		throw new Error("Token expirado.");
	}
	if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) {
		throw new Error("Claims JWT invalidas.");
	}
	return payload;
}

function getCookieValue(req, name) {
	const cookieHeader = req.get("cookie") || "";
	const prefix = `${name}=`;
	const cookie = cookieHeader
		.split(";")
		.map((item) => item.trim())
		.find((item) => item.startsWith(prefix));
	if (!cookie) return "";
	return decodeURIComponent(cookie.slice(prefix.length));
}

function getBearerToken(req) {
	const header = req.get("authorization") || "";
	if (header.toLowerCase().startsWith("bearer ")) {
		return header.slice("bearer ".length).trim();
	}
	return getCookieValue(req, "retiradas_session");
}

function getRequestAuthToken(req) {
	return getBearerToken(req);
}

function createCsrfToken(authToken) {
	if (!authToken) return "";
	const [header] = String(authToken || "").split(".");
	const decodedHeader = header
		? JSON.parse(decodeBase64url(header).toString("utf8"))
		: {};
	return crypto
		.createHmac("sha256", getSecretForKeyId(decodedHeader.kid))
		.update(`csrf:${authToken}`)
		.digest("base64url");
}

function verifyCsrfToken(req) {
	try {
		const token = req.authToken || getRequestAuthToken(req);
		const provided = String(req.get("x-csrf-token") || "");
		const expected = createCsrfToken(token);
		return Boolean(
			provided && expected && timingSafeEqualText(provided, expected),
		);
	} catch {
		return false;
	}
}

async function getImportedUserProfile(uid) {
	const result = await db.query(
		`select path, document_id as "id", data
       from app_documents
      where path = $1`,
		[`usuarios/${uid}`],
	);

	const item = result.rows[0] || null;
	if (!item) return null;

	return rolePermissions.enrichUserWithPermissions({
		id: item.id,
		...item.data,
		role: normalizeRole(item.data?.role),
	});
}

async function getLocalUserByEmail(email) {
	const result = await db.query(
		`select uid, email, display_name, role, regional, password_hash, password_salt,
            password_algorithm, session_version, disabled, must_change_password,
            last_login_at, last_login_ip, last_login_user_agent
       from app_users
      where lower(trim(email)) = lower(trim($1))`,
		[normalizeEmail(email)],
	);
	return result.rows[0] || null;
}

async function getGoogleOAuthConfig() {
	const result = await db.query(
		`select data
       from app_documents
      where path = $1`,
		[GOOGLE_OAUTH_CONFIG_PATH],
	);
	const stored = result.rows[0]?.data || {};
	const clientId = String(
		stored.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || "",
	).trim();
	return {
		enabled: parseBoolean(
			stored.enabled,
			parseBoolean(process.env.GOOGLE_OAUTH_ENABLED, false),
		),
		clientId,
		autoProvision: parseBoolean(
			stored.autoProvision,
			parseBoolean(process.env.GOOGLE_OAUTH_AUTO_PROVISION, false),
		),
		defaultRole: GOOGLE_OAUTH_DEFAULT_AUTO_ROLE,
		allowedDomains: String(
			stored.allowedDomains || process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS || "",
		)
			.split(",")
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean),
	};
}

function normalizeIssuerUrl(value) {
	return String(value || "")
		.trim()
		.replace(/\/+$/, "");
}

function getOktaJwksUrl(issuer) {
	const normalizedIssuer = normalizeIssuerUrl(issuer);
	return normalizedIssuer ? `${normalizedIssuer}/v1/keys` : "";
}

async function getOktaOAuthConfig() {
	const result = await db.query(
		`select data
       from app_documents
      where path = $1`,
		[OKTA_OAUTH_CONFIG_PATH],
	);
	const stored = result.rows[0]?.data || {};
	const issuer = normalizeIssuerUrl(
		stored.issuer || process.env.OKTA_OAUTH_ISSUER,
	);
	const clientId = String(
		stored.clientId || process.env.OKTA_OAUTH_CLIENT_ID || "",
	).trim();
	return {
		enabled: parseBoolean(
			stored.enabled,
			parseBoolean(process.env.OKTA_OAUTH_ENABLED, false),
		),
		issuer,
		clientId,
		redirectUri: String(
			stored.redirectUri || process.env.OKTA_OAUTH_REDIRECT_URI || "",
		).trim(),
		autoProvision: parseBoolean(
			stored.autoProvision,
			parseBoolean(process.env.OKTA_OAUTH_AUTO_PROVISION, false),
		),
		defaultRole: OKTA_OAUTH_DEFAULT_AUTO_ROLE,
		allowedDomains: String(
			stored.allowedDomains || process.env.OKTA_OAUTH_ALLOWED_DOMAINS || "",
		)
			.split(",")
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean),
	};
}

async function getLocalUserByUid(uid) {
	const result = await db.query(
		`select uid, email, display_name, role, regional, session_version, disabled, must_change_password,
            last_login_at, last_login_ip, last_login_user_agent
       from app_users
      where uid = $1`,
		[uid],
	);
	return result.rows[0] || null;
}

async function revokeSession(jti) {
	if (!jti) return;
	await db.query(
		`update app_sessions
        set revoked_at = now()
      where jti = $1
        and revoked_at is null`,
		[jti],
	);
}

async function revokeUserSessions(uid, { exceptJti = "" } = {}) {
	await db.query(
		`update app_sessions
        set revoked_at = now()
      where uid = $1
        and revoked_at is null
        and ($2::text = '' or jti <> $2)`,
		[uid, String(exceptJti || "")],
	);
}

async function createSession({ uid, email, role, sessionVersion }) {
	const jti = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
	const token = signToken({
		jti,
		uid,
		email,
		role,
		sv: Number(sessionVersion || 1),
	});

	await db.query(
		`insert into app_sessions (jti, uid, expires_at)
     values ($1, $2, $3)`,
		[jti, uid, expiresAt.toISOString()],
	);
	await db.query(
		`delete from app_sessions
      where expires_at < now() - interval '7 days'
         or revoked_at < now() - interval '7 days'`,
	);

	return token;
}

async function renewSessionFromPayload(payload) {
	if (!payload?.uid || !payload?.jti)
		throw new Error("Sessao invalida para renovacao.");
	const user = await getLocalUserByUid(payload.uid);
	if (!user || user.disabled) throw new Error("Usuario nao encontrado.");
	const token = await createSession({
		uid: user.uid,
		email: user.email,
		role: normalizeRole(payload.role || user.role),
		sessionVersion: user.session_version,
	});
	return token;
}

async function requireActiveSession(payload) {
	if (!payload?.jti) throw new Error("Sessao sem identificador.");
	const result = await db.query(
		`select jti
       from app_sessions
      where jti = $1
        and uid = $2
        and revoked_at is null
        and expires_at > now()`,
		[payload.jti, payload.uid],
	);
	if (!result.rows[0]) throw new Error("Sessao revogada ou expirada.");
}

function authCacheKey(payload = {}) {
	return `${payload.jti || ""}:${payload.uid || ""}:${payload.sv || ""}`;
}

function getCachedAuthenticatedUser(payload = {}) {
	if (!AUTH_REQUEST_CACHE_TTL_MS) return null;
	const key = authCacheKey(payload);
	const cached = authRequestCache.get(key);
	if (!cached) return null;
	if (Date.now() - cached.createdAt > AUTH_REQUEST_CACHE_TTL_MS) {
		authRequestCache.delete(key);
		return null;
	}
	return cached.user;
}

function setCachedAuthenticatedUser(payload = {}, user) {
	if (!AUTH_REQUEST_CACHE_TTL_MS || !payload?.jti || !payload?.uid || !user)
		return;
	authRequestCache.set(authCacheKey(payload), { createdAt: Date.now(), user });
	if (authRequestCache.size > 1000) {
		const expiredAt = Date.now() - AUTH_REQUEST_CACHE_TTL_MS;
		for (const [key, value] of authRequestCache.entries()) {
			if (value.createdAt < expiredAt || authRequestCache.size > 1000)
				authRequestCache.delete(key);
			if (authRequestCache.size <= 1000) break;
		}
	}
}

async function upgradePasswordHashIfNeeded(user, password) {
	if (user.password_algorithm === PASSWORD_ALGORITHM) return;
	const passwordData = await hashPassword(password);
	await db.query(
		`update app_users
        set password_hash = $2,
            password_salt = $3,
            password_algorithm = $4
      where uid = $1`,
		[
			user.uid,
			passwordData.passwordHash,
			passwordData.passwordSalt,
			passwordData.passwordAlgorithm,
		],
	);
}

async function syncProfileDocument(user, extra = {}) {
	const current = await getImportedUserProfile(user.uid).catch(() => null);
	const data = {
		...(current || {}),
		nome: user.display_name || current?.nome || "",
		email: user.email,
		role: normalizeRole(user.role || current?.role),
		regional: user.regional || current?.regional || "",
		trocar_senha: Boolean(
			extra.mustChangePassword ?? user.must_change_password,
		),
		ultimo_login:
			extra.lastLoginAt || user.last_login_at || current?.ultimo_login || null,
		ultimo_login_ip:
			extra.lastLoginIp || user.last_login_ip || current?.ultimo_login_ip || "",
		ultimo_login_navegador:
			extra.lastLoginUserAgent ||
			user.last_login_user_agent ||
			current?.ultimo_login_navegador ||
			"",
		login_provider: extra.loginProvider || current?.login_provider || "local",
		criado_por_oauth: Boolean(
			extra.oauthAutoProvisioned ?? current?.criado_por_oauth,
		),
		status_oauth: extra.oauthStatus || current?.status_oauth || "",
		atualizado_em: new Date().toISOString(),
	};

	if (!current?.criado_em) data.criado_em = new Date().toISOString();

	await db.query(
		`insert into app_documents (path, collection_path, document_id, parent_path, data)
     values ($1, 'usuarios', $2, null, $3::jsonb)
     on conflict (path) do update set data = excluded.data`,
		[`usuarios/${user.uid}`, user.uid, JSON.stringify(data)],
	);
	await normalizedDualWrite.upsert({
		path: `usuarios/${user.uid}`,
		collectionPath: "usuarios",
		documentId: user.uid,
		parentPath: null,
		data,
	});

	return { id: user.uid, ...data };
}

function makeTemporaryPassword() {
	return `Retira@${crypto.randomBytes(5).toString("hex")}`;
}

function createOpaqueToken() {
	return crypto.randomBytes(32).toString("base64url");
}

function hashOpaqueToken(token) {
	return crypto
		.createHash("sha256")
		.update(String(token || ""))
		.digest("hex");
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

function buildPasswordResetUrl(token) {
	const appUrl = String(
		process.env.PUBLIC_APP_URL || "https://retiradas.tech",
	).replace(/\/+$/, "");
	return `${appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

async function createPasswordResetToken(
	uid,
	{ purpose = "password_reset", req = null } = {},
) {
	const user = await getLocalUserByUid(uid);
	if (!user || user.disabled) throw new Error("Usuario nao encontrado.");
	const token = createOpaqueToken();
	const tokenHash = hashOpaqueToken(token);
	const expiresAt = new Date(
		Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
	).toISOString();
	await db.query(
		`insert into password_reset_tokens (uid, token_hash, purpose, expires_at, requested_ip, user_agent)
     values ($1, $2, $3, $4, $5, $6)`,
		[
			uid,
			tokenHash,
			purpose,
			expiresAt,
			req?.ip || "",
			req?.get?.("user-agent") || "",
		],
	);
	return {
		token,
		tokenHash,
		expiresAt,
		resetUrl: buildPasswordResetUrl(token),
		user,
	};
}

async function createPasswordResetTokenByEmail(
	email,
	{ purpose = "password_reset", req = null } = {},
) {
	const user = await getLocalUserByEmail(email);
	if (!user || user.disabled) return null;
	return createPasswordResetToken(user.uid, { purpose, req });
}

async function resetPasswordWithToken(token, nextPassword) {
	if (String(nextPassword || "").length < 8)
		throw new Error("A nova senha deve ter ao menos 8 caracteres.");
	const tokenHash = hashOpaqueToken(token);
	const result = await db.query(
		`select prt.id, prt.uid, au.email, au.display_name, au.role, au.regional
       from password_reset_tokens prt
       join app_users au on au.uid = prt.uid
      where prt.token_hash = $1
        and prt.used_at is null
        and prt.expires_at > now()
        and au.disabled = false
      limit 1`,
		[tokenHash],
	);
	const row = result.rows[0] || null;
	if (!row) throw new Error("Token invalido ou expirado.");

	const passwordData = await hashPassword(nextPassword);
	await db.query("begin");
	try {
		await db.query(
			`update app_users
          set password_hash = $2,
              password_salt = $3,
              password_algorithm = $4,
              must_change_password = false,
              session_version = session_version + 1
        where uid = $1`,
			[
				row.uid,
				passwordData.passwordHash,
				passwordData.passwordSalt,
				passwordData.passwordAlgorithm,
			],
		);
		await db.query(
			"update password_reset_tokens set used_at = now() where id = $1",
			[row.id],
		);
		await db.query(
			`update app_sessions
          set revoked_at = now()
        where uid = $1
          and revoked_at is null`,
			[row.uid],
		);
		await db.query("commit");
	} catch (error) {
		await db.query("rollback");
		throw error;
	}

	const user = await getLocalUserByUid(row.uid);
	await syncProfileDocument(user, { mustChangePassword: false });
	return user;
}

async function createLocalUser({
	email,
	nome,
	role,
	regional,
	password,
	mustChangePassword = true,
}) {
	const uid = crypto.randomUUID();
	const passwordData = await hashPassword(password || makeTemporaryPassword());
	const result = await db.query(
		`insert into app_users (
       uid, email, display_name, role, regional, password_hash, password_salt,
       password_algorithm, must_change_password
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning uid, email, display_name, role, regional, must_change_password`,
		[
			uid,
			normalizeEmail(email),
			String(nome || "").trim(),
			normalizeRole(role),
			String(regional || "").trim(),
			passwordData.passwordHash,
			passwordData.passwordSalt,
			passwordData.passwordAlgorithm,
			mustChangePassword,
		],
	);
	await syncProfileDocument(result.rows[0]);
	return result.rows[0];
}

async function createGoogleProvisionedUser({ email, nome, req = null }) {
	const uid = crypto.randomUUID();
	const passwordData = await hashPassword(makeTemporaryPassword());
	const result = await db.query(
		`insert into app_users (
       uid, email, display_name, role, regional, password_hash, password_salt,
       password_algorithm, must_change_password, last_login_at, last_login_ip,
       last_login_user_agent
     )
     values ($1, $2, $3, $4, '', $5, $6, $7, false, now(), $8, $9)
     returning uid, email, display_name, role, regional, must_change_password,
               session_version, disabled, last_login_at, last_login_ip, last_login_user_agent`,
		[
			uid,
			normalizeEmail(email),
			String(nome || email || "").trim(),
			GOOGLE_OAUTH_DEFAULT_AUTO_ROLE,
			passwordData.passwordHash,
			passwordData.passwordSalt,
			passwordData.passwordAlgorithm,
			String(req?.ip || ""),
			String(req?.get?.("user-agent") || "").slice(0, 500),
		],
	);
	const user = result.rows[0];
	await syncProfileDocument(user, {
		loginProvider: "google",
		oauthAutoProvisioned: true,
		oauthStatus: "criado_automaticamente",
		mustChangePassword: false,
		lastLoginAt: user.last_login_at,
		lastLoginIp: user.last_login_ip,
		lastLoginUserAgent: user.last_login_user_agent,
	});
	return user;
}

async function createOktaProvisionedUser({ email, nome, req = null }) {
	const uid = crypto.randomUUID();
	const passwordData = await hashPassword(makeTemporaryPassword());
	const result = await db.query(
		`insert into app_users (
       uid, email, display_name, role, regional, password_hash, password_salt,
       password_algorithm, must_change_password, last_login_at, last_login_ip,
       last_login_user_agent
     )
     values ($1, $2, $3, $4, '', $5, $6, $7, false, now(), $8, $9)
     returning uid, email, display_name, role, regional, must_change_password,
               session_version, disabled, last_login_at, last_login_ip, last_login_user_agent`,
		[
			uid,
			normalizeEmail(email),
			String(nome || email || "").trim(),
			OKTA_OAUTH_DEFAULT_AUTO_ROLE,
			passwordData.passwordHash,
			passwordData.passwordSalt,
			passwordData.passwordAlgorithm,
			String(req?.ip || ""),
			String(req?.get?.("user-agent") || "").slice(0, 500),
		],
	);
	const user = result.rows[0];
	await syncProfileDocument(user, {
		loginProvider: "okta",
		oauthAutoProvisioned: true,
		oauthStatus: "criado_automaticamente",
		mustChangePassword: false,
		lastLoginAt: user.last_login_at,
		lastLoginIp: user.last_login_ip,
		lastLoginUserAgent: user.last_login_user_agent,
	});
	return user;
}

async function updateLocalUser(uid, data = {}) {
	const current = await getLocalUserByUid(uid);
	if (!current) throw new Error("Usuario nao encontrado.");

	const next = {
		email: data.email ? normalizeEmail(data.email) : current.email,
		displayName: data.nome ? String(data.nome).trim() : current.display_name,
		role: data.role ? normalizeRole(data.role) : normalizeRole(current.role),
		regional:
			data.regional !== undefined
				? String(data.regional || "").trim()
				: current.regional,
		disabled:
			data.disabled === undefined ? current.disabled : Boolean(data.disabled),
		mustChangePassword:
			data.trocar_senha === undefined
				? current.must_change_password
				: Boolean(data.trocar_senha),
	};

	await db.query(
		`update app_users
        set email = $2,
            display_name = $3,
            role = $4,
            regional = $5,
            disabled = $6,
            must_change_password = $7,
            session_version = session_version + 1
      where uid = $1`,
		[
			uid,
			next.email,
			next.displayName,
			next.role,
			next.regional,
			next.disabled,
			next.mustChangePassword,
		],
	);

	const saved = await getLocalUserByUid(uid);
	await syncProfileDocument(saved);
	return saved;
}

async function deleteLocalUser(uid) {
	await db.query("delete from app_users where uid = $1", [uid]);
	await db.query("delete from app_documents where path = $1", [
		`usuarios/${uid}`,
	]);
	await normalizedDualWrite.remove({
		path: `usuarios/${uid}`,
		collectionPath: "usuarios",
		documentId: uid,
	});
}

async function resetLocalUserPassword(uid, password = makeTemporaryPassword()) {
	const passwordData = await hashPassword(password);
	await db.query(
		`update app_users
        set password_hash = $2,
            password_salt = $3,
            password_algorithm = $4,
            must_change_password = true,
            session_version = session_version + 1
      where uid = $1`,
		[
			uid,
			passwordData.passwordHash,
			passwordData.passwordSalt,
			passwordData.passwordAlgorithm,
		],
	);
	const user = await getLocalUserByUid(uid);
	if (!user) throw new Error("Usuario nao encontrado.");
	await syncProfileDocument(user, { mustChangePassword: true });
	return password;
}

async function changeOwnPassword(
	uid,
	currentPassword,
	nextPassword,
	{ keepSessionJti = "" } = {},
) {
	const result = await db.query("select * from app_users where uid = $1", [
		uid,
	]);
	const user = result.rows[0] || null;
	if (!user || user.disabled) throw new Error("Usuario nao encontrado.");
	if (!(await verifyPassword(currentPassword, user)))
		throw new Error("Senha atual incorreta.");
	if (String(nextPassword || "").length < 8)
		throw new Error("A nova senha deve ter ao menos 8 caracteres.");

	const passwordData = await hashPassword(nextPassword);
	await db.query(
		`update app_users
        set password_hash = $2,
            password_salt = $3,
            password_algorithm = $4,
            must_change_password = false
      where uid = $1`,
		[
			uid,
			passwordData.passwordHash,
			passwordData.passwordSalt,
			passwordData.passwordAlgorithm,
		],
	);
	await revokeUserSessions(uid, { exceptJti: keepSessionJti });
	const updated = await getLocalUserByUid(uid);
	await syncProfileDocument(updated, { mustChangePassword: false });
}

async function loginWithPassword(email, password, { req = null } = {}) {
	const { user, profile } = await preparePasswordLogin(email, password, {
		req,
	});

	const token = await createSession({
		uid: user.uid,
		email: user.email,
		role: normalizeRole(profile.role || user.role),
		sessionVersion: user.session_version,
	});

	return {
		token,
		expiresIn: TOKEN_TTL_SECONDS,
		user: profile,
	};
}

async function verifyPasswordCredentials(email, password) {
	const user = await getLocalUserByEmail(email);
	if (!user || user.disabled || !(await verifyPassword(password, user))) {
		throw new Error("E-mail ou senha invalidos.");
	}

	await upgradePasswordHashIfNeeded(user, password);
	return user;
}

async function touchUserLogin(
	user,
	{ req = null, loginProvider = "local" } = {},
) {
	const lastLoginResult = await db.query(
		`update app_users
        set last_login_at = now(),
            last_login_ip = $2,
            last_login_user_agent = $3
      where uid = $1
      returning last_login_at, last_login_ip, last_login_user_agent`,
		[
			user.uid,
			String(req?.ip || ""),
			String(req?.get?.("user-agent") || "").slice(0, 500),
		],
	);
	const lastLogin = lastLoginResult.rows[0] || {};
	await syncProfileDocument(
		{
			...user,
			last_login_at: lastLogin.last_login_at,
			last_login_ip: lastLogin.last_login_ip,
			last_login_user_agent: lastLogin.last_login_user_agent,
		},
		{
			lastLoginAt: lastLogin.last_login_at,
			lastLoginIp: lastLogin.last_login_ip,
			lastLoginUserAgent: lastLogin.last_login_user_agent,
			loginProvider,
		},
	);
	return {
		...user,
		last_login_at: lastLogin.last_login_at,
		last_login_ip: lastLogin.last_login_ip,
		last_login_user_agent: lastLogin.last_login_user_agent,
	};
}

async function preparePasswordLogin(email, password, { req = null } = {}) {
	const user = await verifyPasswordCredentials(email, password);
	const touchedUser = await touchUserLogin(user, {
		req,
		loginProvider: "local",
	});

	const profile = await getImportedUserProfile(user.uid);
	if (!profile) throw new Error("Usuario sem perfil ativo.");

	return {
		user: touchedUser,
		profile,
	};
}

async function startEmailMfaLogin(
	email,
	password,
	{ ttlMinutes = 10, req = null } = {},
) {
	const user = await verifyPasswordCredentials(email, password);
	const code = createEmailMfaCode();
	const challengeId = crypto.randomUUID();
	const expiresAt = new Date(
		Date.now() +
			Math.max(3, Math.min(30, Number(ttlMinutes || 10))) * 60 * 1000,
	).toISOString();

	await db.query(
		`insert into email_mfa_challenges (
       id, uid, code_hash, expires_at, requested_ip, user_agent
     )
     values ($1, $2, $3, $4, $5, $6)`,
		[
			challengeId,
			user.uid,
			hashOpaqueToken(code),
			expiresAt,
			String(req?.ip || ""),
			String(req?.get?.("user-agent") || "").slice(0, 500),
		],
	);

	await db
		.query(
			`delete from email_mfa_challenges
      where expires_at < now() - interval '1 day'
         or used_at < now() - interval '1 day'`,
		)
		.catch(() => null);

	return {
		challengeId,
		code,
		expiresAt,
		ttlMinutes: Math.max(3, Math.min(30, Number(ttlMinutes || 10))),
		user,
		maskedEmail: maskEmail(user.email),
	};
}

async function verifyEmailMfaLogin(challengeId, code, { req = null } = {}) {
	const result = await db.query(
		`select c.id, c.uid, c.code_hash, c.expires_at, c.used_at, c.attempts,
            au.email, au.display_name, au.role, au.regional, au.session_version, au.disabled
       from email_mfa_challenges c
       join app_users au on au.uid = c.uid
      where c.id = $1
      limit 1`,
		[String(challengeId || "")],
	);
	const challenge = result.rows[0] || null;
	if (!challenge || challenge.used_at || challenge.disabled) {
		throw new Error("Código MFA inválido ou expirado.");
	}
	if (new Date(challenge.expires_at).getTime() < Date.now()) {
		throw new Error("Código MFA expirado.");
	}
	if (Number(challenge.attempts || 0) >= EMAIL_MFA_MAX_ATTEMPTS) {
		throw new Error("Limite de tentativas do MFA excedido.");
	}

	const validCode = timingSafeEqualText(
		challenge.code_hash,
		hashOpaqueToken(String(code || "").replace(/\D/g, "")),
	);
	if (!validCode) {
		await db.query(
			`update email_mfa_challenges
          set attempts = attempts + 1
        where id = $1`,
			[challenge.id],
		);
		throw new Error("Código MFA inválido.");
	}

	await db.query(
		"update email_mfa_challenges set used_at = now() where id = $1",
		[challenge.id],
	);
	await touchUserLogin(
		{
			uid: challenge.uid,
			email: challenge.email,
			display_name: challenge.display_name,
			role: challenge.role,
			regional: challenge.regional,
		},
		{ req, loginProvider: "email_mfa" },
	);
	const profile = await getImportedUserProfile(challenge.uid);
	if (!profile) throw new Error("Usuario sem perfil ativo.");

	const token = await createSession({
		uid: challenge.uid,
		email: challenge.email,
		role: normalizeRole(profile.role || challenge.role),
		sessionVersion: challenge.session_version,
	});

	return {
		token,
		expiresIn: TOKEN_TTL_SECONDS,
		user: profile,
	};
}

async function fetchOktaJwks(issuer) {
	const jwksUrl = getOktaJwksUrl(issuer);
	if (!jwksUrl) throw new Error("Issuer Okta inválido.");

	const cached = oktaJwksCache.get(jwksUrl);
	if (cached && cached.expiresAt > Date.now()) return cached.keys;

	const response = await fetch(jwksUrl, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) {
		throw new Error(
			`Não foi possível carregar as chaves públicas da Okta (${response.status}).`,
		);
	}
	const data = await response.json();
	const keys = Array.isArray(data?.keys) ? data.keys : [];
	oktaJwksCache.set(jwksUrl, {
		keys,
		expiresAt: Date.now() + 15 * 60 * 1000,
	});
	return keys;
}

function decodeJwtPart(part, label) {
	try {
		return JSON.parse(decodeBase64url(String(part || "")).toString("utf8"));
	} catch {
		throw new Error(`Token Okta com ${label} inválido.`);
	}
}

async function verifyOktaIdToken(idToken, config, expectedNonce = "") {
	const parts = String(idToken || "").split(".");
	if (parts.length !== 3) throw new Error("Token Okta inválido.");

	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	const header = decodeJwtPart(encodedHeader, "header");
	const payload = decodeJwtPart(encodedPayload, "payload");

	if (header.alg !== "RS256" || !header.kid) {
		throw new Error("Token Okta com algoritmo inválido.");
	}

	const keys = await fetchOktaJwks(config.issuer);
	const jwk = keys.find((item) => item.kid === header.kid);
	if (!jwk) throw new Error("Chave pública Okta não encontrada.");

	const verifier = crypto.createVerify("RSA-SHA256");
	verifier.update(`${encodedHeader}.${encodedPayload}`);
	verifier.end();
	const validSignature = verifier.verify(
		crypto.createPublicKey({ key: jwk, format: "jwk" }),
		decodeBase64url(encodedSignature),
	);
	if (!validSignature) throw new Error("Assinatura Okta inválida.");

	const now = Math.floor(Date.now() / 1000);
	if (payload.iss !== config.issuer) throw new Error("Issuer Okta inválido.");
	if (payload.aud !== config.clientId)
		throw new Error("Audience Okta inválido.");
	if (!payload.exp || Number(payload.exp) < now)
		throw new Error("Token Okta expirado.");
	if (payload.nbf && Number(payload.nbf) > now + 60)
		throw new Error("Token Okta ainda não é válido.");
	if (expectedNonce && payload.nonce !== expectedNonce)
		throw new Error("Nonce Okta inválido.");

	return payload;
}

async function loginWithGoogleIdToken(idToken, { req = null } = {}) {
	const config = await getGoogleOAuthConfig();
	if (!config.enabled || !config.clientId) {
		throw new Error("Login com Google nao configurado.");
	}

	const client = new OAuth2Client(config.clientId);
	const ticket = await client.verifyIdToken({
		idToken: String(idToken || ""),
		audience: config.clientId,
	});
	const payload = ticket.getPayload() || {};
	const email = normalizeEmail(payload.email);
	if (!email || payload.email_verified !== true) {
		throw new Error("Conta Google sem e-mail verificado.");
	}

	if (config.allowedDomains.length) {
		const domain = email.split("@").pop();
		if (!config.allowedDomains.includes(domain)) {
			throw new Error("Domínio do e-mail Google não autorizado.");
		}
	}

	let user = await getLocalUserByEmail(email);
	if (!user && config.autoProvision && config.allowedDomains.length) {
		user = await createGoogleProvisionedUser({
			email,
			nome: payload.name || payload.given_name || email,
			req,
		});
	}

	if (!user || user.disabled) {
		throw new Error("Usuário não cadastrado ou inativo.");
	}

	const lastLoginResult = await db.query(
		`update app_users
        set last_login_at = now(),
            last_login_ip = $2,
            last_login_user_agent = $3
      where uid = $1
      returning last_login_at, last_login_ip, last_login_user_agent`,
		[
			user.uid,
			String(req?.ip || ""),
			String(req?.get?.("user-agent") || "").slice(0, 500),
		],
	);
	const lastLogin = lastLoginResult.rows[0] || {};
	await syncProfileDocument(
		{
			...user,
			last_login_at: lastLogin.last_login_at,
			last_login_ip: lastLogin.last_login_ip,
			last_login_user_agent: lastLogin.last_login_user_agent,
		},
		{
			lastLoginAt: lastLogin.last_login_at,
			lastLoginIp: lastLogin.last_login_ip,
			lastLoginUserAgent: lastLogin.last_login_user_agent,
			loginProvider: "google",
		},
	);

	const profile = await getImportedUserProfile(user.uid);
	if (!profile) throw new Error("Usuario sem perfil ativo.");

	const token = await createSession({
		uid: user.uid,
		email: user.email,
		role: normalizeRole(profile.role || user.role),
		sessionVersion: user.session_version,
	});

	return {
		token,
		expiresIn: TOKEN_TTL_SECONDS,
		user: {
			...profile,
			login_provider: "google",
		},
	};
}

async function loginWithOktaIdToken(idToken, { nonce = "", req = null } = {}) {
	const config = await getOktaOAuthConfig();
	if (!config.enabled || !config.issuer || !config.clientId) {
		throw new Error("Login com Okta nao configurado.");
	}

	const payload = await verifyOktaIdToken(
		String(idToken || ""),
		config,
		String(nonce || ""),
	);
	const email = normalizeEmail(
		payload.email || payload.preferred_username || payload.sub,
	);
	if (!email || !email.includes("@")) {
		throw new Error("Conta Okta sem e-mail válido.");
	}
	if (payload.email_verified === false) {
		throw new Error("Conta Okta sem e-mail verificado.");
	}

	if (config.allowedDomains.length) {
		const domain = email.split("@").pop();
		if (!config.allowedDomains.includes(domain)) {
			throw new Error("Domínio do e-mail Okta não autorizado.");
		}
	}

	let user = await getLocalUserByEmail(email);
	if (!user && config.autoProvision && config.allowedDomains.length) {
		user = await createOktaProvisionedUser({
			email,
			nome:
				payload.name ||
				[payload.given_name, payload.family_name].filter(Boolean).join(" ") ||
				email,
			req,
		});
	}

	if (!user || user.disabled) {
		throw new Error("Usuário não cadastrado ou inativo.");
	}

	const lastLoginResult = await db.query(
		`update app_users
        set last_login_at = now(),
            last_login_ip = $2,
            last_login_user_agent = $3
      where uid = $1
      returning last_login_at, last_login_ip, last_login_user_agent`,
		[
			user.uid,
			String(req?.ip || ""),
			String(req?.get?.("user-agent") || "").slice(0, 500),
		],
	);
	const lastLogin = lastLoginResult.rows[0] || {};
	await syncProfileDocument(
		{
			...user,
			last_login_at: lastLogin.last_login_at,
			last_login_ip: lastLogin.last_login_ip,
			last_login_user_agent: lastLogin.last_login_user_agent,
		},
		{
			lastLoginAt: lastLogin.last_login_at,
			lastLoginIp: lastLogin.last_login_ip,
			lastLoginUserAgent: lastLogin.last_login_user_agent,
			loginProvider: "okta",
		},
	);

	const profile = await getImportedUserProfile(user.uid);
	if (!profile) throw new Error("Usuario sem perfil ativo.");

	const token = await createSession({
		uid: user.uid,
		email: user.email,
		role: normalizeRole(profile.role || user.role),
		sessionVersion: user.session_version,
	});

	return {
		token,
		expiresIn: TOKEN_TTL_SECONDS,
		user: {
			...profile,
			login_provider: "okta",
		},
	};
}

async function requireAuthenticated(req, res, next) {
	try {
		const token = getRequestAuthToken(req);
		if (!token) {
			res.status(401).json({ error: "Autenticacao obrigatoria." });
			return;
		}

		const decoded = verifyToken(token);
		const cachedUser = getCachedAuthenticatedUser(decoded);
		if (cachedUser) {
			req.user = cachedUser;
			req.authPayload = decoded;
			req.authToken = token;
			db.runWithRequestContext(req.user, next);
			return;
		}

		await requireActiveSession(decoded);
		const [user, profile] = await Promise.all([
			getLocalUserByUid(decoded.uid),
			getImportedUserProfile(decoded.uid),
		]);
		if (!user || user.disabled || !profile) {
			res.status(403).json({ error: "Usuario sem perfil ativo." });
			return;
		}
		if (Number(decoded.sv || 0) !== Number(user.session_version || 1)) {
			res.status(401).json({ error: "Sessao expirada. Entre novamente." });
			return;
		}

		req.user = {
			uid: decoded.uid,
			email: decoded.email || profile.email || "",
			jti: decoded.jti || "",
			profile,
			role: normalizeRole(profile.role),
		};
		setCachedAuthenticatedUser(decoded, req.user);
		req.authPayload = decoded;
		req.authToken = token;
		db.runWithRequestContext(req.user, next);
	} catch (error) {
		console.error(
			"[auth] Falha ao autenticar requisicao:",
			error?.message || error,
		);
		res.status(401).json({ error: "Token invalido ou expirado." });
	}
}

function requireRoles(roles) {
	const allowed = new Set(roles.map(normalizeRole));
	return (req, res, next) => {
		if (!req.user || !allowed.has(req.user.role)) {
			res.status(403).json({ error: "Permissao insuficiente." });
			return;
		}
		next();
	};
}

function canReadSnapshotDomain(user, domain) {
	const allowedRoles = SNAPSHOT_READ_ROLES[domain];
	if (!allowedRoles) return false;
	return allowedRoles.has(normalizeRole(user?.role));
}

module.exports = {
	canReadSnapshotDomain,
	changeOwnPassword,
	createPasswordResetToken,
	createPasswordResetTokenByEmail,
	createCsrfToken,
	createLocalUser,
	deleteLocalUser,
	getImportedUserProfile,
	getGoogleOAuthConfig,
	getOktaOAuthConfig,
	getLocalUserByEmail,
	getLocalUserByUid,
	getRequestAuthToken,
	hashPassword,
	loginWithGoogleIdToken,
	loginWithOktaIdToken,
	loginWithPassword,
	makeTemporaryPassword,
	normalizeRole,
	requireAuthenticated,
	requireRoles,
	renewSessionFromPayload,
	revokeSession,
	resetLocalUserPassword,
	resetPasswordWithToken,
	startEmailMfaLogin,
	TOKEN_TTL_SECONDS,
	updateLocalUser,
	verifyEmailMfaLogin,
	verifyCsrfToken,
};
