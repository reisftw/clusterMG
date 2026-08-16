const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const db = require("./db");
const apiStatus = require("./apiStatus");
const databaseBackups = require("./databaseBackups");
const documents = require("./documents");
const notificationsService = require("./notificationsService");
const agendamentoEsteiraCommands = require("./agendamentoEsteiraCommands");
const evolutionMessaging = require("./evolutionMessaging");
const agendamentoConfirmacao = require("./agendamentoConfirmacao");
const emailService = require("./emailService");
const operationalImports = require("./operationalImports");
const sempreIntegration = require("./sempreIntegration");
const logisticaIntegration = require("./logisticaIntegration");
const hubsoftIntegration = require("./hubsoftIntegration");
const cvortexIntegration = require("./cvortexIntegration");
const createDocumentosRouter = require("./documentos/routes/documentosRoutes");
const documentosService = require("./documentos/services/documentosService");
const { attachRealtimeClient, broadcastRealtime } = require("./realtime");
const {
  buildPublicDashboard,
  buildSnapshotDomain,
} = require("./publicDashboard");
const {
  canReadSnapshotDomain,
  changeOwnPassword,
  createPasswordResetToken,
  createPasswordResetTokenByEmail,
  createCsrfToken,
  createLocalUser,
  deleteLocalUser,
  getImportedUserProfile,
  loginWithPassword,
  makeTemporaryPassword,
  requireAuthenticated,
  requireRoles,
  renewSessionFromPayload,
  revokeSession,
  resetLocalUserPassword,
  resetPasswordWithToken,
  TOKEN_TTL_SECONDS,
  updateLocalUser,
  verifyCsrfToken,
} = require("./auth");

const uploadRoot = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"));
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.AVATAR_UPLOAD_LIMIT_BYTES || 600 * 1024) },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || "").toLowerCase();
    const name = String(file?.originalname || "").toLowerCase();
    const allowed = ["image/png", "image/jpeg"].includes(mime) && /\.(png|jpe?g)$/.test(name);
    if (!allowed) {
      cb(new Error("Use apenas imagem JPG ou PNG."));
      return;
    }
    cb(null, true);
  },
});

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function uploadAvatarFile(req, res, next) {
  avatarUpload.single("avatar")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error: error.code === "LIMIT_FILE_SIZE"
          ? "A imagem deve ter no máximo 600 KB."
          : `Erro no upload: ${error.message}`,
      });
      return;
    }
    if (error?.message === "Use apenas imagem JPG ou PNG.") {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  });
}

function isValidAvatarBuffer(file) {
  if (!file?.buffer?.length) return false;
  const header4 = file.buffer.subarray(0, 4);
  const header3 = file.buffer.subarray(0, 3);
  return header4.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || header3.equals(Buffer.from([0xff, 0xd8, 0xff]));
}

async function saveAvatarUpload(file, prefix = "avatar") {
  if (!isValidAvatarBuffer(file)) {
    const error = new Error("Arquivo inválido ou corrompido. Envie JPG ou PNG.");
    error.statusCode = 400;
    throw error;
  }
  const extension = String(file.mimetype || "").toLowerCase() === "image/png" ? "png" : "jpg";
  const avatarsDir = path.join(uploadRoot, "avatars");
  await fs.mkdir(avatarsDir, { recursive: true });
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  await fs.writeFile(path.join(avatarsDir, filename), file.buffer);
  return `/api/uploads/avatars/${filename}`;
}

function requireInternalToken(req, res, next) {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected || expected.length < 24) {
    res.status(503).json({ error: "Token interno nao configurado." });
    return;
  }

  const provided = req.get("x-internal-api-token") || "";
  if (!timingSafeEqualText(provided, expected)) {
    res.status(401).json({ error: "Token interno invalido." });
    return;
  }

  next();
}

function getProvidedWebhookSecret(req) {
  return String(
    req.get("x-retiradas-webhook-secret") ||
      req.get("x-webhook-secret") ||
      req.get("x-api-key") ||
      req.query.secret ||
      req.body?.secret ||
      "",
  );
}

function verifyWebhookSecret(req, res, envName, label) {
  const expected = String(process.env[envName] || "");
  if (!expected || expected.length < 24) {
    if (isProduction()) {
      res.status(503).json({ error: `${label} sem segredo de webhook configurado.` });
      return false;
    }
    return true;
  }

  const provided = getProvidedWebhookSecret(req);
  if (!timingSafeEqualText(provided, expected)) {
    res.status(401).json({ error: "Webhook nao autorizado." });
    return false;
  }

  return true;
}

function normalizeUserRole(role) {
  return String(role || "").trim().toLowerCase();
}

const ADMIN_ROLES = ["admin"];
const DOCUMENTOS_CONFIG_ROLES = ["admin", "supervisor_administrativo"];
const USER_MANAGED_ROLES = ["admin", "backoffice_retirada", "supervisor", "supervisor_administrativo", "analista_administrativo", "lider_empresa", "agente_autorizado", "backoffice"];
const USER_MANAGER_ROLES = ["admin", "supervisor", "supervisor_administrativo"];
const SUPERVISOR_MANAGED_USER_ROLES = ["backoffice", "lider_empresa"];
const ADMINISTRATIVO_MANAGED_USER_ROLES = ["analista_administrativo", "lider_empresa", "agente_autorizado"];
const FULL_OPERATION_ROLES = ["admin", "backoffice_retirada", "supervisor"];
const DASHBOARD_ROLES = [
  ...FULL_OPERATION_ROLES,
  "lider_empresa",
  "backoffice",
  "estoque",
  "supervisor_estoque",
];
const ACERTO_ROLES = ["admin", "supervisor", "backoffice"];
const ESTOQUE_INTEGRADO_ROLES = [...new Set([...FULL_OPERATION_ROLES, ...ACERTO_ROLES])];
const REGIONAL_SCOPED_ACERTO_ROLES = ["supervisor"];
const EMPRESAS_COLLECTION = "empresas_tecnicos";
const ADMINISTRATIVO_DOCUMENTOS_ROLES = ["supervisor_administrativo", "analista_administrativo"];
const EMPRESAS_VIEW_ROLES = [...DASHBOARD_ROLES, ...ADMINISTRATIVO_DOCUMENTOS_ROLES, "agente_autorizado"];
const EMPRESAS_WRITE_ROLES = [...FULL_OPERATION_ROLES, ...ADMINISTRATIVO_DOCUMENTOS_ROLES, "lider_empresa", "agente_autorizado"];
const INSUMOS_ADMINISTRATIVOS_COLLECTIONS = new Set([
  "insumos_administrativos_produtos",
  "insumos_administrativos_retiradas",
  "insumos_administrativos_config",
]);
const INSUMOS_ADMINISTRATIVOS_ROLES = [...FULL_OPERATION_ROLES, ...ADMINISTRATIVO_DOCUMENTOS_ROLES];

function hasRole(user, roles) {
  return roles.includes(normalizeUserRole(user?.role));
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getUserRegional(user) {
  return String(user?.regional || user?.profile?.regional || "").trim();
}

function getRecordRegional(data = {}) {
  return String(
    data.regional ||
      data.regionalNome ||
      data.regional_nome ||
      data.filial_id ||
      data.filial ||
      "",
  ).trim();
}

function isRegionalScopedAcertoUser(user) {
  return hasRole(user, REGIONAL_SCOPED_ACERTO_ROLES);
}

const PUBLIC_COLLECTIONS = new Set([
  "ordens_abertas",
  "match_os_abertas",
  "ordens_legadas",
]);
const PUBLIC_DOCUMENTS = new Set([
  "public_dashboard/mapa_os",
  "public_dashboard/match_os",
  "public_dashboard/agentes_match_os",
  "public_dashboard/mapa_os_legadas",
]);
const ACERTO_ESTOQUE_COLLECTIONS = new Set([
  "acerto_estoque_empresas",
  "acerto_estoque_tecnicos",
  "acerto_estoque_agendas",
  "acerto_estoque_produtos",
  "acerto_estoque_acertos",
  "estoque_equipamentos",
  "estoque_equipamentos_logs",
  "estoque_equipamentos_tratativas",
]);
const REGIONAL_SCOPED_ACERTO_COLLECTIONS = new Set([
  "acerto_estoque_empresas",
  "acerto_estoque_tecnicos",
  "acerto_estoque_agendas",
  "acerto_estoque_produtos",
  "acerto_estoque_acertos",
]);

function isAcertoEstoqueCollection(collectionPath) {
  return REGIONAL_SCOPED_ACERTO_COLLECTIONS.has(String(collectionPath || "").trim());
}

function canAccessRegionalRecord(user, data = {}) {
  if (!isRegionalScopedAcertoUser(user)) return true;
  const userRegional = normalizeComparableText(getUserRegional(user));
  if (!userRegional) return false;
  const recordRegional = normalizeComparableText(getRecordRegional(data));
  return Boolean(recordRegional && recordRegional === userRegional);
}

function filterRegionalDocuments(user, collectionPath, items = []) {
  if (!isAcertoEstoqueCollection(collectionPath) || !isRegionalScopedAcertoUser(user)) return items;
  return items.filter((item) => canAccessRegionalRecord(user, item?.data || {}));
}

function applyRegionalScopeToData(user, collectionPath, data = {}) {
  if (!isAcertoEstoqueCollection(collectionPath) || !isRegionalScopedAcertoUser(user)) return data || {};
  const userRegional = getUserRegional(user);
  const existingRegional = getRecordRegional(data);
  if (existingRegional && normalizeComparableText(existingRegional) !== normalizeComparableText(userRegional)) {
    const error = new Error("Supervisor so pode alterar registros da propria regional.");
    error.statusCode = 403;
    throw error;
  }
  return { ...(data || {}), regional: userRegional };
}

function getUserEmpresaId(user) {
  return String(user?.empresaId || user?.empresa_id || user?.profile?.empresaId || user?.profile?.empresa_id || "").trim();
}

function getUserEmpresaNome(user) {
  return String(user?.empresaNome || user?.empresa_nome || user?.profile?.empresaNome || user?.profile?.empresa_nome || "").trim();
}

function isEmpresaLeader(user) {
  return hasRole(user, ["lider_empresa", "agente_autorizado"]);
}

function canAccessEmpresaRecord(user, documentId, data = {}) {
  if (hasRole(user, ["supervisor"])) {
    return normalizeComparableText(getUserRegional(user)) === normalizeComparableText(getRecordRegional(data));
  }
  if (!isEmpresaLeader(user)) return true;
  const empresaId = getUserEmpresaId(user);
  const empresaNome = normalizeComparableText(getUserEmpresaNome(user));
  const recordNome = normalizeComparableText(data.nome || data.empresa);
  return Boolean(
    (empresaId && empresaId === documentId) ||
      (empresaNome && recordNome && empresaNome === recordNome),
  );
}

function filterEmpresaDocuments(user, collectionPath, items = []) {
  if (
    String(collectionPath || "") !== EMPRESAS_COLLECTION ||
    (!isEmpresaLeader(user) && !hasRole(user, ["supervisor"]))
  ) {
    return items;
  }
  return items.filter((item) => canAccessEmpresaRecord(user, item?.documentId || "", item?.data || {}));
}

function applyEmpresaScopeToData(user, collectionPath, documentId, data = {}) {
  if (String(collectionPath || "") !== EMPRESAS_COLLECTION || !isEmpresaLeader(user)) return data || {};
  if (!canAccessEmpresaRecord(user, documentId, data || {})) {
    const error = new Error("Este perfil so pode alterar a propria empresa.");
    error.statusCode = 403;
    throw error;
  }
  return data || {};
}

function isGoogleDriveConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

async function ensureEmpresaDriveFolderIfConfigured(collectionPath, documentId, user) {
  if (String(collectionPath || "") !== EMPRESAS_COLLECTION || !isGoogleDriveConfigured()) return;
  try {
    await documentosService.createClientFolder({ empresaId: documentId, user });
  } catch (error) {
    console.warn("[documentos] nao foi possivel criar pasta da empresa no Drive:", error.message);
  }
}

async function mergeUserProfileExtras(uid, body = {}) {
  const allowed = {};
  if (body.empresaId !== undefined || body.empresa_id !== undefined) {
    allowed.empresaId = String(body.empresaId || body.empresa_id || "").trim();
  }
  if (body.empresaNome !== undefined || body.empresa_nome !== undefined) {
    allowed.empresaNome = String(body.empresaNome || body.empresa_nome || "").trim();
  }
  if (body.avatarUrl !== undefined || body.avatar_url !== undefined) {
    const avatarUrl = String(body.avatarUrl || body.avatar_url || "").trim();
    if (avatarUrl && !avatarUrl.startsWith("/api/uploads/avatars/")) {
      const error = new Error("Avatar inválido.");
      error.statusCode = 400;
      throw error;
    }
    allowed.avatarUrl = avatarUrl;
    allowed.avatarDataUrl = "";
  }
  if (!Object.keys(allowed).length) return;

  const current = await documents.getDocument(`usuarios/${uid}`);
  await documents.upsertDocument({
    path: `usuarios/${uid}`,
    collectionPath: "usuarios",
    documentId: uid,
    data: {
      ...(current?.data || {}),
      ...allowed,
      atualizado_em: new Date().toISOString(),
    },
  });
}

function canManageUsers(user) {
  return hasRole(user, USER_MANAGER_ROLES);
}

function canSupervisorManageUserRole(role) {
  return SUPERVISOR_MANAGED_USER_ROLES.includes(normalizeUserRole(role));
}

function canAdministrativoManageUserRole(role) {
  return ADMINISTRATIVO_MANAGED_USER_ROLES.includes(normalizeUserRole(role));
}

function canSupervisorAccessUserRecord(user, data = {}) {
  if (!hasRole(user, ["supervisor"])) return true;
  const userRegional = normalizeComparableText(getUserRegional(user));
  const recordRegional = normalizeComparableText(getRecordRegional(data));
  return Boolean(
    userRegional &&
      recordRegional &&
      userRegional === recordRegional &&
      canSupervisorManageUserRole(data.role),
  );
}

function canAdministrativoAccessUserRecord(user, data = {}) {
  if (!hasRole(user, ["supervisor_administrativo"])) return true;
  return canAdministrativoManageUserRole(data.role);
}

function filterUserDocumentsForManager(user, collectionPath, items = []) {
  if (String(collectionPath || "") !== "usuarios") return items;
  if (hasRole(user, ["supervisor"])) {
    return items.filter((item) => canSupervisorAccessUserRecord(user, item?.data || {}));
  }
  if (hasRole(user, ["supervisor_administrativo"])) {
    return items.filter((item) => canAdministrativoAccessUserRecord(user, item?.data || {}));
  }
  return items;
}

async function getUserProfileDocument(uid) {
  const item = await documents.getDocument(`usuarios/${uid}`);
  return item?.data ? { id: uid, ...item.data } : null;
}

function assertCanCreateManagedUser(user, body = {}) {
  if (hasRole(user, ADMIN_ROLES)) return;
  if (hasRole(user, ["supervisor_administrativo"])) {
    if (canAdministrativoManageUserRole(body.role)) return;
    const error = new Error("Supervisor Administrativo so pode criar Analista Administrativo, Lider Empresa ou Agente Autorizado.");
    error.statusCode = 403;
    throw error;
  }
  if (!hasRole(user, ["supervisor"])) {
    const error = new Error("Permissao insuficiente.");
    error.statusCode = 403;
    throw error;
  }
  const role = normalizeUserRole(body.role);
  if (!canSupervisorManageUserRole(role)) {
    const error = new Error("Supervisor so pode criar Backoffice ou Lider Empresa.");
    error.statusCode = 403;
    throw error;
  }
  const userRegional = normalizeComparableText(getUserRegional(user));
  const bodyRegional = normalizeComparableText(body.regional);
  if (!userRegional || bodyRegional !== userRegional) {
    const error = new Error("Supervisor so pode criar usuarios da propria regional.");
    error.statusCode = 403;
    throw error;
  }
}

async function assertCanUpdateManagedUser(user, uid, body = {}) {
  if (hasRole(user, ADMIN_ROLES)) return;
  if (hasRole(user, ["supervisor_administrativo"])) {
    const current = await getUserProfileDocument(uid);
    if (!current || !canAdministrativoAccessUserRecord(user, current)) {
      const error = new Error("Supervisor Administrativo so pode alterar Analista Administrativo, Lider Empresa ou Agente Autorizado.");
      error.statusCode = 403;
      throw error;
    }
    const nextRole = body.role !== undefined ? normalizeUserRole(body.role) : normalizeUserRole(current.role);
    if (!canAdministrativoManageUserRole(nextRole)) {
      const error = new Error("Supervisor Administrativo so pode manter usuarios como Analista Administrativo, Lider Empresa ou Agente Autorizado.");
      error.statusCode = 403;
      throw error;
    }
    return;
  }
  if (!hasRole(user, ["supervisor"])) {
    const error = new Error("Permissao insuficiente.");
    error.statusCode = 403;
    throw error;
  }

  const current = await getUserProfileDocument(uid);
  if (!current || !canSupervisorAccessUserRecord(user, current)) {
    const error = new Error("Supervisor so pode alterar usuarios da propria regional.");
    error.statusCode = 403;
    throw error;
  }

  const nextRole = body.role !== undefined ? normalizeUserRole(body.role) : normalizeUserRole(current.role);
  if (!canSupervisorManageUserRole(nextRole)) {
    const error = new Error("Supervisor so pode manter usuarios como Backoffice ou Lider Empresa.");
    error.statusCode = 403;
    throw error;
  }

  const nextRegional = body.regional !== undefined ? body.regional : current.regional;
  if (normalizeComparableText(nextRegional) !== normalizeComparableText(getUserRegional(user))) {
    const error = new Error("Supervisor nao pode mover usuario para outra regional.");
    error.statusCode = 403;
    throw error;
  }
}

const ADMIN_ONLY_COLLECTION_PREFIXES = [
  "app_users",
  "auth_sessions",
  "password_reset_tokens",
  "system_",
  "integracoes",
  "api_status",
  "database_backups",
  "mensageria_config",
  "mensageria_evolution",
  "mensageria_templates",
];

const AUTH_COOKIE_NAME = "retiradas_session";
const CSRF_COOKIE_NAME = "retiradas_csrf";
const TOKEN_RENEW_WINDOW_SECONDS = Number(process.env.ACCESS_TOKEN_RENEW_WINDOW_SECONDS || 60 * 60 * 24 * 7);

function getAllowedOrigins() {
  return String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(allowedOrigins, origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getBaseCookieOptions(maxAgeSeconds) {
  return [
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds || 0))}`,
    isProduction() ? "Secure" : "",
  ].filter(Boolean);
}

function getAuthCookieOptions(maxAgeSeconds) {
  return ["HttpOnly", ...getBaseCookieOptions(maxAgeSeconds)];
}

function setCsrfCookie(res, csrfToken, maxAgeSeconds) {
  const cookie = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken || "")}; ${getBaseCookieOptions(maxAgeSeconds).join("; ")}`;
  const previous = res.getHeader("Set-Cookie");
  const cookies = Array.isArray(previous) ? previous : previous ? [previous] : [];
  res.setHeader("Set-Cookie", [...cookies, cookie]);
}

function setAuthCookie(res, token, maxAgeSeconds) {
  const csrfToken = createCsrfToken(token);
  res.setHeader(
    "Set-Cookie",
    [
      `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${getAuthCookieOptions(maxAgeSeconds).join("; ")}`,
      `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${getBaseCookieOptions(maxAgeSeconds).join("; ")}`,
    ],
  );
  return csrfToken;
}

function shouldRenewAuthToken(payload) {
  const expiresAt = Number(payload?.exp || 0);
  if (!expiresAt) return true;
  const remainingSeconds = expiresAt - Math.floor(Date.now() / 1000);
  return remainingSeconds <= TOKEN_RENEW_WINDOW_SECONDS;
}

function clearAuthCookie(res) {
  res.setHeader(
    "Set-Cookie",
    [
      `${AUTH_COOKIE_NAME}=; ${getAuthCookieOptions(0).join("; ")}`,
      `${CSRF_COOKIE_NAME}=; ${getBaseCookieOptions(0).join("; ")}`,
    ],
  );
}

function rejectLargePublicVisit(req, res, next) {
  const contentLength = Number(req.get("content-length") || 0);
  const maxBytes = Number(process.env.PUBLIC_VISIT_MAX_BYTES || 4096);
  if (contentLength > maxBytes) {
    res.status(413).json({ error: "Payload muito grande." });
    return;
  }
  next();
}

function requireCsrfToken(req, res, next) {
  if (verifyCsrfToken(req)) {
    next();
    return;
  }

  res.status(403).json({ error: "Token CSRF invalido ou ausente." });
}

function canReadCollection(user, collectionPath) {
  const collection = String(collectionPath || "").trim();
  if (ADMIN_ONLY_COLLECTION_PREFIXES.some((prefix) => collection === prefix || collection.startsWith(`${prefix}/`))) {
    return hasRole(user, ADMIN_ROLES);
  }
  if (collection === "usuarios") return canManageUsers(user);
  if (collection === EMPRESAS_COLLECTION) return hasRole(user, EMPRESAS_VIEW_ROLES);
  if (INSUMOS_ADMINISTRATIVOS_COLLECTIONS.has(collection)) return hasRole(user, INSUMOS_ADMINISTRATIVOS_ROLES);
  if (hasRole(user, FULL_OPERATION_ROLES)) return true;
  if (hasRole(user, ACERTO_ROLES)) return ACERTO_ESTOQUE_COLLECTIONS.has(collection);
  return false;
}

function canReadDocumentPath(user, documentPath) {
  const collectionPath = String(documentPath || "").split("/").filter(Boolean).slice(0, -1).join("/");
  return canReadCollection(user, collectionPath);
}

function canWriteCollection(user, collectionPath) {
  const collection = String(collectionPath || "").trim();
  if (ADMIN_ONLY_COLLECTION_PREFIXES.some((prefix) => collection === prefix || collection.startsWith(`${prefix}/`))) {
    return hasRole(user, ADMIN_ROLES);
  }
  if (collection === "usuarios") return canManageUsers(user);
  if (collection === EMPRESAS_COLLECTION) return hasRole(user, EMPRESAS_WRITE_ROLES);
  if (INSUMOS_ADMINISTRATIVOS_COLLECTIONS.has(collection)) return hasRole(user, INSUMOS_ADMINISTRATIVOS_ROLES);
  if (hasRole(user, FULL_OPERATION_ROLES)) return true;
  if (hasRole(user, ACERTO_ROLES)) return ACERTO_ESTOQUE_COLLECTIONS.has(collection);
  return false;
}

function canWriteDocumentPath(user, documentPath) {
  const collectionPath = String(documentPath || "").split("/").filter(Boolean).slice(0, -1).join("/");
  return canWriteCollection(user, collectionPath);
}

function pickFirstText(data = {}, keys = []) {
  for (const key of keys) {
    const value = data?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeAgendamentoClienteRecord(row = null) {
  if (!row) return null;
  const data = row.data || {};
  const clienteNome = pickFirstText(data, [
    "nome_cliente",
    "cliente_nome",
    "nome_razaosocial",
    "nome",
    "cliente",
  ]);

  return {
    path: row.path,
    collectionPath: row.collectionPath,
    documentId: row.documentId,
    codigo_cliente: pickFirstText(data, ["codigo_cliente", "codigo", "cod_cliente"]) || row.documentId || "",
    cliente_nome: clienteNome.replace(/^\(\d+\)\s*/, ""),
    cidade: pickFirstText(data, ["cidade", "municipio"]),
    regional: pickFirstText(data, ["regional"]),
    empresa: pickFirstText(data, ["empresa", "fonte"]),
    num_os: pickFirstText(data, ["num_os", "numero", "os"]),
    telefone: pickFirstText(data, ["telefone", "whatsapp", "celular", "fone"]),
    endereco: pickFirstText(data, ["endereco", "endereco_instalacao", "logradouro"]),
    bairro: pickFirstText(data, ["bairro"]),
    tipo: pickFirstText(data, ["tipo"]),
    status: pickFirstText(data, ["status"]),
    fonte: pickFirstText(data, ["fonte"]),
  };
}

function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();
  if (isProduction() && allowedOrigins.length === 0) {
    throw new Error("CORS_ORIGIN obrigatorio em producao.");
  }
  const loginLimiter = rateLimit({
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 8),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." },
  });
  const publicWriteLimiter = rateLimit({
    windowMs: Number(process.env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_MS || 60 * 1000),
    limit: Number(process.env.PUBLIC_WRITE_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisicoes. Tente novamente em instantes." },
  });
  const realtimeLimiter = rateLimit({
    windowMs: Number(process.env.REALTIME_RATE_LIMIT_WINDOW_MS || 60 * 1000),
    limit: Number(process.env.REALTIME_RATE_LIMIT_MAX || 180),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas conexoes em tempo real. Tente novamente em instantes." },
  });

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && !isAllowedOrigin(allowedOrigins, origin)) {
      res.status(403).json({ error: "Origem nao permitida." });
      return;
    }
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isAllowedOrigin(allowedOrigins, origin)) {
        callback(null, true);
        return;
      }
      if (!isProduction() && allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }
      callback(new Error("Origem nao permitida."));
    },
    credentials: true,
  }));
  app.use("/api/uploads", requireAuthenticated, express.static(uploadRoot, {
    immutable: true,
    maxAge: "30d",
  }));
  app.use("/api/public/visits", rejectLargePublicVisit);
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));
  app.use("/api/documentos", createDocumentosRouter({
    requireAuthenticated,
    requireCsrfToken,
    requireRoles,
    adminRoles: DOCUMENTOS_CONFIG_ROLES,
  }));

  app.get("/api/health", async (req, res, next) => {
    try {
      const database = await db.healthcheck();
      res.json({
        ok: true,
        service: "retiradas-vps-api",
        databaseTime: database.now,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events", realtimeLimiter, (req, res) => {
    attachRealtimeClient(req, res);
  });

  app.get("/api/notifications", requireAuthenticated, async (req, res, next) => {
    try {
      res.json(await notificationsService.listNotifications({
        user: req.user?.profile || req.user || {},
        limit: req.query.limit,
        offset: req.query.offset,
        type: req.query.type,
        severity: req.query.severity,
        unread: req.query.unread,
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/notifications/stats", requireAuthenticated, async (req, res, next) => {
    try {
      res.json(await notificationsService.getNotificationStats({
        user: req.user?.profile || req.user || {},
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/notifications/preferences", requireAuthenticated, async (req, res, next) => {
    try {
      res.json(await notificationsService.getPreferences({
        user: req.user?.profile || req.user || {},
      }));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/notifications/preferences", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
    try {
      res.json(await notificationsService.savePreferences({
        user: req.user?.profile || req.user || {},
        preferences: req.body || {},
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/notifications/counters", requireAuthenticated, async (req, res, next) => {
    try {
      res.json(await notificationsService.getCounters({
        user: req.user?.profile || req.user || {},
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/notifications/read", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
    try {
      res.json(await notificationsService.markNotificationsRead({
        user: req.user?.profile || req.user || {},
        ids: req.body?.ids,
        all: req.body?.all === true,
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/notifications/check-critical", requireAuthenticated, requireRoles(ADMIN_ROLES), requireCsrfToken, async (req, res, next) => {
    try {
      res.json(await notificationsService.createCriticalServiceAlerts({
        user: req.user?.profile || req.user || {},
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/dashboard", async (req, res, next) => {
    try {
      res.json(await buildPublicDashboard());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/static/:domain", async (req, res, next) => {
    try {
      const domain = String(req.params.domain || "").trim();
      const dynamicSnapshot = await buildSnapshotDomain(domain);
      if (!dynamicSnapshot) {
        res.status(404).json({ error: "Snapshot nao encontrado." });
        return;
      }

      res.json(dynamicSnapshot);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/documents", async (req, res, next) => {
    try {
      const collectionPath = String(req.query.collection || "").trim();
      if (!PUBLIC_COLLECTIONS.has(collectionPath)) {
        res.status(404).json({ error: "Colecao publica nao encontrada." });
        return;
      }

      const items = await documents.listDocuments({
        collectionPath,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/documents/*", async (req, res, next) => {
    try {
      const documentPath = req.params[0];
      if (!PUBLIC_DOCUMENTS.has(documentPath)) {
        res.status(404).json({ error: "Documento publico nao encontrado." });
        return;
      }

      const item = await documents.getDocument(documentPath);
      if (!item) {
        res.status(404).json({ error: "Documento nao encontrado." });
        return;
      }

      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/sempre/equipment", publicWriteLimiter, async (req, res, next) => {
    try {
      const result = await sempreIntegration.consultEquipment(req.query.mac);
      const primary = result.primary || {};
      const stockLocal = result.stockLocal || {};
      res.json({
        ok: true,
        mac: result.mac,
        found: result.found === true,
        status: result.found ? primary.status || "Encontrado" : "Nao localizado",
        estoqueAtual: stockLocal.descricao || primary.estoqueLocal || "Nao localizado",
        estoqueHelper: stockLocal.seniorId || primary.estoqueLocalId || "",
        produto: primary.produtoNome || "Nao localizado",
        produtoHelper: primary.produtoId || "",
        vinculadoEm: primary.vinculadoEm || primary.origemStatus || "Nao localizado",
        vinculoHelper: primary.vinculadoTipo || "",
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/public/visits", publicWriteLimiter, async (req, res, next) => {
    try {
      const documentId = crypto.randomUUID();
      const path = `painel_visitas/${documentId}`;
      await documents.upsertDocument({
        path,
        collectionPath: "painel_visitas",
        documentId,
        parentPath: null,
        data: {
          ...(req.body || {}),
          createdAt: new Date().toISOString(),
        },
      });
      res.json({ ok: true, id: documentId });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) {
        res.json({ ok: false, error: "Informe e-mail e senha." });
        return;
      }

      const session = await loginWithPassword(email, password, { req });
      const csrfToken = setAuthCookie(res, session.token, session.expiresIn);
      res.json({
        ok: true,
        csrfToken,
        expiresIn: session.expiresIn,
        user: session.user,
      });
    } catch (error) {
      res.json({ ok: false, error: error?.message || "E-mail ou senha invalidos." });
    }
  });

  app.post("/api/auth/logout", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
    try {
      await revokeSession(req.user?.jti || req.authPayload?.jti);
      clearAuthCookie(res);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", requireAuthenticated, async (req, res, next) => {
    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const currentExpiresIn = Math.max(0, Number(req.authPayload?.exp || nowSeconds) - nowSeconds);

      if (shouldRenewAuthToken(req.authPayload)) {
        const renewedToken = await renewSessionFromPayload(req.authPayload);
        const csrfToken = setAuthCookie(res, renewedToken, TOKEN_TTL_SECONDS);
        res.json({ csrfToken, expiresIn: TOKEN_TTL_SECONDS, renewed: true, user: req.user.profile });
        return;
      }

      const csrfToken = createCsrfToken(req.authToken);
      setCsrfCookie(res, csrfToken, currentExpiresIn || TOKEN_TTL_SECONDS);
      res.json({ csrfToken, expiresIn: currentExpiresIn, renewed: false, user: req.user.profile });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/auth/avatar", requireAuthenticated, requireCsrfToken, uploadAvatarFile, async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Selecione uma imagem JPG ou PNG." });
        return;
      }
      const avatarUrl = await saveAvatarUpload(req.file, `user-${req.user.uid}`);

      const current = await documents.getDocument(`usuarios/${req.user.uid}`);
      await documents.upsertDocument({
        path: `usuarios/${req.user.uid}`,
        collectionPath: "usuarios",
        documentId: req.user.uid,
        data: {
          ...(current?.data || {}),
          avatarUrl,
          avatarDataUrl: "",
          atualizado_em: new Date().toISOString(),
        },
      });

      const csrfToken = createCsrfToken(req.authToken);
      setCsrfCookie(res, csrfToken, TOKEN_TTL_SECONDS);
      res.json({
        ok: true,
        csrfToken,
        avatarUrl,
        user: {
          ...(req.user.profile || {}),
          avatarUrl,
          avatarDataUrl: "",
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/change-password", requireAuthenticated, requireCsrfToken, async (req, res) => {
    try {
      await changeOwnPassword(
        req.user.uid,
        String(req.body?.currentPassword || ""),
        String(req.body?.nextPassword || ""),
        { keepSessionJti: req.user.jti || req.authPayload?.jti || "" },
      );
      emailService.sendPasswordChangedEmail({
        user: {
          uid: req.user.uid,
          email: req.user.email,
          display_name: req.user.profile?.nome || req.user.email,
        },
      }).catch((error) => console.error("[email] Falha ao avisar troca de senha:", error?.message || error));
      res.json({ ok: true, user: await getImportedUserProfile(req.user.uid) });
    } catch (error) {
      res.status(400).json({ error: error?.message || "Erro ao trocar senha." });
    }
  });

  app.post("/api/auth/forgot-password", loginLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (email) {
        const reset = await createPasswordResetTokenByEmail(email, { purpose: "password_reset", req });
        if (reset?.user) {
          await emailService.sendPasswordResetEmail({
            user: reset.user,
            resetUrl: reset.resetUrl,
          });
        }
      }
      res.json({ ok: true, message: "Se o e-mail existir, enviaremos um link de redefinicao." });
    } catch (error) {
      console.error("[auth] Falha ao solicitar redefinicao:", error?.message || error);
      res.json({ ok: true, message: "Se o e-mail existir, enviaremos um link de redefinicao." });
    }
  });

  app.post("/api/auth/reset-password", loginLimiter, async (req, res) => {
    try {
      const user = await resetPasswordWithToken(
        String(req.body?.token || ""),
        String(req.body?.password || ""),
      );
      emailService.sendPasswordChangedEmail({ user }).catch((error) =>
        console.error("[email] Falha ao avisar senha alterada:", error?.message || error),
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || "Nao foi possivel redefinir a senha." });
    }
  });

  app.get(
    "/api/admin/email/config",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json({ ok: true, config: emailService.sanitizeConfig(await emailService.getConfig()) });
      } catch (error) {
        notificationsService.createNotification({
          type: "backup",
          title: "Falha ao gerar backup",
          message: error?.message || "Não foi possível gerar o backup do PostgreSQL.",
          targetPath: "/configuracoes/banco-de-dados",
          severity: "critical",
          user: req.user?.profile || req.user || {},
          targets: { roles: ["admin"] },
          meta: { event: "backup_failed" },
        }).catch((notifyError) => console.warn("[notifications] Falha ao avisar erro de backup:", notifyError?.message || notifyError));
        next(error);
      }
    },
  );

  app.put(
    "/api/admin/email/config",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json({ ok: true, config: await emailService.saveConfig(req.body || {}) });
      } catch (error) {
        notificationsService.createNotification({
          type: "backup",
          title: "Falha no rollback",
          message: error?.message || "Não foi possível restaurar o backup selecionado.",
          targetPath: "/configuracoes/banco-de-dados",
          severity: "critical",
          user: req.user?.profile || req.user || {},
          targets: { roles: ["admin"] },
          meta: { event: "backup_restore_failed", fileName: req.params.fileName },
        }).catch((notifyError) => console.warn("[notifications] Falha ao avisar erro de restore:", notifyError?.message || notifyError));
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/email/test",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await emailService.sendTestEmail(req.body?.to || req.user?.email));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/email/logs",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json({
          ok: true,
          ...(await emailService.listEmailLogs({
            limit: req.query.limit,
            offset: req.query.offset,
            status: req.query.status,
            type: req.query.type,
            q: req.query.q,
          })),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/documents", async (req, res, next) => {
    try {
      const collectionPath = String(req.query.collection || "").trim();
      if (!PUBLIC_COLLECTIONS.has(collectionPath)) {
        next();
        return;
      }

      const items = await documents.listDocuments({
        collectionPath,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/documents/*", async (req, res, next) => {
    try {
      const documentPath = req.params[0];
      if (!PUBLIC_DOCUMENTS.has(documentPath)) {
        next();
        return;
      }

      const item = await documents.getDocument(documentPath);
      if (!item) {
        res.status(404).json({ error: "Documento nao encontrado." });
        return;
      }

      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/documents",
    requireAuthenticated,
    async (req, res, next) => {
      try {
        const collectionPath = String(req.query.collection || "").trim();
        if (!collectionPath) {
          res.status(400).json({ error: "Parametro collection obrigatorio." });
          return;
        }
        if (!canReadCollection(req.user, collectionPath)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }

        const items = await documents.listDocuments({
          collectionPath,
          limit: req.query.limit,
          offset: req.query.offset,
        });
        res.json({
          items: filterUserDocumentsForManager(
            req.user,
            collectionPath,
            filterEmpresaDocuments(
              req.user,
              collectionPath,
              filterRegionalDocuments(req.user, collectionPath, items),
            ),
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/documents/*", requireAuthenticated, async (req, res, next) => {
    try {
      const documentPath = req.params[0];
      const item = await documents.getDocument(documentPath);
      if (!item) {
        res.status(404).json({ error: "Documento nao encontrado." });
        return;
      }
      const isOwnUserProfile = documentPath === `usuarios/${req.user.uid}`;
      const canReadGenericDocument = canReadDocumentPath(req.user, documentPath);
      if (!isOwnUserProfile && !canReadGenericDocument) {
        res.status(403).json({ error: "Permissao insuficiente." });
        return;
      }
      if (
        !isOwnUserProfile &&
        isAcertoEstoqueCollection(item.collectionPath) &&
        !canAccessRegionalRecord(req.user, item.data || {})
      ) {
        res.status(403).json({ error: "Supervisor so pode acessar registros da propria regional." });
        return;
      }
      if (
        !isOwnUserProfile &&
        item.collectionPath === EMPRESAS_COLLECTION &&
        !canAccessEmpresaRecord(req.user, item.documentId, item.data || {})
      ) {
        res.status(403).json({ error: "Lider Empresa so pode acessar a propria empresa." });
        return;
      }
      if (
        !isOwnUserProfile &&
        item.collectionPath === "usuarios" &&
        (
          !canSupervisorAccessUserRecord(req.user, item.data || {}) ||
          !canAdministrativoAccessUserRecord(req.user, item.data || {})
        )
      ) {
        res.status(403).json({ error: "Sem permissao para acessar este usuario." });
        return;
      }

      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/static/:domain", requireAuthenticated, async (req, res, next) => {
    try {
      const domain = String(req.params.domain || "").trim();
      if (!canReadSnapshotDomain(req.user, domain)) {
        res.status(403).json({ error: "Permissao insuficiente." });
        return;
      }

      const result = await db.query(
        `select domain, data, generated_at as "generatedAt", updated_at as "updatedAt"
           from static_snapshots
          where domain = $1`,
        [domain],
      );

      const item = result.rows[0] || null;
      if (!item) {
        const dynamicSnapshot = await buildSnapshotDomain(domain);
        if (!dynamicSnapshot) {
          res.status(404).json({ error: "Snapshot nao encontrado." });
          return;
        }

        res.json(dynamicSnapshot);
        return;
      }

      res.json({
        domain: item.domain,
        generatedAt: item.generatedAt,
        updatedAt: item.updatedAt,
        ...item.data,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/static/refresh",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        const requestedDomains = Array.isArray(req.body?.domains)
          ? req.body.domains
          : ["dashboard", "rh", "operacional", "financeiro"];
        const domains = [...new Set(requestedDomains.map((item) => String(item || "").trim()).filter(Boolean))];
        const generatedAt = new Date().toISOString();
        const results = [];

        for (const domain of domains) {
          const snapshot = await buildSnapshotDomain(domain);
          if (!snapshot) {
            results.push({ domain, ok: false, error: "Snapshot nao encontrado." });
            continue;
          }

          await db.query(
            `insert into static_snapshots (domain, data, generated_at)
             values ($1, $2::jsonb, $3)
             on conflict (domain) do update set
               data = excluded.data,
               generated_at = excluded.generated_at`,
            [domain, JSON.stringify(snapshot), generatedAt],
          );
          broadcastRealtime(domain);
          broadcastRealtime("dashboard", { domain });
          broadcastRealtime("acompanhamento", { domain });
          results.push({ domain, ok: true });
        }

        res.json({ ok: true, generatedAt, results });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/users",
    requireAuthenticated,
    requireCsrfToken,
    async (req, res, next) => {
      try {
        if (!canManageUsers(req.user)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }
        assertCanCreateManagedUser(req.user, req.body || {});
        const email = String(req.body?.email || "").trim().toLowerCase();
        const nome = String(req.body?.nome || "").trim();
        const role = normalizeUserRole(req.body?.role);
        const regional = hasRole(req.user, ["supervisor"]) ? getUserRegional(req.user) : String(req.body?.regional || "").trim();
        const temporaryPassword = String(req.body?.temporaryPassword || "").trim() || makeTemporaryPassword();

        if (!email || !nome || !role) {
          res.status(400).json({ error: "Nome, e-mail e perfil sao obrigatorios." });
          return;
        }
        if (!USER_MANAGED_ROLES.includes(role)) {
          res.status(400).json({ error: "Cargo invalido para novo usuario." });
          return;
        }

        const user = await createLocalUser({
          email,
          nome,
          role,
          regional,
          password: temporaryPassword,
          mustChangePassword: true,
        });
        await mergeUserProfileExtras(user.uid, req.body || {});

        let passwordResetLink = "";
        let emailStatus = "nao_enviado";
        let emailError = "";
        try {
          const reset = await createPasswordResetToken(user.uid, { purpose: "first_access", req });
          passwordResetLink = reset.resetUrl;
          await emailService.sendWelcomeUserEmail({ user, resetUrl: reset.resetUrl });
          emailStatus = "enviado";
        } catch (error) {
          emailStatus = "erro";
          emailError = String(error?.message || error);
          console.error("[email] Falha ao enviar primeiro acesso:", emailError);
        }

        res.json({ ok: true, uid: user.uid, temporaryPassword, passwordResetLink, emailStatus, emailError });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/avatars",
    requireAuthenticated,
    requireCsrfToken,
    uploadAvatarFile,
    async (req, res, next) => {
      try {
        if (!canManageUsers(req.user)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: "Selecione uma imagem JPG ou PNG." });
          return;
        }
        const avatarUrl = await saveAvatarUpload(req.file, "admin-avatar");
        res.json({ ok: true, avatarUrl });
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/admin/users/:uid",
    requireAuthenticated,
    requireCsrfToken,
    async (req, res, next) => {
      try {
        if (!canManageUsers(req.user)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }
        const uid = String(req.params.uid || "").trim();
        if (!uid) {
          res.status(400).json({ error: "UID obrigatorio." });
          return;
        }

        const nextBody = req.body || {};
        await assertCanUpdateManagedUser(req.user, uid, nextBody);
        if (hasRole(req.user, ["supervisor"])) {
          nextBody.regional = getUserRegional(req.user);
        }
        const nextRole = nextBody.role !== undefined ? normalizeUserRole(nextBody.role) : "";
        if (nextRole && !USER_MANAGED_ROLES.includes(nextRole)) {
          res.status(400).json({ error: "Cargo invalido para usuario." });
          return;
        }

        await updateLocalUser(uid, nextBody);
        await mergeUserProfileExtras(uid, nextBody);
        res.json({ ok: true, uid });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    "/api/admin/users/:uid",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        const uid = String(req.params.uid || "").trim();
        if (!uid) {
          res.status(400).json({ error: "UID obrigatorio." });
          return;
        }

        await deleteLocalUser(uid);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/users/:uid/first-access",
    requireAuthenticated,
    requireCsrfToken,
    async (req, res, next) => {
      try {
        if (!canManageUsers(req.user)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }
        const uid = String(req.params.uid || "").trim();
        await assertCanUpdateManagedUser(req.user, uid, {});
        const temporaryPassword = await resetLocalUserPassword(uid);
        const user = await getImportedUserProfile(uid);
        const reset = await createPasswordResetToken(uid, { purpose: "first_access", req });
        let emailStatus = "nao_enviado";
        let emailError = "";
        try {
          await emailService.sendWelcomeUserEmail({
            user: {
              uid,
              email: user.email,
              display_name: user.nome || user.email,
              role: user.role,
              regional: user.regional,
            },
            resetUrl: reset.resetUrl,
          });
          emailStatus = "enviado";
        } catch (error) {
          emailStatus = "erro";
          emailError = String(error?.message || error);
        }
        res.json({ ok: true, temporaryPassword, passwordResetLink: reset.resetUrl, emailStatus, emailError });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/api-status",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await apiStatus.getApiStatus());
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/hubsoft/config",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await hubsoftIntegration.readConfig({ sanitized: true }));
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/admin/hubsoft/config",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await hubsoftIntegration.saveConfig(req.body || {}, req.user?.profile || req.user || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/hubsoft/test",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await hubsoftIntegration.testConnection());
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/hubsoft/associate",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await hubsoftIntegration.associateHubsoft(req.user?.profile || req.user || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/hubsoft/ordens-servico",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await hubsoftIntegration.searchOrdensServico(req.query || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/hubsoft/sync",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await hubsoftIntegration.startSyncJob(req.body || {}, req.user || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/cvortex/config",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await cvortexIntegration.readConfig({ sanitized: true }));
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/admin/cvortex/config",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await cvortexIntegration.saveConfig(req.body || {}, req.user?.profile || req.user || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/cvortex/test",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await cvortexIntegration.testConnection());
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/cvortex/send-test",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await cvortexIntegration.sendTestMessage(req.body || {}, req.user));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/cvortex/associate",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await cvortexIntegration.associateCvortex(req.user?.profile || req.user || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/hubsoft/sync/jobs/:jobId",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        const job = await hubsoftIntegration.getSyncJob(req.params.jobId);
        if (!job) {
          res.status(404).json({ error: "Job Hubsoft nao encontrado." });
          return;
        }
        res.json(job);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/hubsoft/sync/runs",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json({ items: await hubsoftIntegration.listSyncRuns(req.query || {}) });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/database/backups",
    requireAuthenticated,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        res.json(await databaseBackups.getBackupStatus());
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/database/backups",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        const result = await databaseBackups.createBackup({
          reason: "manual",
          user: req.user,
        });
        notificationsService.createNotification({
          type: "backup",
          title: "Backup gerado",
          message: "Backup manual do PostgreSQL concluído com sucesso.",
          targetPath: "/configuracoes/banco-de-dados",
          severity: "success",
          user: req.user?.profile || req.user || {},
          targets: { roles: ["admin"] },
          meta: { event: "backup_created", latestBackup: result.latestBackup || null },
        }).catch((error) => console.warn("[notifications] Falha ao avisar backup:", error?.message || error));
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/database/backups/:fileName/restore",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ADMIN_ROLES),
    async (req, res, next) => {
      try {
        if (String(req.body?.confirmation || "") !== "RESTAURAR BANCO") {
          res.status(400).json({ error: "Digite RESTAURAR BANCO para confirmar." });
          return;
        }

        const result = await databaseBackups.restoreBackup(req.params.fileName, {
          user: req.user,
        });
        notificationsService.createNotification({
          type: "backup",
          title: "Rollback executado",
          message: `Backup ${req.params.fileName} restaurado no PostgreSQL.`,
          targetPath: "/configuracoes/banco-de-dados",
          severity: "warning",
          user: req.user?.profile || req.user || {},
          targets: { roles: ["admin"] },
          meta: { event: "backup_restored", fileName: req.params.fileName },
        }).catch((error) => console.warn("[notifications] Falha ao avisar restore:", error?.message || error));
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/admin/regionais",
    requireAuthenticated,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        const items = await documents.listDocuments({
          collectionPath: "regionais",
          limit: 1000,
          offset: 0,
        });
        res.json({
          regionais: items
            .map((item) => ({
              id: item.documentId,
              nome: item.data?.nome || item.documentId,
            }))
            .filter((item) => item.nome)
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/integrations/sempre/equipment",
    requireAuthenticated,
    requireRoles(ESTOQUE_INTEGRADO_ROLES),
    async (req, res, next) => {
      try {
        res.json(await sempreIntegration.consultEquipment(req.query.mac));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/integrations/sempre/equipment/mapa",
    requireAuthenticated,
    requireRoles(ESTOQUE_INTEGRADO_ROLES),
    async (req, res, next) => {
      try {
        res.json(await sempreIntegration.listMapEquipments({
          limit: req.query.limit,
          page: req.query.page,
          refresh: req.query.refresh === "true",
          filters: {
            query: req.query.query,
            status: req.query.status,
            cidade: req.query.cidade,
            tecnico: req.query.tecnico,
            estoque: req.query.estoque,
            empresa: req.query.empresa,
            view: req.query.view,
          },
        }));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/integrations/sempre/equipment/treatments",
    requireAuthenticated,
    requireRoles(ESTOQUE_INTEGRADO_ROLES),
    async (req, res, next) => {
      try {
        res.json(await sempreIntegration.listEquipmentTreatments());
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/integrations/sempre/equipment/treatments",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(ESTOQUE_INTEGRADO_ROLES),
    async (req, res, next) => {
      try {
        const result = await sempreIntegration.saveEquipmentTreatment(req.body || {}, req.user);
        broadcastRealtime("estoque", result);
        broadcastRealtime("mapa", result);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/integrations/sempre/equipment/history",
    requireAuthenticated,
    requireRoles(ESTOQUE_INTEGRADO_ROLES),
    async (req, res, next) => {
      try {
        res.json(await sempreIntegration.consultHistory(req.query.mac, {
          limit: req.query.limit,
          page: req.query.page,
        }));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/logistica/config",
    requireAuthenticated,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        res.json(await logisticaIntegration.readConfig({ sanitized: true }));
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/logistica/config",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        res.json(await logisticaIntegration.saveConfig(req.body || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/logistica/lalamove/quote",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        res.json(await logisticaIntegration.requestLalamoveQuotation(req.body || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/logistica/geocode",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        res.json(await logisticaIntegration.geocodeAddress(req.body || {}));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/admin/documents",
    requireAuthenticated,
    requireCsrfToken,
    async (req, res, next) => {
      try {
        const collectionPath = String(req.body?.collectionPath || "").trim();
        if (!collectionPath) {
          res.status(400).json({ error: "collectionPath obrigatorio." });
          return;
        }
        if (!canWriteCollection(req.user, collectionPath)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }

        const documentId = String(req.body?.documentId || crypto.randomUUID()).trim();
        const path = `${collectionPath}/${documentId}`;
        const parts = path.split("/").filter(Boolean);
        const scopedRegionalData = applyRegionalScopeToData(req.user, collectionPath, req.body?.data || {});
        const data = applyEmpresaScopeToData(req.user, collectionPath, documentId, scopedRegionalData);
        await documents.upsertDocument({
          path,
          collectionPath,
          documentId,
          parentPath: parts.length > 2 ? parts.slice(0, -2).join("/") : null,
          data,
        });
        await ensureEmpresaDriveFolderIfConfigured(collectionPath, documentId, req.user);
        res.json({ ok: true, path, documentId });
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/admin/documents/*",
    requireAuthenticated,
    requireCsrfToken,
    async (req, res, next) => {
      try {
        const documentPath = req.params[0];
        const parts = documentPath.split("/").filter(Boolean);
        if (parts.length < 2 || parts.length % 2 !== 0) {
          res.status(400).json({ error: "Caminho de documento invalido." });
          return;
        }
        if (!canWriteDocumentPath(req.user, documentPath)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }

        const collectionPath = parts.slice(0, -1).join("/");
        const existing = await documents.getDocument(documentPath);
        if (
          existing &&
          isAcertoEstoqueCollection(collectionPath) &&
          !canAccessRegionalRecord(req.user, existing.data || {})
        ) {
          res.status(403).json({ error: "Supervisor so pode alterar registros da propria regional." });
          return;
        }
        if (
          existing &&
          collectionPath === EMPRESAS_COLLECTION &&
          !canAccessEmpresaRecord(req.user, existing.documentId, existing.data || {})
        ) {
          res.status(403).json({ error: "Lider Empresa so pode alterar a propria empresa." });
          return;
        }
        const requestBody = { ...(req.body || {}) };
        if (
          existing &&
          collectionPath === EMPRESAS_COLLECTION &&
          hasRole(req.user, ["supervisor"]) &&
          !hasRole(req.user, ADMIN_ROLES)
        ) {
          requestBody.supervisor = existing.data?.supervisor || {};
        }
        const scopedRegionalData = applyRegionalScopeToData(req.user, collectionPath, requestBody);
        const data = applyEmpresaScopeToData(req.user, collectionPath, parts.at(-1), scopedRegionalData);
        await documents.upsertDocument({
          path: documentPath,
          collectionPath,
          documentId: parts.at(-1),
          parentPath: parts.length > 2 ? parts.slice(0, -2).join("/") : null,
          data,
        });
        await ensureEmpresaDriveFolderIfConfigured(collectionPath, parts.at(-1), req.user);
        res.json({ ok: true, path: documentPath, documentId: parts.at(-1) });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    "/api/admin/documents/*",
    requireAuthenticated,
    requireCsrfToken,
    async (req, res, next) => {
      try {
        const documentPath = req.params[0];
        if (!canWriteDocumentPath(req.user, documentPath)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }
        const item = await documents.getDocument(documentPath);
        if (
          item &&
          isAcertoEstoqueCollection(item.collectionPath) &&
          !canAccessRegionalRecord(req.user, item.data || {})
        ) {
          res.status(403).json({ error: "Supervisor so pode excluir registros da propria regional." });
          return;
        }
        if (item && item.collectionPath === EMPRESAS_COLLECTION && isEmpresaLeader(req.user)) {
          res.status(403).json({ error: "Lider Empresa nao pode excluir empresa." });
          return;
        }
        await documents.deleteDocument(documentPath);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/imports/mapa",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        res.status(202).json(await operationalImports.createImportJob("mapa", req.body || {}, req.user));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/imports/match",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        res.status(202).json(await operationalImports.createImportJob("match", req.body || {}, req.user));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/imports/jobs/:jobId", requireAuthenticated, async (req, res, next) => {
    try {
      const job = await operationalImports.getImportJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: "Processamento nao encontrado." });
        return;
      }
      res.json(job);
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/agendamentos/clientes/:codigo",
    requireAuthenticated,
    async (req, res, next) => {
      try {
        if (!hasRole(req.user, FULL_OPERATION_ROLES)) {
          res.status(403).json({ error: "Permissao insuficiente." });
          return;
        }

        const codigo = String(req.params.codigo || "").replace(/\D/g, "");
        if (!codigo) {
          res.status(400).json({ error: "Codigo do cliente obrigatorio." });
          return;
        }

        const result = await db.query(
          `select path,
                  collection_path as "collectionPath",
                  document_id as "documentId",
                  data
             from app_documents
            where collection_path = any($2::text[])
              and (
                document_id = $1
                or data->>'codigo_cliente' = $1
                or data->>'codigo' = $1
                or data->>'cod_cliente' = $1
                or data->>'contrato' = $1
              )
            order by case collection_path
              when 'ordens_abertas' then 1
              when 'match_os_abertas' then 2
              when 'agendamentos' then 3
              else 9
            end,
            updated_at desc
            limit 1`,
          [codigo, ["ordens_abertas", "match_os_abertas", "agendamentos"]],
        );

        const cliente = normalizeAgendamentoClienteRecord(result.rows[0] || null);
        if (!cliente) {
          res.status(404).json({ error: "Cliente nao encontrado no mapa atual." });
          return;
        }

        res.json({ cliente });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/imports/metas",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        const result = await operationalImports.persistMetasImport(req.body || {}, req.user);
        broadcastRealtime("metas", result);
        broadcastRealtime("dashboard", result);
        broadcastRealtime("acompanhamento", result);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/imports/metas/forca-tarefa",
    requireAuthenticated,
    requireCsrfToken,
    requireRoles(FULL_OPERATION_ROLES),
    async (req, res, next) => {
      try {
        const result = await operationalImports.saveMetasForceTaskConfig(req.body?.config || {}, req.user);
        broadcastRealtime("metas", result);
        broadcastRealtime("dashboard", result);
        broadcastRealtime("acompanhamento", result);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/imports/match/config", requireAuthenticated, async (req, res, next) => {
    try {
      res.json(await operationalImports.getMatchConfig());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/match/config", requireAuthenticated, requireCsrfToken, requireRoles(FULL_OPERATION_ROLES), async (req, res, next) => {
    try {
      const result = await operationalImports.saveMatchConfig(req.body || {}, req.user);
      broadcastRealtime("match", result);
      broadcastRealtime("dashboard", result);
      broadcastRealtime("acompanhamento", result);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agendamento-esteira/commands", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
    try {
      res.json(await agendamentoEsteiraCommands.executeCommand(req.body || {}, req.user));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/mensageria/evolution/status", requireAuthenticated, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json({
        config: await evolutionMessaging.getConfig(),
        worker: evolutionMessaging.getStatus(),
        connection: await evolutionMessaging.getConnectionInfo(),
        accountsConnection: await evolutionMessaging.getAccountsConnectionInfo(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mensageria/evolution/connect", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await evolutionMessaging.createOrConnectInstance());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mensageria/evolution/disconnect", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await evolutionMessaging.logoutInstance());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mensageria/evolution/webhook", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      if (req.body?.webhookUrl) {
        await evolutionMessaging.saveConfigPatch({ evolutionWebhookUrl: req.body.webhookUrl });
      }
      res.json(await evolutionMessaging.configureWebhook());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/mensageria/evolution/webhook", requireAuthenticated, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await evolutionMessaging.getWebhookInfo());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mensageria/evolution/run", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await evolutionMessaging.processQueueOnce({ manual: true }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mensageria/evolution/test", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await evolutionMessaging.sendTestMessage(req.body || {}, req.user));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mensageria/evolution/pause", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      await evolutionMessaging.saveConfigPatch({ evolutionPaused: true });
      evolutionMessaging.resetNextRunAt();
      res.json({ ok: true, paused: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mensageria/evolution/resume", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      const config = await evolutionMessaging.getConfig();
      const provider = String(config.whatsappProvider || "evolution");
      await evolutionMessaging.saveConfigPatch({
        evolutionPaused: false,
        autoSend: true,
        evolutionEnabled: provider === "evolution" ? true : Boolean(config.evolutionEnabled),
        officialWhatsappEnabled: provider === "official_whatsapp" ? true : Boolean(config.officialWhatsappEnabled),
        zapiEnabled: provider === "zapi" ? true : Boolean(config.zapiEnabled),
      });
      evolutionMessaging.wakeQueueWorker();
      res.json({ ok: true, paused: false, autoSend: true, worker: evolutionMessaging.getStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agendamentos/confirmacao/config", requireAuthenticated, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json({ ok: true, config: await agendamentoConfirmacao.getConfig(), worker: await agendamentoConfirmacao.getStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agendamentos/confirmacao/config", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json({ ok: true, config: await agendamentoConfirmacao.saveConfig(req.body || {}) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agendamentos/confirmacao/run", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.processOnce({ forceMorning: req.body?.forceMorning === true }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agendamentos/confirmacao/test", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.sendTestMessage(req.body || {}, req.user?.profile || req.user || {}));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agendamentos/confirmacao/evolution/status", requireAuthenticated, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.getEvolutionStatus());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agendamentos/confirmacao/evolution/connect", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.connectEvolutionInstance());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agendamentos/confirmacao/evolution/disconnect", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.disconnectEvolutionInstance());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agendamentos/confirmacao/evolution/webhook", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.configureEvolutionWebhook(req.body?.webhookUrl || ""));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agendamentos/confirmacao/envios/:id/responsavel", requireAuthenticated, requireCsrfToken, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.assignManualResponsible(req.params.id, req.body || {}, req.user?.profile || req.user || {}));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agendamentos/confirmacao/envios", requireAuthenticated, requireRoles(FULL_OPERATION_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.listTracks({ limit: req.query.limit, offset: req.query.offset }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agendamentos/confirmacao/logs", requireAuthenticated, requireRoles(FULL_OPERATION_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.listLogs({ limit: req.query.limit, offset: req.query.offset }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agendamentos/confirmacao/preview", requireAuthenticated, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.getPreview({ dateKey: req.query.dateKey, daysAhead: req.query.daysAhead }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agendamentos/confirmacao/relatorio", requireAuthenticated, requireRoles(ADMIN_ROLES), async (req, res, next) => {
    try {
      res.json(await agendamentoConfirmacao.getReport());
    } catch (error) {
      next(error);
    }
  });

  async function handleEvolutionWebhook(req, res, next) {
    try {
      if (!verifyWebhookSecret(req, res, "EVOLUTION_WEBHOOK_SECRET", "Evolution")) {
        return;
      }
      const confirmationResult = await agendamentoConfirmacao.registerIncomingResponse(req.body || {}).catch((error) => {
        console.warn("[confirmacao-agendamentos] Falha ao processar resposta:", error?.message || error);
        return null;
      });
      if (confirmationResult?.confirmed) {
        res.json({ ok: true, confirmation: confirmationResult });
        return;
      }
      const result = await evolutionMessaging.registerCallback({
        ...(req.body || {}),
        webhookEvent: req.params?.event || req.body?.event || "",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  app.post("/api/webhooks/evolution", handleEvolutionWebhook);
  app.post("/api/webhooks/evolution/:event", handleEvolutionWebhook);

  async function handleEvolutionConfirmationWebhook(req, res, next) {
    try {
      if (!verifyWebhookSecret(req, res, "EVOLUTION_CONFIRMATION_WEBHOOK_SECRET", "Evolution confirmação")) {
        return;
      }
      const confirmationResult = await agendamentoConfirmacao.registerIncomingResponse(req.body || {});
      res.json({ ok: true, confirmation: confirmationResult });
    } catch (error) {
      next(error);
    }
  }

  app.post("/api/webhooks/evolution-confirmacao", handleEvolutionConfirmationWebhook);
  app.post("/api/webhooks/evolution-confirmacao/:event", handleEvolutionConfirmationWebhook);

  app.post("/api/webhooks/cvortex", async (req, res, next) => {
    try {
      const verification = await cvortexIntegration.verifyWebhookSecret(req);
      if (!verification.ok) {
        res.status(401).json({ error: "Webhook Cvortex não autorizado." });
        return;
      }
      const result = await evolutionMessaging.registerCallback({
        ...(req.body || {}),
        webhookEvent: req.body?.event || req.body?.type || "cvortex",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/webhooks/zapi", async (req, res, next) => {
    try {
      if (!verifyWebhookSecret(req, res, "ZAPI_WEBHOOK_SECRET", "Z-API")) {
        return;
      }
      const confirmationResult = await agendamentoConfirmacao.registerIncomingResponse(req.body || {}).catch((error) => {
        console.warn("[confirmacao-agendamentos] Falha ao processar resposta:", error?.message || error);
        return null;
      });
      if (confirmationResult?.confirmed) {
        res.json({ ok: true, confirmation: confirmationResult });
        return;
      }
      const result = await evolutionMessaging.registerCallback({
        ...(req.body || {}),
        webhookEvent: req.body?.type || req.body?.event || "zapi",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/webhooks/whatsapp-official", async (req, res, next) => {
    try {
      const config = await evolutionMessaging.getConfig();
      const expectedToken = String(process.env.WHATSAPP_OFFICIAL_VERIFY_TOKEN || config.officialWebhookVerifyToken || "");
      const mode = String(req.query["hub.mode"] || "");
      const token = String(req.query["hub.verify_token"] || "");
      const challenge = String(req.query["hub.challenge"] || "");
      if (mode === "subscribe" && expectedToken && token === expectedToken) {
        res.status(200).send(challenge);
        return;
      }
      res.status(403).json({ error: "Webhook oficial nao autorizado." });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/webhooks/whatsapp-official", async (req, res, next) => {
    try {
      if (!verifyWebhookSecret(req, res, "WHATSAPP_OFFICIAL_WEBHOOK_SECRET", "WhatsApp Oficial")) {
        return;
      }
      res.json(await evolutionMessaging.registerCallback({
        ...(req.body || {}),
        webhookEvent: "whatsapp_official",
      }));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/static/:domain", requireInternalToken, async (req, res, next) => {
    try {
      const domain = String(req.params.domain || "").trim();
      if (!domain) {
        res.status(400).json({ error: "Dominio obrigatorio." });
        return;
      }

      await db.query(
        `insert into static_snapshots (domain, data, generated_at)
         values ($1, $2::jsonb, now())
         on conflict (domain) do update set
           data = excluded.data,
           generated_at = excluded.generated_at`,
        [domain, JSON.stringify(req.body || {})],
      );
      broadcastRealtime(domain);
      broadcastRealtime("dashboard", { domain });
      broadcastRealtime("acompanhamento", { domain });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/documents/*", requireInternalToken, async (req, res, next) => {
    try {
      const documentPath = req.params[0];
      const parts = documentPath.split("/").filter(Boolean);
      if (parts.length < 2 || parts.length % 2 !== 0) {
        res.status(400).json({ error: "Caminho de documento invalido." });
        return;
      }

      await documents.upsertDocument({
        path: documentPath,
        collectionPath: parts.slice(0, -1).join("/"),
        documentId: parts.at(-1),
        parentPath: parts.length > 2 ? parts.slice(0, -2).join("/") : null,
        data: req.body || {},
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    console.error("[api]", error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Erro interno." });
  });

  return app;
}

module.exports = {
  createApp,
};
