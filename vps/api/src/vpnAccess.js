const crypto = require("node:crypto");
const documents = require("./documents");

const CONFIG_PATH = "vpn_access/config";
const CONFIG_COLLECTION = "vpn_access";
const CONFIG_DOCUMENT_ID = "config";
const LOG_COLLECTION = "vpn_access_logs";
const CACHE_TTL_MS = Math.max(
	Number(process.env.VPN_ACCESS_CACHE_TTL_MS || 15000),
	0,
);

let cachedConfig = null;
let cachedAt = 0;

function nowIso() {
	return new Date().toISOString();
}

function cleanText(value) {
	return String(value || "").trim();
}

function splitLines(value) {
	if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
	return String(value || "")
		.split(/\r?\n|,/)
		.map(cleanText)
		.filter(Boolean);
}

function uniqueSorted(values = []) {
	return [...new Set(values.map(cleanText).filter(Boolean))].sort((a, b) =>
		a.localeCompare(b, "pt-BR"),
	);
}

function getDefaultConfig() {
	return {
		enabled: false,
		protectedRoutes: [],
		allowedCidrs: [],
		updatedAt: "",
		updatedBy: "",
		updatedByName: "",
	};
}

function normalizeConfig(data = {}) {
	return {
		...getDefaultConfig(),
		...data,
		enabled:
			data.enabled === true ||
			data.enabled === "true" ||
			data.enabled === 1 ||
			data.enabled === "1",
		protectedRoutes: uniqueSorted(splitLines(data.protectedRoutes)),
		allowedCidrs: uniqueSorted(splitLines(data.allowedCidrs)),
	};
}

function invalidateCache() {
	cachedConfig = null;
	cachedAt = 0;
}

async function readConfig({ fresh = false } = {}) {
	if (
		!fresh &&
		cachedConfig &&
		(!CACHE_TTL_MS || Date.now() - cachedAt <= CACHE_TTL_MS)
	) {
		return cachedConfig;
	}
	const doc = await documents.getDocument(CONFIG_PATH).catch(() => null);
	const config = normalizeConfig(doc?.data || {});
	cachedConfig = config;
	cachedAt = Date.now();
	return config;
}

async function saveConfig(payload = {}, user = {}) {
	const current = await readConfig({ fresh: true });
	const next = normalizeConfig({
		...current,
		...payload,
		updatedAt: nowIso(),
		updatedBy: user?.uid || user?.email || "",
		updatedByName: user?.profile?.nome || user?.nome || user?.email || "",
	});
	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: CONFIG_COLLECTION,
		documentId: CONFIG_DOCUMENT_ID,
		parentPath: null,
		data: next,
	});
	invalidateCache();
	await appendLog({
		action: "config_update",
		status: "ok",
		route: "",
		ip: "",
		reason: next.enabled
			? "Protecao VPN ativada/configurada."
			: "Protecao VPN desativada/configurada.",
		userName: next.updatedByName,
	});
	return { ok: true, config: next };
}

function normalizePath(value) {
	const path = cleanText(value);
	if (!path) return "";
	if (/^https?:\/\//i.test(path)) {
		try {
			return new URL(path).pathname || "/";
		} catch {
			return path;
		}
	}
	return path.startsWith("/") ? path : `/${path}`;
}

function routeMatches(routePattern, requestPath) {
	const pattern = normalizePath(routePattern);
	const path = normalizePath(requestPath);
	if (!pattern || !path) return false;
	if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
	return path === pattern || path.startsWith(`${pattern}/`);
}

function isRouteProtected(config = {}, requestPath = "") {
	if (!config.enabled) return false;
	return (config.protectedRoutes || []).some((route) =>
		routeMatches(route, requestPath),
	);
}

function normalizeIp(value) {
	const ip = cleanText(value)
		.replace(/^::ffff:/, "")
		.replace(/^\[|\]$/g, "");
	if (ip === "::1") return "127.0.0.1";
	return ip;
}

function getClientIp(req) {
	const forwarded =
		cleanText(req.headers["cf-connecting-ip"]) ||
		cleanText(req.headers["x-real-ip"]) ||
		cleanText(String(req.headers["x-forwarded-for"] || "").split(",")[0]);
	return normalizeIp(forwarded || req.ip || req.socket?.remoteAddress || "");
}

function ipv4ToLong(ip) {
	const parts = normalizeIp(ip).split(".");
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d+$/.test(part)) return null;
		const number = Number(part);
		if (number < 0 || number > 255) return null;
		value = (value << 8) + number;
	}
	return value >>> 0;
}

function cidrContains(cidr, ip) {
	const text = cleanText(cidr);
	const clientIp = normalizeIp(ip);
	if (!text) return false;
	if (!text.includes("/")) return normalizeIp(text) === clientIp;

	const [baseIp, prefixRaw] = text.split("/");
	const base = ipv4ToLong(baseIp);
	const target = ipv4ToLong(clientIp);
	const prefix = Number(prefixRaw);
	if (
		base === null ||
		target === null ||
		!Number.isInteger(prefix) ||
		prefix < 0 ||
		prefix > 32
	)
		return false;
	const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
	return (base & mask) === (target & mask);
}

function isIpAllowed(config = {}, ip = "") {
	const allowedCidrs = config.allowedCidrs || [];
	if (!allowedCidrs.length) return false;
	return allowedCidrs.some((cidr) => cidrContains(cidr, ip));
}

async function appendLog(data = {}) {
	const createdAt = nowIso();
	const id = `vpn_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
	await documents.upsertDocument({
		path: `${LOG_COLLECTION}/${id}`,
		collectionPath: LOG_COLLECTION,
		documentId: id,
		parentPath: null,
		data: {
			action: cleanText(data.action) || "access_check",
			status: cleanText(data.status) || "info",
			route: cleanText(data.route),
			ip: cleanText(data.ip),
			reason: cleanText(data.reason),
			userName: cleanText(data.userName),
			createdAt,
		},
	});
}

async function listLogs(limit = 100) {
	const result = await documents.listDocuments({
		collectionPath: LOG_COLLECTION,
		limit: Math.max(1, Math.min(200, Number(limit || 100))),
		offset: 0,
	});
	return {
		ok: true,
		items: (result || [])
			.map((item) => ({ id: item.documentId, ...(item.data || {}) }))
			.sort((a, b) =>
				String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
			),
	};
}

async function checkAccess({ route, ip } = {}) {
	const config = await readConfig();
	const normalizedRoute = normalizePath(route);
	const protectedRoute = isRouteProtected(config, normalizedRoute);
	const allowed = !protectedRoute || isIpAllowed(config, ip);
	return {
		ok: true,
		enabled: config.enabled,
		protected: protectedRoute,
		allowed,
		route: normalizedRoute,
		ip: normalizeIp(ip),
	};
}

function createMiddleware() {
	return async (req, res, next) => {
		try {
			if (
				req.path.startsWith("/api/admin/vpn") ||
				req.path.startsWith("/api/vpn") ||
				req.path.startsWith("/api/auth") ||
				req.path === "/api/health"
			) {
				next();
				return;
			}
			const config = await readConfig();
			if (!isRouteProtected(config, req.path)) {
				next();
				return;
			}
			const ip = getClientIp(req);
			if (isIpAllowed(config, ip)) {
				next();
				return;
			}
			await appendLog({
				action: "blocked_request",
				status: "blocked",
				route: req.path,
				ip,
				reason: "IP fora das faixas VPN permitidas.",
			}).catch(() => {});
			res.status(403).json({
				error: "Acesso permitido apenas pela VPN corporativa.",
				code: "VPN_REQUIRED",
			});
		} catch (error) {
			next(error);
		}
	};
}

module.exports = {
	checkAccess,
	createMiddleware,
	getClientIp,
	listLogs,
	readConfig,
	saveConfig,
};
