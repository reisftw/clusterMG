const crypto = require("node:crypto");
const documents = require("./documents");
const { randomId } = require("./secureRandom");

const CONFIG_PATH = "cvortex_config/global";
const MESSAGING_CONFIG_PATH = "mensageria_config/global";
const DEFAULT_SEND_ENDPOINT = "/messages/send";
const DEFAULT_STATUS_ENDPOINT = "/health";

const DEFAULT_CONFIG = {
	enabled: false,
	useCvortexForMessaging: false,
	baseUrl: "",
	apiToken: "",
	accountId: "",
	inboxId: "",
	sendEndpoint: "",
	statusEndpoint: "",
	webhookSecret: "",
	defaultFrom: "",
	notes: "",
	lastValidatedAt: "",
	lastError: "",
	associationStartedAt: "",
	associationStartedBy: "",
	lastTestSentAt: "",
	lastTestMessage: "",
};

function cleanText(value) {
	return String(value || "").trim();
}

function normalizeBaseUrl(value) {
	const baseUrl = cleanText(value).replace(/\/+$/, "");
	if (!baseUrl) return "";
	if (!/^https?:\/\//i.test(baseUrl)) return `https://${baseUrl}`;
	return baseUrl;
}

function normalizePath(value, fallback = "") {
	const path = cleanText(value || fallback);
	if (!path) return "";
	if (/^https?:\/\//i.test(path)) return path;
	return path.startsWith("/") ? path : `/${path}`;
}

function normalizeConfig(config = {}) {
	return {
		...DEFAULT_CONFIG,
		...config,
		enabled: config.enabled === true,
		useCvortexForMessaging: config.useCvortexForMessaging === true,
		baseUrl: normalizeBaseUrl(config.baseUrl),
		apiToken: cleanText(config.apiToken),
		accountId: cleanText(config.accountId),
		inboxId: cleanText(config.inboxId),
		sendEndpoint: normalizePath(config.sendEndpoint, DEFAULT_SEND_ENDPOINT),
		statusEndpoint: normalizePath(
			config.statusEndpoint,
			DEFAULT_STATUS_ENDPOINT,
		),
		webhookSecret: cleanText(config.webhookSecret),
		defaultFrom: cleanText(config.defaultFrom),
		notes: cleanText(config.notes),
	};
}

function sanitizeConfig(config = {}) {
	const normalized = normalizeConfig(config);
	const { apiToken, webhookSecret, ...safe } = normalized;
	return {
		...safe,
		apiToken: "",
		webhookSecret: "",
		apiTokenConfigured: Boolean(apiToken),
		webhookSecretConfigured: Boolean(webhookSecret),
	};
}

async function readConfig({ sanitized = true } = {}) {
	const item = await documents.getDocument(CONFIG_PATH).catch(() => null);
	const config = normalizeConfig(item?.data || {});
	return sanitized ? sanitizeConfig(config) : config;
}

function mergeSecretField(payload, current, field) {
	if (Object.hasOwn(payload, field)) {
		const value = cleanText(payload[field]);
		if (value) return value;
	}
	return cleanText(current[field]);
}

async function saveConfig(payload = {}, user = {}) {
	const current = await readConfig({ sanitized: false });
	const next = normalizeConfig({
		...current,
		...payload,
		apiToken: mergeSecretField(payload, current, "apiToken"),
		webhookSecret: mergeSecretField(payload, current, "webhookSecret"),
		atualizadoEm: new Date().toISOString(),
		atualizadoPor: user?.nome || user?.email || user?.uid || "",
	});

	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: "cvortex_config",
		documentId: "global",
		parentPath: null,
		data: next,
	});
	return sanitizeConfig(next);
}

function assertBaseConfig(config = {}) {
	const missing = [];
	if (!config.baseUrl) missing.push("Base URL");
	if (!config.apiToken) missing.push("Token / API Key");
	if (missing.length) {
		const error = new Error(
			`Configure Cvortex antes de validar: ${missing.join(", ")}.`,
		);
		error.statusCode = 400;
		throw error;
	}
}

function buildUrl(config, endpoint) {
	const path = normalizePath(endpoint);
	if (/^https?:\/\//i.test(path)) return path;
	return `${config.baseUrl}${path}`;
}

async function parseResponse(response) {
	const text = await response.text();
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return { raw: text };
	}
}

function buildHeaders(config = {}) {
	return {
		Accept: "application/json",
		"Content-Type": "application/json",
		Authorization: `Bearer ${config.apiToken}`,
		"X-API-Key": config.apiToken,
		...(config.accountId ? { "X-Account-Id": config.accountId } : {}),
		...(config.inboxId ? { "X-Inbox-Id": config.inboxId } : {}),
	};
}

async function testConnection() {
	const config = await readConfig({ sanitized: false });
	assertBaseConfig(config);
	const endpoint = buildUrl(
		config,
		config.statusEndpoint || DEFAULT_STATUS_ENDPOINT,
	);
	const response = await fetch(endpoint, {
		method: "GET",
		headers: buildHeaders(config),
	});
	const payload = await parseResponse(response);
	const checkedAt = new Date().toISOString();
	if (!response.ok) {
		const message =
			payload?.message ||
			payload?.error ||
			payload?.raw ||
			`Cvortex HTTP ${response.status}`;
		await saveConfig({
			...config,
			lastValidatedAt: checkedAt,
			lastError: message,
		});
		const error = new Error(`Falha ao validar Cvortex: ${message}`);
		error.statusCode = response.status >= 500 ? 502 : 400;
		throw error;
	}
	await saveConfig({ ...config, lastValidatedAt: checkedAt, lastError: "" });
	return {
		ok: true,
		checkedAt,
		endpoint,
		status: response.status,
		response: payload,
	};
}

function normalizePhone(value) {
	const digits = String(value || "").replace(/\D+/g, "");
	if (!digits) return "";
	if (digits.startsWith("55")) return digits;
	if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
	return digits;
}

async function sendMessage(numberRaw, messageRaw, item = {}, user = {}) {
	const config = await readConfig({ sanitized: false });
	assertBaseConfig(config);
	const phone = normalizePhone(numberRaw);
	const message = cleanText(messageRaw);
	if (!phone) {
		const error = new Error("Informe um telefone válido para teste.");
		error.statusCode = 400;
		throw error;
	}
	if (!message) {
		const error = new Error("Informe a mensagem de teste.");
		error.statusCode = 400;
		throw error;
	}

	const endpoint = buildUrl(
		config,
		config.sendEndpoint || DEFAULT_SEND_ENDPOINT,
	);
	const body = {
		phone,
		to: phone,
		number: phone,
		message,
		text: message,
		body: message,
		accountId: config.accountId || undefined,
		inboxId: config.inboxId || undefined,
		from: config.defaultFrom || undefined,
		metadata: {
			origem: item?.origem || "retiradas_cvortex",
			cliente: item?.cliente || "",
			os: item?.os || "",
			codigo_cliente: item?.codigo_cliente || "",
			usuario: user?.profile?.nome || user?.nome || user?.email || "",
		},
	};

	const response = await fetch(endpoint, {
		method: "POST",
		headers: buildHeaders(config),
		body: JSON.stringify(body),
	});
	const result = await parseResponse(response);
	return { response, result, phone, endpoint };
}

async function sendTextMessage(number, text, item = {}, user = {}) {
	const { response, result, phone, endpoint } = await sendMessage(
		number,
		text,
		item,
		user,
	);
	if (!response.ok) {
		const messageError =
			result?.message ||
			result?.error ||
			result?.raw ||
			`Cvortex HTTP ${response.status}`;
		const error = new Error(
			`Falha ao enviar mensagem Cvortex: ${messageError}`,
		);
		error.statusCode = response.status >= 500 ? 502 : 400;
		throw error;
	}
	return {
		ok: true,
		phone,
		endpoint,
		response: result,
	};
}

async function sendTestMessage(payload = {}, user = {}) {
	const phoneRaw = payload.phone || payload.telefone || payload.number;
	const messageRaw = payload.message || payload.mensagem || payload.text;
	const { response, result, phone, endpoint } = await sendMessage(
		phoneRaw,
		messageRaw,
		{
			origem: "retiradas_cvortex_teste",
		},
		user,
	);
	const now = new Date().toISOString();
	const config = await readConfig({ sanitized: false });
	if (!response.ok) {
		const messageError =
			result?.message ||
			result?.error ||
			result?.raw ||
			`Cvortex HTTP ${response.status}`;
		await saveConfig({
			...config,
			lastTestSentAt: now,
			lastTestMessage: messageError,
		});
		const error = new Error(`Falha ao enviar teste Cvortex: ${messageError}`);
		error.statusCode = response.status >= 500 ? 502 : 400;
		throw error;
	}
	await saveConfig(
		{
			...config,
			lastTestSentAt: now,
			lastTestMessage: `Teste enviado para ${phone}.`,
		},
		user,
	);
	return {
		ok: true,
		sentAt: now,
		phone,
		endpoint,
		response: result,
	};
}

async function associateCvortex(user = {}) {
	const current = await readConfig({ sanitized: false });
	assertBaseConfig(current);
	const saved = await saveConfig(
		{
			...current,
			enabled: true,
			useCvortexForMessaging: true,
			associationStartedAt: new Date().toISOString(),
			associationStartedBy: user?.nome || user?.email || user?.uid || "",
		},
		user,
	);
	const messaging = await documents
		.getDocument(MESSAGING_CONFIG_PATH)
		.catch(() => null);
	await documents.upsertDocument({
		path: MESSAGING_CONFIG_PATH,
		collectionPath: "mensageria_config",
		documentId: "global",
		parentPath: null,
		data: {
			...(messaging?.data || {}),
			whatsappProvider: "cvortex",
			cvortexEnabled: true,
			cvortexAssociatedAt: new Date().toISOString(),
			cvortexAssociatedBy: user?.nome || user?.email || user?.uid || "",
		},
	});
	return saved;
}

function timingSafeCompare(a, b) {
	const left = Buffer.from(String(a || ""));
	const right = Buffer.from(String(b || ""));
	if (!left.length || !right.length || left.length !== right.length)
		return false;
	return crypto.timingSafeEqual(left, right);
}

async function verifyWebhookSecret(req) {
	const config = await readConfig({ sanitized: false });
	if (!config.webhookSecret) return { ok: true, config };
	const received = cleanText(
		req.query?.secret ||
			req.get?.("x-cvortex-secret") ||
			req.get?.("x-webhook-secret") ||
			req.get?.("authorization")?.replace(/^Bearer\s+/i, ""),
	);
	return {
		ok: timingSafeCompare(received, config.webhookSecret),
		config,
	};
}

function pickFirst(source, paths = []) {
	for (const path of paths) {
		const parts = String(path).split(".");
		let current = source;
		for (const part of parts) {
			if (current === undefined || current === null) break;
			current = current[part];
		}
		if (
			current !== undefined &&
			current !== null &&
			String(current).trim?.() !== ""
		)
			return current;
	}
	return "";
}

async function registerWebhook(payload = {}, meta = {}) {
	const createdAt = new Date().toISOString();
	const id = randomId("cvortex");
	const phone = normalizePhone(
		pickFirst(payload, [
			"phone",
			"telefone",
			"from",
			"contact.phone",
			"message.from",
			"data.phone",
			"data.from",
		]),
	);
	const message = cleanText(
		pickFirst(payload, [
			"message",
			"mensagem",
			"text",
			"body",
			"message.text",
			"data.message",
			"data.text",
			"data.body",
		]),
	);
	await documents.upsertDocument({
		path: `mensageria_callbacks/${id}`,
		collectionPath: "mensageria_callbacks",
		documentId: id,
		parentPath: null,
		data: {
			id,
			provider: "cvortex",
			origem: "cvortex",
			status: message ? "recebido" : "recebido_sem_texto",
			telefone: phone,
			mensagem: message || "Mensagem sem texto legível",
			webhookEvent: meta.event || payload.event || payload.type || "cvortex",
			createdAt,
			raw: payload,
		},
	});
	return {
		ok: true,
		id,
		status: message ? "recebido" : "recebido_sem_texto",
		telefone: phone,
	};
}

async function checkStatus() {
	const config = await readConfig({ sanitized: false });
	if (!config.enabled && !config.useCvortexForMessaging) {
		throw new Error("Cvortex ainda não associada ao sistema.");
	}
	if (!config.baseUrl || !config.apiToken) {
		throw new Error("Cvortex sem Base URL ou token configurado.");
	}
	return testConnection();
}

module.exports = {
	associateCvortex,
	checkStatus,
	readConfig,
	registerWebhook,
	saveConfig,
	sendTextMessage,
	sendTestMessage,
	testConnection,
	verifyWebhookSecret,
};
