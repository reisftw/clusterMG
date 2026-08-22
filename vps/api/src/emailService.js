const nodemailer = require("nodemailer");
const db = require("./db");
const documents = require("./documents");
const { randomId } = require("./secureRandom");

const CONFIG_PATH = "system_email_config/global";
const LOG_COLLECTION = "system_email_logs";

const DEFAULT_EMAIL_TEMPLATES = {
  welcome_user: {
    label: "Criação de conta",
    subject: "Seu acesso ao sistema Retiradas",
    title: "Bem-vindo ao Retiradas",
    preview: "Sua conta no sistema Retiradas foi criada. Defina sua senha para começar.",
    actionLabel: "Definir minha senha",
    body:
      "Olá, {nome}.\n\nSua conta foi criada no sistema Retiradas. Para ativar o acesso com segurança, defina sua senha pelo botão abaixo.\n\nE-mail: {email}\nPerfil: {role}\nRegional: {regional}\n\nO link expira em 30 minutos.",
  },
  password_reset: {
    label: "Redefinição de senha",
    subject: "Redefinição de senha - Retiradas",
    title: "Redefinição de senha",
    preview: "Use o link seguro para redefinir sua senha.",
    actionLabel: "Redefinir minha senha",
    body:
      "Olá, {nome}.\n\nRecebemos uma solicitação para redefinir a senha da sua conta.\n\nClique no botão abaixo para criar uma nova senha. O link expira em 30 minutos.",
  },
  password_changed: {
    label: "Senha alterada",
    subject: "Senha alterada - Retiradas",
    title: "Senha alterada com sucesso",
    preview: "Sua senha foi alterada com sucesso.",
    actionLabel: "",
    body:
      "Olá, {nome}.\n\nSua senha do sistema Retiradas foi alterada com sucesso.\n\nSe você não reconhece esta ação, avise a administração.",
  },
  mfa_login_code: {
    label: "Código MFA por e-mail",
    subject: "Código de segurança - Retiradas",
    title: "Confirme seu acesso",
    preview: "Use o código de segurança para concluir o login.",
    actionLabel: "",
    body:
      "Olá, {nome}.\n\nRecebemos uma tentativa de login na sua conta do sistema Retiradas.\n\nSeu código de segurança é: {codigo}\n\nEste código expira em {minutos} minutos. Se você não reconhece esta tentativa, avise a administração.",
  },
  smtp_test: {
    label: "Teste SMTP",
    subject: "Teste de e-mail - Retiradas",
    title: "E-mail configurado com sucesso",
    preview: "O SMTP do sistema Retiradas está funcionando.",
    actionLabel: "",
    body:
      "Este e-mail confirma que o SMTP está autenticando e enviando mensagens pelo sistema Retiradas.\n\nRemetente: {fromEmail}\nResponder para: {replyTo}",
  },
  system_notice: {
    label: "Aviso do sistema",
    subject: "Aviso do sistema Retiradas",
    title: "Aviso importante",
    preview: "Comunicado automático do sistema Retiradas.",
    actionLabel: "Acessar sistema",
    body:
      "Olá, {nome}.\n\nEste é um aviso automático do sistema Retiradas.\n\nMensagem: {mensagem}\n\nAcesse o sistema para acompanhar os detalhes.",
  },
  insumos_low_stock: {
    label: "Estoque baixo de insumo",
    subject: "Estoque baixo: {produto}",
    title: "Estoque baixo identificado",
    preview: "{produto} chegou ao estoque baixo.",
    actionLabel: "Abrir insumos",
    body:
      "Olá, {nome}.\n\nO sistema identificou que o item {produto} chegou ao nível de estoque baixo.\n\nEstoque atual: {estoque_atual} {unidade}\nEstoque mínimo: {estoque_minimo} {unidade}\nCategoria: {categoria}\nObservação: {observacao}\n\nRevise a necessidade de compra ou reposição para evitar falta do material.",
  },
  insumos_request_approved: {
    label: "Requisição de insumo aprovada",
    subject: "Requisição aprovada: {protocolo}",
    title: "Sua requisição foi aprovada",
    preview: "O material solicitado foi reservado por 24 horas para retirada.",
    actionLabel: "Abrir requisição",
    body:
      "Olá, {nome}.\n\nSua requisição de insumo foi aprovada e o material já está reservado para retirada.\n\nProtocolo: {protocolo}\nItem: {produto}\nQuantidade: {quantidade} {unidade}\nAprovado por: {aprovado_por}\nPrazo para retirada: {prazo}\n\nImportante: se o item não for retirado em até 24 horas, a requisição será encerrada automaticamente e o material voltará ao estoque.",
  },
};

const DEFAULT_CONFIG = {
  enabled: true,
  smtpHost: process.env.SMTP_HOST || "smtp.hostinger.com",
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
  smtpUser: process.env.SMTP_USER || "administracao@retiradas.tech",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  fromName: process.env.SMTP_FROM_NAME || "Retiradas",
  fromEmail: process.env.SMTP_FROM_EMAIL || "naoresponda@retiradas.tech",
  replyTo: process.env.SMTP_REPLY_TO || "administracao@retiradas.tech",
  appUrl: process.env.PUBLIC_APP_URL || "https://retiradas.tech",
  mfaEmailEnabled: String(process.env.MFA_EMAIL_ENABLED || "false").toLowerCase() === "true",
  mfaEmailTtlMinutes: Number(process.env.MFA_EMAIL_TTL_MINUTES || 10),
  templates: DEFAULT_EMAIL_TEMPLATES,
};

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeTemplates(templates = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_EMAIL_TEMPLATES).map(([key, defaults]) => [
      key,
      {
        ...defaults,
        ...(templates?.[key] || {}),
        label: defaults.label,
      },
    ])
  );
}

function renderVariables(value, variables = {}) {
  return String(value || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const resolved = variables[key];
    return resolved === undefined || resolved === null || resolved === "" ? "-" : String(resolved);
  });
}

function textToHtml(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function safeUrl(value) {
  return escapeHtml(String(value || ""));
}

const emailTheme = {
  colors: {
    navy: "#061B41",
    blue: "#074ACB",
    blueLight: "#EFF6FF",
    orange: "#FF6A00",
    orangeLight: "#FF8A00",
    text: "#17233D",
    secondaryText: "#667085",
    background: "#F1F5F9",
    white: "#FFFFFF",
    success: "#12B76A",
  },
  radius: {
    card: "22px",
    button: "12px",
    info: "12px",
  },
};

function iconForType(type = "") {
  const key = String(type || "").toLowerCase();
  if (key === "email") return "&#9993;";
  if (key === "location") return "&#9679;";
  if (key === "role") return "&#9733;";
  if (key === "security") return "&#128737;";
  if (key === "success") return "&#10003;";
  return "&#8226;";
}

function renderUserInfo(userInfo = []) {
  const items = Array.isArray(userInfo) ? userInfo.filter((item) => item?.label) : [];
  if (!items.length) return "";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 4px">
      ${items.map((item) => `
        <tr>
          <td width="42" valign="top" style="padding:7px 12px 7px 0">
            <div style="width:34px;height:34px;border-radius:999px;background:${emailTheme.colors.blueLight};color:${emailTheme.colors.blue};font-size:16px;line-height:34px;text-align:center;font-weight:700">${iconForType(item.type)}</div>
          </td>
          <td valign="middle" style="padding:7px 0;font-size:14px;line-height:1.55;color:${emailTheme.colors.text}">
            <strong style="color:${emailTheme.colors.text}">${escapeHtml(item.label)}:</strong>
            <span style="color:${emailTheme.colors.secondaryText}">${escapeHtml(item.value || "-")}</span>
          </td>
        </tr>
      `).join("")}
    </table>`;
}

function renderSecurityIllustration(variant = "security") {
  const isSuccess = variant === "success";
  const icon = isSuccess ? "&#10003;" : "&#128274;";
  const accent = isSuccess ? emailTheme.colors.success : emailTheme.colors.blue;
  return `
    <td class="security-illustration" valign="top" width="150" style="padding-left:24px">
      <table role="presentation" width="150" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding-top:4px">
            <div style="width:118px;height:118px;border-radius:999px;background:linear-gradient(135deg,#EFF6FF,#FFFFFF);border:1px solid #DBEAFE;box-shadow:0 18px 38px rgba(23,92,211,.14);text-align:center">
              <div style="margin:18px auto 0;width:76px;height:76px;border-radius:999px;background:${accent};color:#ffffff;font-size:34px;line-height:76px;text-align:center;box-shadow:0 12px 26px rgba(7,74,203,.24)">${icon}</div>
            </div>
          </td>
        </tr>
      </table>
    </td>`;
}

function renderInfoBox(infoBox) {
  const value = String(infoBox || "").trim();
  if (!value) return "";
  const highlighted = escapeHtml(value)
    .replace(/(30 minutos|10 minutos|24 horas)/gi, '<strong style="color:#175CD3">$1</strong>');
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:${emailTheme.radius.info}">
      <tr>
        <td width="38" valign="top" style="padding:13px 0 13px 15px;color:#175CD3;font-size:17px">&#9716;</td>
        <td style="padding:13px 15px 13px 8px;color:#17233D;font-size:14px;line-height:1.55">${highlighted}</td>
      </tr>
    </table>`;
}

function createEmailTemplate({
  title,
  eyebrow = "RETIRADAS",
  preheader = "",
  greeting = "",
  message = "",
  messageHtml = "",
  userInfo = [],
  infoBox = "",
  buttonText = "",
  buttonUrl = "",
  footerText = "Este e-mail foi enviado automaticamente pelo sistema Retiradas.",
  showSecurityIllustration = false,
  variant = "security",
  appUrl = DEFAULT_CONFIG.appUrl,
  logoUrl = "",
  theme = emailTheme,
} = {}) {
  const safeTitle = escapeHtml(title || "Retiradas");
  const safePreheader = escapeHtml(preheader || title || "Sistema Retiradas");
  const resolvedLogoUrl = logoUrl || `${String(appUrl || DEFAULT_CONFIG.appUrl).replace(/\/+$/, "")}/cluster-mg.png`;
  const bodyMessage = messageHtml || textToHtml(message);
  const action = buttonUrl
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:30px 0 0">
        <tr>
          <td align="center">
            <a href="${safeUrl(buttonUrl)}" style="display:block;max-width:430px;background:linear-gradient(135deg,${theme.colors.orange},${theme.colors.orangeLight});color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;line-height:56px;border-radius:${theme.radius.button};box-shadow:0 16px 32px rgba(255,106,0,.24)">
              <span style="font-size:15px">&#128274;</span>&nbsp; ${escapeHtml(buttonText || "Acessar")} &nbsp;<span style="font-size:22px;line-height:0">&#8250;</span>
            </a>
          </td>
        </tr>
      </table>`
    : "";
  const alternativeLink = buttonUrl
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0 0;border-top:1px solid #E4E7EC">
        <tr><td style="height:18px;line-height:18px">&nbsp;</td></tr>
        <tr>
          <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:15px 17px">
            <div style="font-size:13px;line-height:1.55;color:#475467"><span style="color:#175CD3;font-weight:800">&#128279;</span> Se o botão não funcionar, copie e cole este link no navegador:</div>
            <a href="${safeUrl(buttonUrl)}" style="display:block;margin-top:8px;color:#175CD3;font-size:12px;line-height:1.55;text-decoration:none;word-break:break-all;overflow-wrap:anywhere">${escapeHtml(buttonUrl)}</a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${safeTitle}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-outer { padding: 0 !important; }
      .email-card { width: 100% !important; border-radius: 0 !important; }
      .email-header { padding: 26px 22px !important; }
      .email-title { font-size: 28px !important; }
      .email-logo-cell { display: block !important; width: 100% !important; padding: 20px 0 0 !important; text-align: left !important; }
      .email-logo { width: 150px !important; max-width: 150px !important; }
      .email-content { padding: 26px 20px !important; }
      .security-illustration { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;background:${theme.colors.background};font-family:Arial,Helvetica,sans-serif;color:${theme.colors.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px">${safePreheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-outer" style="background:${theme.colors.background};padding:34px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" class="email-card" style="width:680px;max-width:680px;background:${theme.colors.white};border-radius:${theme.radius.card};overflow:hidden;box-shadow:0 22px 60px rgba(15,35,72,.10);border:1px solid #E2E8F0">
          <tr>
            <td class="email-header" style="padding:36px 42px;background:${theme.colors.navy};background-image:linear-gradient(135deg,#061B41 0%,#074ACB 58%,#FF6A00 100%);color:#ffffff">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle">
                    <div style="font-size:11px;line-height:1;font-weight:800;letter-spacing:4px;color:#FFB36B;text-transform:uppercase">${escapeHtml(eyebrow)}</div>
                    <div style="margin-top:12px;width:74px;height:4px;border-radius:99px;background:linear-gradient(90deg,#FF6A00,#FFFFFF,#2D7DFF)">&nbsp;</div>
                    <h1 class="email-title" style="margin:20px 0 0;font-size:34px;line-height:1.12;font-weight:800;color:#ffffff">${safeTitle}</h1>
                  </td>
                  <td class="email-logo-cell" valign="middle" align="right" width="210" style="padding-left:24px">
                    <img class="email-logo" src="${safeUrl(resolvedLogoUrl)}" width="190" alt="CLUSTER MG" style="display:block;width:190px;max-width:190px;height:auto;border:0;outline:none;text-decoration:none;border-radius:14px">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-content" style="padding:40px 55px;background:#ffffff">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="top">
                    ${greeting ? `<p style="margin:0 0 14px;font-size:20px;line-height:1.45;font-weight:700;color:${theme.colors.text}">${escapeHtml(greeting)}</p>` : ""}
                    <div style="font-size:15px;line-height:1.75;color:#344054">${bodyMessage}</div>
                    ${renderUserInfo(userInfo)}
                    ${renderInfoBox(infoBox)}
                  </td>
                  ${showSecurityIllustration ? renderSecurityIllustration(variant) : ""}
                </tr>
              </table>
              ${action}
              ${alternativeLink}
            </td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E4E7EC;padding:20px 34px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="36" valign="top">
                    <div style="width:28px;height:28px;border-radius:999px;background:#EFF6FF;color:#175CD3;text-align:center;line-height:28px;font-size:15px">&#128737;</div>
                  </td>
                  <td style="font-size:12px;line-height:1.6;color:${theme.colors.secondaryText}">
                    ${escapeHtml(footerText)}<br>
                    Se você não reconhece esta ação, avise a administração.<br>
                    © Sistema Retiradas
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function parseConfiguredBody(text, templateKey) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  let greeting = "";
  const messageLines = [];
  let infoBox = "";
  lines.forEach((line) => {
    if (!line) {
      messageLines.push("");
      return;
    }
    if (!greeting && /^ol[áa],?/i.test(line)) {
      greeting = line;
      return;
    }
    if (/^e-?mail\s*:/i.test(line) || /^perfil\s*:/i.test(line) || /^regional\s*:/i.test(line)) return;
    if (/expira|válido|valido/i.test(line) && !infoBox) {
      infoBox = line;
      return;
    }
    messageLines.push(line);
  });
  const message = messageLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!infoBox && ["welcome_user", "password_reset"].includes(templateKey)) {
    infoBox = "O link expira em 30 minutos.";
  }
  return { greeting, message, infoBox };
}

function userInfoForTemplate(templateKey, variables = {}) {
  if (templateKey === "welcome_user") {
    return [
      { label: "E-mail", value: variables.email, type: "email" },
      { label: "Perfil", value: variables.role, type: "role" },
      { label: "Regional", value: variables.regional, type: "location" },
    ];
  }
  if (templateKey === "password_reset" || templateKey === "password_changed") {
    return [{ label: "E-mail", value: variables.email, type: "email" }];
  }
  if (templateKey === "mfa_login_code") {
    return [
      { label: "E-mail", value: variables.email, type: "email" },
      { label: "Código", value: variables.codigo, type: "security" },
      { label: "Validade", value: `${variables.minutos || 10} minutos`, type: "security" },
    ];
  }
  if (templateKey === "insumos_low_stock") {
    return [
      { label: "Item", value: variables.produto, type: "success" },
      { label: "Estoque atual", value: `${variables.estoque_atual || "-"} ${variables.unidade || ""}`.trim(), type: "role" },
      { label: "Estoque mínimo", value: `${variables.estoque_minimo || "-"} ${variables.unidade || ""}`.trim(), type: "security" },
      { label: "Categoria", value: variables.categoria || "-", type: "location" },
      { label: "Observação", value: variables.observacao || "-", type: "email" },
    ];
  }
  return [];
}

async function getConfig() {
  const doc = await documents.getDocument(CONFIG_PATH).catch(() => null);
  const data = doc?.data || {};
  return {
    ...DEFAULT_CONFIG,
    ...data,
    smtpPassword: data.smtpPassword || DEFAULT_CONFIG.smtpPassword,
    smtpPort: Number(data.smtpPort || DEFAULT_CONFIG.smtpPort),
    smtpSecure: Boolean(data.smtpSecure ?? DEFAULT_CONFIG.smtpSecure),
    mfaEmailEnabled: Boolean(data.mfaEmailEnabled ?? DEFAULT_CONFIG.mfaEmailEnabled),
    mfaEmailTtlMinutes: Number(data.mfaEmailTtlMinutes || DEFAULT_CONFIG.mfaEmailTtlMinutes),
    templates: normalizeTemplates(data.templates),
  };
}

function sanitizeConfig(config) {
  const { smtpPassword, ...safe } = config || {};
  return { ...safe, hasPassword: Boolean(smtpPassword) };
}

async function saveConfig(patch = {}) {
  const current = await getConfig();
  const next = {
    ...current,
    ...patch,
    smtpPassword: patch.smtpPassword || current.smtpPassword || "",
    mfaEmailEnabled: Boolean(patch.mfaEmailEnabled ?? current.mfaEmailEnabled),
    mfaEmailTtlMinutes: Math.max(3, Math.min(30, Number(patch.mfaEmailTtlMinutes || current.mfaEmailTtlMinutes || 10))),
    templates: normalizeTemplates(patch.templates || current.templates),
    updatedAt: nowIso(),
  };
  await documents.upsertDocument({
    path: CONFIG_PATH,
    collectionPath: "system_email_config",
    documentId: "global",
    parentPath: null,
    data: next,
  });
  return sanitizeConfig(next);
}

function ensureConfig(config) {
  if (!config.enabled) throw new Error("Envio de e-mail desativado.");
  if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPassword) {
    throw new Error("SMTP incompleto. Configure host, porta, usuario e senha.");
  }
  if (!config.fromEmail) throw new Error("E-mail remetente nao configurado.");
}

function createTransport(config) {
  ensureConfig(config);
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort),
    secure: Boolean(config.smtpSecure),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
  });
}

function renderConfiguredEmail(config, templateKey, variables = {}) {
  const template = normalizeTemplates(config.templates)[templateKey] || DEFAULT_EMAIL_TEMPLATES[templateKey];
  const resolvedVariables = {
    appUrl: config.appUrl || DEFAULT_CONFIG.appUrl,
    fromEmail: config.fromEmail || DEFAULT_CONFIG.fromEmail,
    replyTo: config.replyTo || DEFAULT_CONFIG.replyTo,
    ...variables,
  };
  const actionUrl = ["welcome_user", "password_reset", "system_notice", "insumos_low_stock", "insumos_request_approved"].includes(templateKey)
    ? renderVariables("{resetUrl}", resolvedVariables)
    : "";
  const actionLabel = renderVariables(template.actionLabel, resolvedVariables);
  const subject = renderVariables(template.subject, resolvedVariables);
  const text = renderVariables(template.body, resolvedVariables);
  const parsed = parseConfiguredBody(text, templateKey);
  const isSecurityEmail = ["welcome_user", "password_reset", "password_changed", "mfa_login_code"].includes(templateKey);
  const variant = templateKey === "password_changed" ? "success" : "security";

  return {
    subject,
    html: createEmailTemplate({
      title: renderVariables(template.title, resolvedVariables),
      preheader: renderVariables(template.preview, resolvedVariables),
      greeting: parsed.greeting,
      message: parsed.message,
      userInfo: userInfoForTemplate(templateKey, resolvedVariables),
      infoBox: parsed.infoBox,
      buttonText: actionLabel,
      buttonUrl: actionUrl && actionUrl !== "-" ? actionUrl : "",
      showSecurityIllustration: isSecurityEmail,
      variant,
      appUrl: resolvedVariables.appUrl,
    }),
    text: actionUrl && actionUrl !== "-" ? `${text}\n\n${actionLabel || "Acessar"}: ${actionUrl}` : text,
  };
}

async function logEmail({ to, subject, status, error = "", meta = {} }) {
  const id = randomId("email");
  const normalizedMeta = meta && typeof meta === "object" ? meta : {};
  await db.query(
    `insert into email_logs (
       id, type, to_email, subject, status, error_message, provider_message_id, meta, created_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
    [
      id,
      String(normalizedMeta.type || normalizedMeta.template || "system_notice"),
      String(to || ""),
      String(subject || ""),
      String(status || ""),
      String(error || ""),
      String(normalizedMeta.messageId || ""),
      JSON.stringify(normalizedMeta),
    ],
  ).catch(() => null);
  await documents.upsertDocument({
    path: `${LOG_COLLECTION}/${id}`,
    collectionPath: LOG_COLLECTION,
    documentId: id,
    parentPath: null,
    data: { id, to, subject, status, error, meta: normalizedMeta, createdAt: nowIso() },
  }).catch(() => null);
}

function normalizePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function listEmailLogs({ limit = 20, offset = 0, status = "", type = "", q = "" } = {}) {
  const safeLimit = normalizePositiveInt(limit, 20, 100);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
  const params = [];
  const where = [];

  if (status) {
    params.push(String(status));
    where.push(`status = $${params.length}`);
  }

  if (type) {
    params.push(String(type));
    where.push(`type = $${params.length}`);
  }

  if (q) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(to_email ilike $${params.length} or subject ilike $${params.length} or error_message ilike $${params.length})`);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const countResult = await db.query(`select count(*)::int as total from email_logs ${whereSql}`, params);

  params.push(safeLimit, safeOffset);
  const result = await db.query(
    `select id, type, to_email as "to", subject, status, error_message as "error",
            provider_message_id as "messageId", meta, created_at as "createdAt"
       from email_logs
       ${whereSql}
      order by created_at desc
      limit $${params.length - 1}
     offset $${params.length}`,
    params,
  );

  return {
    items: result.rows,
    total: countResult.rows[0]?.total || 0,
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function sendMail({ to, subject, html, text = "", meta = {}, attachments = [] }) {
  const config = await getConfig();
  const transporter = createTransport(config);
  const from = `${config.fromName || "Retiradas"} <${config.fromEmail}>`;
  try {
    const response = await transporter.sendMail({
      from,
      to,
      replyTo: config.replyTo || config.fromEmail,
      subject,
      html,
      text,
      attachments,
    });
    await logEmail({ to, subject, status: "enviado", meta: { ...meta, messageId: response.messageId || "" } });
    return { ok: true, messageId: response.messageId || "" };
  } catch (error) {
    await logEmail({ to, subject, status: "erro", error: String(error?.message || error), meta });
    throw error;
  }
}

async function sendWelcomeUserEmail({ user, resetUrl }) {
  const config = await getConfig();
  const rendered = renderConfiguredEmail(config, "welcome_user", {
    nome: user.display_name || user.nome || user.email,
    email: user.email,
    role: user.role || "-",
    regional: user.regional || "-",
    resetUrl,
  });
  return sendMail({
    to: user.email,
    ...rendered,
    meta: { type: "welcome_user", uid: user.uid },
  });
}

async function sendPasswordResetEmail({ user, resetUrl }) {
  const config = await getConfig();
  const rendered = renderConfiguredEmail(config, "password_reset", {
    nome: user.display_name || user.nome || user.email,
    email: user.email,
    resetUrl,
  });
  return sendMail({
    to: user.email,
    ...rendered,
    meta: { type: "password_reset", uid: user.uid },
  });
}

async function sendPasswordChangedEmail({ user }) {
  const config = await getConfig();
  const rendered = renderConfiguredEmail(config, "password_changed", {
    nome: user.display_name || user.nome || user.email,
    email: user.email,
  });
  return sendMail({
    to: user.email,
    ...rendered,
    meta: { type: "password_changed", uid: user.uid },
  });
}

async function sendMfaLoginCodeEmail({ user, code, ttlMinutes = 10 }) {
  const config = await getConfig();
  const rendered = renderConfiguredEmail(config, "mfa_login_code", {
    nome: user.display_name || user.nome || user.email,
    email: user.email,
    codigo: code,
    minutos: ttlMinutes,
  });
  return sendMail({
    to: user.email,
    ...rendered,
    meta: { type: "mfa_login_code", uid: user.uid },
  });
}

async function sendInsumosLowStockEmail({ to, produto = {}, recipients = [] }) {
  const config = await getConfig();
  const appUrl = String(config.appUrl || DEFAULT_CONFIG.appUrl || "https://retiradas.tech").replace(/\/+$/, "");
  const rendered = renderConfiguredEmail(config, "insumos_low_stock", {
    nome: recipients.length === 1 ? recipients[0]?.displayName || recipients[0]?.nome || "Supervisor Administrativo" : "equipe administrativa",
    produto: produto.nome || "Insumo administrativo",
    estoque_atual: produto.estoqueAtual,
    estoque_minimo: produto.estoqueMinimo,
    unidade: produto.unidade || "unidade",
    categoria: produto.categoria || "-",
    observacao: produto.observacao || "-",
    resetUrl: `${appUrl}/administrativo/insumos`,
  });
  return sendMail({
    to,
    ...rendered,
    meta: {
      type: "insumos_low_stock",
      documentPath: produto.documentPath || "",
      documentId: produto.documentId || "",
      produtoNome: produto.nome || "",
      estoqueAtual: produto.estoqueAtual,
      estoqueMinimo: produto.estoqueMinimo,
      unidade: produto.unidade || "",
      recipients,
    },
  });
}

async function sendInsumosRequestApprovedEmail({ to, requisicao = {} }) {
  const config = await getConfig();
  const appUrl = String(config.appUrl || DEFAULT_CONFIG.appUrl || "https://retiradas.tech").replace(/\/+$/, "");
  const prazo = requisicao.expira_em
    ? new Date(requisicao.expira_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "24 horas";
  const rendered = renderConfiguredEmail(config, "insumos_request_approved", {
    nome: requisicao.solicitante_nome || requisicao.solicitante_email || "solicitante",
    protocolo: requisicao.protocolo || "-",
    produto: requisicao.produto_nome || "Insumo",
    quantidade: requisicao.quantidade || "-",
    unidade: requisicao.unidade || "",
    aprovado_por: requisicao.aprovado_por_nome || "-",
    prazo,
    resetUrl: `${appUrl}/administrativo/insumos/requisicoes`,
  });
  return sendMail({
    to,
    ...rendered,
    meta: {
      type: "insumos_request_approved",
      requisicaoId: requisicao.id || "",
      protocolo: requisicao.protocolo || "",
      produtoNome: requisicao.produto_nome || "",
      quantidade: requisicao.quantidade || "",
    },
  });
}

async function sendTestEmail(to) {
  const config = await getConfig();
  const target = String(to || config.replyTo || config.smtpUser || "").trim();
  if (!target) throw new Error("Informe um e-mail para teste.");
  const sampleVariables = {
    nome: "Usuario Teste",
    email: target,
    role: "admin",
    regional: "METROPOLITANA",
    resetUrl: `${config.appUrl || DEFAULT_CONFIG.appUrl}/redefinir-senha?token=exemplo`,
    mensagem: "Este e um exemplo de comunicado para validar o layout do e-mail.",
    codigo: "123456",
    minutos: config.mfaEmailTtlMinutes || 10,
  };
  const results = [];
  for (const templateKey of Object.keys(DEFAULT_EMAIL_TEMPLATES)) {
    const rendered = renderConfiguredEmail(config, templateKey, sampleVariables);
    const result = await sendMail({
      to: target,
      ...rendered,
      meta: { type: templateKey, preview: true },
    });
    results.push({ type: templateKey, ...result });
  }
  return { ok: true, sent: results.length, results };
}

module.exports = {
  createEmailTemplate,
  emailTheme,
  getConfig,
  sanitizeConfig,
  saveConfig,
  listEmailLogs,
  sendMail,
  sendInsumosLowStockEmail,
  sendInsumosRequestApprovedEmail,
  sendMfaLoginCodeEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendTestEmail,
  sendWelcomeUserEmail,
};
