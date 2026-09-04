const nodemailer = require("nodemailer");
const fs = require("node:fs");
const path = require("node:path");
const db = require("../db");
const { randomId } = require("../secureRandom");

const EMAIL_LOGO_CID = "sempre-logo-finan";
const EMAIL_LOGO_PATH = path.resolve(
	__dirname,
	"../../../frontend/public/sempre-logo-branca-crop.png",
);

const DEFAULT_EMAIL_TEMPLATES = {
	password_reset: {
		label: "Redefinição de senha",
		subject: "Redefinição de senha - Finan",
		title: "Redefinição de senha",
		preview: "Use o link seguro para redefinir sua senha.",
		actionLabel: "Redefinir minha senha",
		body: "Olá, {nome}.\n\nRecebemos uma solicitação para redefinir a senha da sua conta no Finan.\n\nClique no botão abaixo para criar uma nova senha. O link expira em 30 minutos.",
	},
	mfa_login_code: {
		label: "Código MFA por e-mail",
		subject: "Código de segurança - Finan",
		title: "Confirme seu acesso",
		preview: "Use o código de segurança para concluir o login.",
		actionLabel: "",
		body: "Olá, {nome}.\n\nRecebemos uma tentativa de login na sua conta do Finan.\n\nSeu código de segurança é: {codigo}\n\nEste código expira em {minutos} minutos. Se você não reconhece esta tentativa, avise a administração.",
	},
	welcome_first_access: {
		label: "Boas-vindas / Primeiro acesso",
		subject: "Bem-vindo ao Finan - Sempre Internet",
		title: "Seu acesso ao Finan foi criado",
		preview: "Confira seus dados de primeiro acesso ao Finan.",
		actionLabel: "Acessar o Finan",
		body: "Olá, {nome}.\n\nSeu acesso ao Finan - Gestão Financeira Sempre Internet foi criado.\n\nE-mail: {email}\nSenha temporária: {temporaryPassword}\n\nNo primeiro acesso, use essa senha temporária e siga o fluxo de segurança do sistema.",
	},
	smtp_test: {
		label: "Teste SMTP",
		subject: "Teste de e-mail - Finan",
		title: "E-mail configurado com sucesso",
		preview: "O SMTP do Finan está funcionando.",
		actionLabel: "Abrir Finan",
		body: "Este e-mail confirma que o SMTP está autenticando e enviando mensagens pelo Finan.\n\nRemetente: {fromEmail}\nResponder para: {replyTo}",
	},
};

const DEFAULT_CONFIG = {
	enabled: true,
	smtpHost: process.env.FINAN_SMTP_HOST || "smtp.hostinger.com",
	smtpPort: Number(process.env.FINAN_SMTP_PORT || 465),
	smtpSecure: String(process.env.FINAN_SMTP_SECURE || "true").toLowerCase() !== "false",
	smtpUser: process.env.FINAN_SMTP_USER || "",
	smtpPassword: process.env.FINAN_SMTP_PASSWORD || process.env.FINAN_SMTP_PASS || "",
	fromName: process.env.FINAN_EMAIL_FROM_NAME || "Finan - Sempre Internet",
	fromEmail: normalizeFinanFromEmail(
		process.env.FINAN_EMAIL_FROM || "naoresponda@retiradas.tech",
		process.env.FINAN_SMTP_USER,
	),
	replyTo: process.env.FINAN_EMAIL_REPLY_TO || process.env.FINAN_SMTP_USER || "",
	appUrl: process.env.FINAN_PUBLIC_URL || "https://finan.retiradas.tech",
	mfaEmailEnabled: String(process.env.FINAN_MFA_EMAIL_ENABLED || "true").toLowerCase() !== "false",
	mfaEmailTtlMinutes: Number(process.env.FINAN_MFA_EMAIL_TTL_MINUTES || 10),
	templates: DEFAULT_EMAIL_TEMPLATES,
};

function normalizeFinanFromEmail(value, smtpUser = "") {
	const email = String(value || "").trim();
	const fallback = String(smtpUser || process.env.FINAN_SMTP_USER || "").trim();
	if (
		!email ||
		email === "naoresponda@finan.retiradas.tech"
	) {
		return fallback || "financeiro@retiradas.tech";
	}
	return email;
}

function normalizeFinanTemplateText(value) {
	if (typeof value !== "string") return value;
	return value
		.replace(/sistema Retiradas/g, "Finan")
		.replace(/Sistema Retiradas/g, "Finan")
		.replace(/Retiradas/g, "Finan")
		.replace(/Cluster MG/g, "Sempre Internet");
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
				...Object.fromEntries(
					Object.entries(templates?.[key] || {}).map(([field, value]) => [
						field,
						normalizeFinanTemplateText(value),
					]),
				),
				label: defaults.label,
			},
		]),
	);
}

function renderVariables(value, variables = {}) {
	return String(value || "").replace(/\{(\w+)\}/g, (_, key) => {
		const resolved = variables[key];
		return resolved === undefined || resolved === null || resolved === ""
			? "-"
			: String(resolved);
	});
}

function textToHtml(value) {
	return String(value || "")
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.map(
			(paragraph) =>
				`<p style="margin:0 0 14px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
		)
		.join("");
}

async function readSavedConfig() {
	const { rows } = await db
		.query("select value from finan_settings where key = 'email' limit 1")
		.catch(() => ({ rows: [] }));
	return rows[0]?.value || {};
}

async function getConfig() {
	const data = await readSavedConfig();
	return {
		...DEFAULT_CONFIG,
		...data,
		smtpHost: data.smtpHost || DEFAULT_CONFIG.smtpHost,
		smtpPort: Number(data.smtpPort || DEFAULT_CONFIG.smtpPort),
		smtpSecure: Boolean(data.smtpSecure ?? DEFAULT_CONFIG.smtpSecure),
		smtpUser: data.smtpUser || DEFAULT_CONFIG.smtpUser,
		smtpPassword: data.smtpPassword || DEFAULT_CONFIG.smtpPassword,
		fromName: data.fromName || DEFAULT_CONFIG.fromName,
		fromEmail: normalizeFinanFromEmail(data.fromEmail || DEFAULT_CONFIG.fromEmail, data.smtpUser || DEFAULT_CONFIG.smtpUser),
		replyTo: data.replyTo || DEFAULT_CONFIG.replyTo || data.smtpUser || DEFAULT_CONFIG.smtpUser,
		appUrl: data.appUrl || DEFAULT_CONFIG.appUrl,
		mfaEmailEnabled: Boolean(data.mfaEmailEnabled ?? DEFAULT_CONFIG.mfaEmailEnabled),
		mfaEmailTtlMinutes: Number(data.mfaEmailTtlMinutes || DEFAULT_CONFIG.mfaEmailTtlMinutes),
		templates: normalizeTemplates(data.templates || DEFAULT_CONFIG.templates),
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
		fromEmail: normalizeFinanFromEmail(patch.fromEmail || current.fromEmail, patch.smtpUser || current.smtpUser),
		mfaEmailEnabled: Boolean(patch.mfaEmailEnabled ?? current.mfaEmailEnabled),
		mfaEmailTtlMinutes: Math.max(
			3,
			Math.min(30, Number(patch.mfaEmailTtlMinutes || current.mfaEmailTtlMinutes || 10)),
		),
		templates: normalizeTemplates(patch.templates || current.templates),
		updatedAt: new Date().toISOString(),
	};
	await db.query(
		`insert into finan_settings (key, value, updated_at)
		values ('email', $1::jsonb, now())
		on conflict (key) do update set value = excluded.value, updated_at = now()`,
		[JSON.stringify(next)],
	);
	return sanitizeConfig(next);
}

function ensureConfig(config) {
	if (!config.enabled) throw new Error("Envio de e-mail desativado.");
	if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPassword) {
		throw new Error("SMTP incompleto. Configure host, porta, usuário e senha.");
	}
	if (!config.fromEmail) throw new Error("E-mail remetente não configurado.");
}

function createTransport(config) {
	ensureConfig(config);
	return nodemailer.createTransport({
		host: config.smtpHost,
		port: Number(config.smtpPort),
		secure: Boolean(config.smtpSecure),
		connectionTimeout: Number(process.env.FINAN_SMTP_CONNECTION_TIMEOUT_MS || 10000),
		greetingTimeout: Number(process.env.FINAN_SMTP_GREETING_TIMEOUT_MS || 10000),
		socketTimeout: Number(process.env.FINAN_SMTP_SOCKET_TIMEOUT_MS || 15000),
		auth: {
			user: config.smtpUser,
			pass: config.smtpPassword,
		},
	});
}

function defaultAttachments() {
	if (!fs.existsSync(EMAIL_LOGO_PATH)) return [];
	return [
		{
			filename: "sempre-logo.png",
			path: EMAIL_LOGO_PATH,
			cid: EMAIL_LOGO_CID,
		},
	];
}

function renderConfiguredEmail(config, templateKey, variables = {}) {
	const template = normalizeTemplates(config.templates)[templateKey] || DEFAULT_EMAIL_TEMPLATES[templateKey];
	const resolvedVariables = {
		appUrl: config.appUrl || DEFAULT_CONFIG.appUrl,
		fromEmail: config.fromEmail || DEFAULT_CONFIG.fromEmail,
		replyTo: config.replyTo || DEFAULT_CONFIG.replyTo,
		...variables,
	};
	const actionUrl = ["password_reset", "smtp_test"].includes(templateKey)
		? renderVariables(templateKey === "smtp_test" ? "{appUrl}" : "{resetUrl}", resolvedVariables)
		: "";
	const actionLabel = renderVariables(template.actionLabel, resolvedVariables);
	const subject = renderVariables(template.subject, resolvedVariables);
	const text = renderVariables(template.body, resolvedVariables);
	return {
		subject,
		text: actionUrl && actionUrl !== "-" ? `${text}\n\n${actionLabel || "Acessar"}: ${actionUrl}` : text,
		html: createEmailTemplate({
			title: renderVariables(template.title, resolvedVariables),
			preheader: renderVariables(template.preview, resolvedVariables),
			message: textToHtml(text),
			buttonText: actionLabel,
			buttonUrl: actionUrl && actionUrl !== "-" ? actionUrl : "",
			appUrl: resolvedVariables.appUrl,
		}),
	};
}

function createEmailTemplate({
	title,
	preheader = "",
	message = "",
	buttonText = "",
	buttonUrl = "",
	appUrl = DEFAULT_CONFIG.appUrl,
}) {
	const safeTitle = escapeHtml(title);
	const safePreheader = escapeHtml(preheader);
	const safeButtonUrl = escapeHtml(buttonUrl);
	return `<!doctype html>
<html lang="pt-BR">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${safeTitle}</title>
</head>
<body style="margin:0;background:#f1f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#17233d">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreheader}</div>
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px">
		<tr>
			<td align="center">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.12)">
					<tr>
						<td style="background:linear-gradient(135deg,#061a3a,#075eea);padding:28px 32px">
							<img src="cid:${EMAIL_LOGO_CID}" width="180" alt="Sempre Internet" style="display:block;border:0;max-width:180px;height:auto">
						</td>
					</tr>
					<tr>
						<td style="padding:34px 32px 18px">
							<div style="display:inline-block;border-radius:999px;background:#eff6ff;color:#075eea;padding:7px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em">FINAN</div>
							<h1 style="margin:18px 0 12px;color:#07152f;font-size:28px;line-height:1.16;font-weight:900">${safeTitle}</h1>
							<div style="color:#52637a;font-size:15px;line-height:1.65">${message}</div>
							${
								buttonText && safeButtonUrl
									? `<p style="margin:28px 0 0"><a href="${safeButtonUrl}" style="display:inline-block;border-radius:14px;background:linear-gradient(90deg,#ff9700,#ff5000);padding:15px 22px;color:#ffffff;text-decoration:none;font-weight:900">${escapeHtml(buttonText)}</a></p>`
									: ""
							}
						</td>
					</tr>
					<tr>
						<td style="padding:0 32px 30px;color:#94a3b8;font-size:12px;line-height:1.5">
							E-mail automático do Finan - Gestão Financeira Sempre Internet.
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

async function logEmail({ to, subject, status, error = "", messageId = "", meta = {} }) {
	const id = randomId("finan_email");
	await db
		.query(
			`insert into finan_email_logs (
				id, type, to_email, subject, status, error_message, provider_message_id, meta, created_at
			)
			values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
			[
				id,
				String(meta.type || meta.template || "system_notice"),
				String(to || ""),
				String(subject || ""),
				String(status || ""),
				String(error || ""),
				String(messageId || ""),
				JSON.stringify(meta && typeof meta === "object" ? meta : {}),
			],
		)
		.catch((logError) => console.warn("[finan-email-log]", logError?.message || logError));
}

async function sendMail({ to, subject, html, text = "", meta = {}, attachments = [] }) {
	const config = await getConfig();
	const transporter = createTransport(config);
	const from = `${config.fromName || "Finan - Sempre Internet"} <${config.fromEmail}>`;
	try {
		const response = await transporter.sendMail({
			from,
			to,
			replyTo: config.replyTo || config.fromEmail,
			subject,
			html,
			text,
			attachments: [...defaultAttachments(), ...attachments],
		});
		await logEmail({
			to,
			subject,
			status: "enviado",
			messageId: response.messageId || "",
			meta: { ...meta, messageId: response.messageId || "" },
		});
		return { ok: true, sent: true, messageId: response.messageId || "" };
	} catch (error) {
		await logEmail({
			to,
			subject,
			status: "erro",
			error: String(error?.message || error),
			meta,
		});
		throw error;
	}
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
	const config = await getConfig();
	const rendered = renderConfiguredEmail(config, "password_reset", {
		nome: name || to,
		email: to,
		resetUrl,
	});
	return sendMail({
		to,
		...rendered,
		meta: { type: "password_reset" },
	});
}

async function sendMfaLoginCodeEmail({ to, name, code, ttlMinutes }) {
	const config = await getConfig();
	if (!config.mfaEmailEnabled) return { sent: false, reason: "mfa_email_disabled" };
	const rendered = renderConfiguredEmail(config, "mfa_login_code", {
		nome: name || to,
		email: to,
		codigo: code,
		minutos: ttlMinutes || config.mfaEmailTtlMinutes || 10,
	});
	return sendMail({
		to,
		...rendered,
		meta: { type: "mfa_login_code" },
	});
}

async function sendWelcomeFirstAccessEmail({ to, name, temporaryPassword }) {
	const config = await getConfig();
	const rendered = renderConfiguredEmail(config, "welcome_first_access", {
		nome: name || to,
		email: to,
		temporaryPassword,
		appUrl: config.appUrl,
	});
	return sendMail({
		to,
		...rendered,
		meta: { type: "welcome_first_access" },
	});
}

async function sendTestEmail(to) {
	const config = await getConfig();
	const target = String(to || config.replyTo || config.smtpUser || "").trim();
	if (!target) throw new Error("Informe um e-mail para teste.");
	const rendered = renderConfiguredEmail(config, "smtp_test", {
		nome: "Usuário Teste",
		email: target,
		fromEmail: config.fromEmail,
		replyTo: config.replyTo || config.fromEmail,
		appUrl: config.appUrl,
	});
	const result = await sendMail({
		to: target,
		...rendered,
		meta: { type: "smtp_test", preview: true },
	});
	return { ok: true, sent: 1, results: [{ type: "smtp_test", ...result }] };
}

module.exports = {
	DEFAULT_EMAIL_TEMPLATES,
	getConfig,
	sanitizeConfig,
	saveConfig,
	sendMfaLoginCodeEmail,
	sendPasswordResetEmail,
	sendTestEmail,
	sendWelcomeFirstAccessEmail,
};
