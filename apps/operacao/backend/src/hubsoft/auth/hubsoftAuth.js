const BASE_URL = "https://sempre.hubsoft.com.br";

let cachedAuth = null;

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "0";

function resetHubsoftAuthCache() {
	cachedAuth = null;
}

function decodeJwtPayload(token) {
	const raw = String(token || "").replace(/^Bearer\s+/i, "");
	const [, payload] = raw.split(".");
	if (!payload) return null;
	try {
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
		return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
	} catch {
		return null;
	}
}

function isTokenValid(token, skewSeconds = 120) {
	const payload = decodeJwtPayload(token);
	if (!payload?.exp) return Boolean(token);
	return Number(payload.exp) * 1000 > Date.now() + skewSeconds * 1000;
}

function normalizeBearer(token) {
	const value = String(token || "").trim();
	if (!value) return "";
	return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
}

async function readSavedHubsoftCredentials() {
	try {
		const db = require("../../db");
		const { rows } = await db.query("select value from rot_settings where key = 'integrations' limit 1");
		const hubsoft = rows[0]?.value?.hubsoft || {};
		return {
			username: String(hubsoft.username || "").trim(),
			password: String(hubsoft.password || ""),
			bearerToken: normalizeBearer(hubsoft.bearerToken),
		};
	} catch {
		return {};
	}
}

async function loginWithPlaywright({ username, password, headless = true } = {}) {
	if (!username || !password) {
		const error = new Error("Credenciais HubSoft não configuradas.");
		error.statusCode = 503;
		throw error;
	}
	let chromium;
	try {
		({ chromium } = require("playwright"));
	} catch {
		const error = new Error("Playwright não está disponível para autenticação HubSoft.");
		error.statusCode = 503;
		throw error;
	}

	const browser = await chromium.launch({ headless });
	try {
		const page = await browser.newPage();
		let authHeader = "";
		page.on("request", (request) => {
			const header = request.headers().authorization;
			if (header && request.url().includes("api.sempre.hubsoft.com.br")) authHeader = header;
		});
		await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
		const userInput = page.locator('input[name="email"], input[name="username"], input[type="email"], input[placeholder*="email" i], input[placeholder*="usu" i]').first();
		await userInput.fill(username);
		const validate = page.locator('button:has-text("VALIDAR"), button:has-text("Validar")').first();
		if (await validate.count()) {
			await validate.click();
			await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
		}
		const passInput = page.locator('input[name="password"], input[name="senha"], input[type="password"], input[placeholder*="senha" i]').first();
		await passInput.fill(password);
		const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Acessar")').first();
		await submit.click();
		await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
		await page.goto(`${BASE_URL}/atendimento_os/ordem_servico`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
		if (!authHeader) {
			const error = new Error("Não foi possível capturar Bearer HubSoft após login.");
			error.statusCode = 401;
			throw error;
		}
		return normalizeBearer(authHeader);
	} finally {
		await browser.close().catch(() => {});
	}
}

async function getHubsoftAuthHeader(options = {}) {
	const saved = await readSavedHubsoftCredentials();
	const envToken = normalizeBearer(options.bearerToken || saved.bearerToken || process.env.HUBSOFT_BEARER_TOKEN || process.env.HUBSOFT_API_TOKEN);
	if (isTokenValid(envToken)) return envToken;
	if (cachedAuth && isTokenValid(cachedAuth.authorization)) return cachedAuth.authorization;
	const authorization = await loginWithPlaywright({
		username: options.username || saved.username || process.env.HUBSOFT_USERNAME || process.env.HUBSOFT_LOGIN,
		password: options.password || saved.password || process.env.HUBSOFT_PASSWORD,
		headless: options.headless !== false,
	});
	cachedAuth = { authorization, capturedAt: Date.now() };
	return authorization;
}

module.exports = { getHubsoftAuthHeader, isTokenValid, normalizeBearer, resetHubsoftAuthCache };
