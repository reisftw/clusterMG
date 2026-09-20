const documents = require("./documents");

const CONFIG_PATH = "senior_config/global";
const DEFAULT_STATUS_ENDPOINT = "/health";

const DEFAULT_CONFIG = {
	enabled: false,
	environment: "homologacao",
	baseUrl: "",
	authType: "bearer",
	apiToken: "",
	username: "",
	password: "",
	companyCode: "",
	tenant: "",
	statusEndpoint: DEFAULT_STATUS_ENDPOINT,
	notes: "",
	lastValidatedAt: "",
	lastError: "",
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

function normalizePath(value, fallback = DEFAULT_STATUS_ENDPOINT) {
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
		environment: cleanText(config.environment || DEFAULT_CONFIG.environment),
		baseUrl: normalizeBaseUrl(config.baseUrl),
		authType: cleanText(config.authType || DEFAULT_CONFIG.authType),
		apiToken: cleanText(config.apiToken),
		username: cleanText(config.username),
		password: cleanText(config.password),
		companyCode: cleanText(config.companyCode),
		tenant: cleanText(config.tenant),
		statusEndpoint: normalizePath(config.statusEndpoint),
		notes: cleanText(config.notes),
	};
}

function sanitizeConfig(config = {}) {
	const normalized = normalizeConfig(config);
	const { apiToken, password, ...safe } = normalized;
	return {
		...safe,
		apiToken: "",
		password: "",
		apiTokenConfigured: Boolean(apiToken),
		passwordConfigured: Boolean(password),
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
		password: mergeSecretField(payload, current, "password"),
		atualizadoEm: new Date().toISOString(),
		atualizadoPor: user?.nome || user?.email || user?.uid || "",
	});

	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: "senior_config",
		documentId: "global",
		parentPath: null,
		data: next,
	});

	return sanitizeConfig(next);
}

function buildUrl(config, endpoint) {
	const path = normalizePath(endpoint);
	if (/^https?:\/\//i.test(path)) return path;
	return `${config.baseUrl}${path}`;
}

function buildHeaders(config = {}) {
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json",
	};
	if (config.apiToken) {
		headers.Authorization =
			config.authType === "api-key"
				? config.apiToken
				: `Bearer ${config.apiToken}`;
		headers["X-API-Key"] = config.apiToken;
	}
	if (config.tenant) headers["X-Tenant"] = config.tenant;
	if (config.companyCode) headers["X-Company-Code"] = config.companyCode;
	return headers;
}

async function parseResponse(response) {
	const text = await response.text();
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return { raw: text };
	}
}

function assertBaseConfig(config = {}) {
	const missing = [];
	if (!config.baseUrl) missing.push("Base URL");
	if (config.authType !== "none" && !config.apiToken && !config.username) {
		missing.push("Token/API key ou usuário");
	}
	if (missing.length) {
		const error = new Error(
			`Configure Senior/Sapiens antes de validar: ${missing.join(", ")}.`,
		);
		error.statusCode = 400;
		throw error;
	}
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
			`Senior/Sapiens HTTP ${response.status}`;
		await saveConfig({
			...config,
			lastValidatedAt: checkedAt,
			lastError: message,
		});
		const error = new Error(`Falha ao validar Senior/Sapiens: ${message}`);
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

module.exports = {
	readConfig,
	saveConfig,
	testConnection,
};
