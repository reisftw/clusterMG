const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("./db");

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;
const TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || DEFAULT_TOKEN_TTL_SECONDS);
const PASSWORD_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const LEGACY_PASSWORD_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_ALGORITHM = "argon2id";
const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = process.env.APP_AUTH_ISSUER || "retiradas-api";
const JWT_AUDIENCE = process.env.APP_AUTH_AUDIENCE || "retiradas-web";
const DEFAULT_KEY_ID = "current";
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);

const FULL_OPERATION_ROLES = ["admin", "backoffice_retirada", "supervisor"];
const DASHBOARD_ROLES = [
  ...FULL_OPERATION_ROLES,
  "lider_empresa",
  "backoffice",
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
  return String(process.env.APP_AUTH_SECRET_ID || DEFAULT_KEY_ID).trim() || DEFAULT_KEY_ID;
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
  return String(role || "").trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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

function hashLegacyPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(String(password || ""), salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
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
  if (user.password_algorithm === LEGACY_PASSWORD_ALGORITHM || !user.password_algorithm) {
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
  if (!payload?.uid || !payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
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
  const decodedHeader = header ? JSON.parse(decodeBase64url(header).toString("utf8")) : {};
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
    return Boolean(provided && expected && timingSafeEqualText(provided, expected));
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

  return {
    id: item.id,
    ...item.data,
    role: normalizeRole(item.data?.role),
  };
}

async function getLocalUserByEmail(email) {
  const result = await db.query(
    `select uid, email, display_name, role, regional, password_hash, password_salt,
            password_algorithm, session_version, disabled, must_change_password,
            last_login_at, last_login_ip, last_login_user_agent
       from app_users
      where email = $1`,
    [normalizeEmail(email)],
  );
  return result.rows[0] || null;
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
  if (!payload?.uid || !payload?.jti) throw new Error("Sessao invalida para renovacao.");
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

async function upgradePasswordHashIfNeeded(user, password) {
  if (user.password_algorithm === PASSWORD_ALGORITHM) return;
  const passwordData = await hashPassword(password);
  await db.query(
    `update app_users
        set password_hash = $2,
            password_salt = $3,
            password_algorithm = $4
      where uid = $1`,
    [user.uid, passwordData.passwordHash, passwordData.passwordSalt, passwordData.passwordAlgorithm],
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
    trocar_senha: Boolean(extra.mustChangePassword ?? user.must_change_password),
    ultimo_login: extra.lastLoginAt || user.last_login_at || current?.ultimo_login || null,
    ultimo_login_ip: extra.lastLoginIp || user.last_login_ip || current?.ultimo_login_ip || "",
    ultimo_login_navegador: extra.lastLoginUserAgent || user.last_login_user_agent || current?.ultimo_login_navegador || "",
    atualizado_em: new Date().toISOString(),
  };

  if (!current?.criado_em) data.criado_em = new Date().toISOString();

  await db.query(
    `insert into app_documents (path, collection_path, document_id, parent_path, data)
     values ($1, 'usuarios', $2, null, $3::jsonb)
     on conflict (path) do update set data = excluded.data`,
    [`usuarios/${user.uid}`, user.uid, JSON.stringify(data)],
  );

  return { id: user.uid, ...data };
}

function makeTemporaryPassword() {
  return `Retira@${crypto.randomBytes(5).toString("hex")}`;
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashOpaqueToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function buildPasswordResetUrl(token) {
  const appUrl = String(process.env.PUBLIC_APP_URL || "https://retiradas.tech").replace(/\/+$/, "");
  return `${appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

async function createPasswordResetToken(uid, { purpose = "password_reset", req = null } = {}) {
  const user = await getLocalUserByUid(uid);
  if (!user || user.disabled) throw new Error("Usuario nao encontrado.");
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000).toISOString();
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

async function createPasswordResetTokenByEmail(email, { purpose = "password_reset", req = null } = {}) {
  const user = await getLocalUserByEmail(email);
  if (!user || user.disabled) return null;
  return createPasswordResetToken(user.uid, { purpose, req });
}

async function resetPasswordWithToken(token, nextPassword) {
  if (String(nextPassword || "").length < 8) throw new Error("A nova senha deve ter ao menos 8 caracteres.");
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
      [row.uid, passwordData.passwordHash, passwordData.passwordSalt, passwordData.passwordAlgorithm],
    );
    await db.query("update password_reset_tokens set used_at = now() where id = $1", [row.id]);
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

async function createLocalUser({ email, nome, role, regional, password, mustChangePassword = true }) {
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

async function updateLocalUser(uid, data = {}) {
  const current = await getLocalUserByUid(uid);
  if (!current) throw new Error("Usuario nao encontrado.");

  const next = {
    email: data.email ? normalizeEmail(data.email) : current.email,
    displayName: data.nome ? String(data.nome).trim() : current.display_name,
    role: data.role ? normalizeRole(data.role) : normalizeRole(current.role),
    regional: data.regional !== undefined ? String(data.regional || "").trim() : current.regional,
    disabled: data.disabled === undefined ? current.disabled : Boolean(data.disabled),
    mustChangePassword:
      data.trocar_senha === undefined ? current.must_change_password : Boolean(data.trocar_senha),
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
    [uid, next.email, next.displayName, next.role, next.regional, next.disabled, next.mustChangePassword],
  );

  const saved = await getLocalUserByUid(uid);
  await syncProfileDocument(saved);
  return saved;
}

async function deleteLocalUser(uid) {
  await db.query("delete from app_users where uid = $1", [uid]);
  await db.query("delete from app_documents where path = $1", [`usuarios/${uid}`]);
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
    [uid, passwordData.passwordHash, passwordData.passwordSalt, passwordData.passwordAlgorithm],
  );
  const user = await getLocalUserByUid(uid);
  if (!user) throw new Error("Usuario nao encontrado.");
  await syncProfileDocument(user, { mustChangePassword: true });
  return password;
}

async function changeOwnPassword(uid, currentPassword, nextPassword, { keepSessionJti = "" } = {}) {
  const result = await db.query("select * from app_users where uid = $1", [uid]);
  const user = result.rows[0] || null;
  if (!user || user.disabled) throw new Error("Usuario nao encontrado.");
  if (!(await verifyPassword(currentPassword, user))) throw new Error("Senha atual incorreta.");
  if (String(nextPassword || "").length < 8) throw new Error("A nova senha deve ter ao menos 8 caracteres.");

  const passwordData = await hashPassword(nextPassword);
  await db.query(
    `update app_users
        set password_hash = $2,
            password_salt = $3,
            password_algorithm = $4,
            must_change_password = false
      where uid = $1`,
    [uid, passwordData.passwordHash, passwordData.passwordSalt, passwordData.passwordAlgorithm],
  );
  await revokeUserSessions(uid, { exceptJti: keepSessionJti });
  const updated = await getLocalUserByUid(uid);
  await syncProfileDocument(updated, { mustChangePassword: false });
}

async function loginWithPassword(email, password, { req = null } = {}) {
  const user = await getLocalUserByEmail(email);
  if (!user || user.disabled || !(await verifyPassword(password, user))) {
    throw new Error("E-mail ou senha invalidos.");
  }

  await upgradePasswordHashIfNeeded(user, password);
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
    user: profile,
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
    req.authPayload = decoded;
    req.authToken = token;
    next();
  } catch (error) {
    console.error("[auth] Falha ao autenticar requisicao:", error?.message || error);
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
  getLocalUserByUid,
  getRequestAuthToken,
  hashPassword,
  loginWithPassword,
  makeTemporaryPassword,
  normalizeRole,
  requireAuthenticated,
  requireRoles,
  renewSessionFromPayload,
  revokeSession,
  resetLocalUserPassword,
  resetPasswordWithToken,
  TOKEN_TTL_SECONDS,
  updateLocalUser,
  verifyCsrfToken,
};
