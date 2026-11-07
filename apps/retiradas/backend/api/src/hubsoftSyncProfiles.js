const db = require("./db");
const metrics = require("./metrics");
const documents = require("./documents");
const mapSyncUpdates = require("./mapSyncUpdatesService");
const operationalImports = require("./operationalImports");
const regionaisRepository = require("./regionaisRepository");
const {
	MATCH_IGNORED_OS_TYPES,
	classifyEquipmentByServiceSpeed,
	productionOsTypeIds,
} = require("./hubsoftOsRules");

const CONFIG_PATH = "hubsoft_config/global";
const DEFAULT_INTERNAL_BASE_URL = "https://api.sempre.hubsoft.com.br";
const TIME_ZONE = "America/Sao_Paulo";
const LOCK_TTL_MS = 30 * 60 * 1000;
const PAGE_SIZE = Math.min(
	Math.max(Number(process.env.HUBSOFT_PAGE_SIZE || 1000), 100),
	1000,
);
const HUBSOFT_REQUEST_TIMEOUT_MS = Math.min(
	Math.max(Number(process.env.HUBSOFT_REQUEST_TIMEOUT_MS || 90_000), 15_000),
	5 * 60_000,
);
const SCHEDULER_CHECK_INTERVAL_MS = 60 * 1000;
const MAP_MATCH_RETRY_ATTEMPTS = Math.min(
	Math.max(Number(process.env.HUBSOFT_MAP_MATCH_RETRY_ATTEMPTS || 2), 0),
	5,
);
const MAP_MATCH_RETRY_DELAY_MS = Math.min(
	Math.max(Number(process.env.HUBSOFT_MAP_MATCH_RETRY_DELAY_MS || 30_000), 5_000),
	5 * 60_000,
);
const PAGE_RETRY_ATTEMPTS = Math.min(
	Math.max(Number(process.env.HUBSOFT_PAGE_RETRY_ATTEMPTS || 3), 1),
	5,
);
const PERSIST_BATCH_SIZE = Math.min(
	Math.max(Number(process.env.HUBSOFT_PERSIST_BATCH_SIZE || 500), 100),
	1000,
);
const MAP_MATCH_WATCHDOG_MS = Math.min(
	Math.max(Number(process.env.HUBSOFT_MAP_MATCH_WATCHDOG_MS || 2 * 60 * 60_000), 5 * 60_000),
	4 * 60 * 60_000,
);
const MAP_PHONE_ENRICH_START_DATE =
	process.env.HUBSOFT_MAP_PHONE_ENRICH_START_DATE || "2026-01-01";
const MAP_PHONE_ENRICH_CONCURRENCY = Math.min(
	Math.max(Number(process.env.HUBSOFT_MAP_PHONE_ENRICH_CONCURRENCY || 4), 1),
	5,
);
const MAP_PHONE_LOOKUP_CACHE_TTL_MS = 24 * 60 * 60_000;
const MAP_PHONE_LOOKUP_CACHE_MAX_SIZE = 50_000;
const SCHEDULER_USER = {
	uid: "system",
	email: "system@retiradas.local",
	nome: "Rotina automática HubSoft",
	role: "admin",
};
let schedulerTickRunning = false;
let mapMatchSchedulerRunning = false;
let mapMatchSchedulerStartedAt = 0;
let automationSessionCache = null;
let automationSessionPromise = null;
const mapPhoneLookupCache = new Map();

const PROFILE = Object.freeze({
	MAPA: "MAPA",
	MATCH: "MATCH",
	LOJA: "LOJA",
	MULTAS: "MULTAS",
	META_D0: "META_D0",
	META_D_MINUS_ONE: "META_D_MINUS_ONE",
	META_AUDIT: "META_AUDIT",
	META_AUDIT_DAILY: "META_AUDIT_DAILY",
	META_AUDIT_STORE: "META_AUDIT_STORE",
});

const VISIBLE_PROFILES = [
	PROFILE.MAPA,
	PROFILE.MATCH,
	PROFILE.LOJA,
	PROFILE.MULTAS,
	PROFILE.META_D0,
	PROFILE.META_D_MINUS_ONE,
	PROFILE.META_AUDIT,
];

const RUN_STATUS = Object.freeze({
	RUNNING: "RUNNING",
	COMPLETE: "COMPLETE",
	INCOMPLETE: "INCOMPLETE",
	FAILED: "FAILED",
	FAILED_AUTH: "FAILED_AUTH",
	SUSPICIOUS: "SUSPICIOUS",
	SCHEMA_CHANGED: "SCHEMA_CHANGED",
	VALID_EMPTY_RESULT: "VALID_EMPTY_RESULT",
	DIVERGENT: "DIVERGENT",
});

const MAPA_TYPE_IDS = productionOsTypeIds();
const MATCH_IGNORED_TYPE_IDS = new Set(
	MATCH_IGNORED_OS_TYPES.map(([id]) => Number(id)),
);
const MATCH_KNOWN_IGNORED = MATCH_IGNORED_OS_TYPES;
const META_TYPE_IDS = MAPA_TYPE_IDS;
const LOJA_ATTENDANCE_TYPE_ID = 826;
const MULTA_EQUIPAMENTO_ATTENDANCE_TYPE_ID = 944;
const META_MOTIVO_CONCLUIDA_ID = 135;

function cleanText(value) {
	return String(value || "").trim();
}

function asPositiveNumber(value, fallback, { min = 1, max = 24 * 60 } = {}) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(Math.max(Math.round(numeric), min), max);
}

function normalizeTime(value, fallback = "03:00") {
	const match = cleanText(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return fallback;
	const hour = Math.min(Math.max(Number(match[1]), 0), 23);
	const minute = Math.min(Math.max(Number(match[2]), 0), 59);
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeCheckpointHours(value) {
	const items = Array.isArray(value)
		? value
		: cleanText(value || "11,14,16,18,23").split(/[,;\s]+/);
	return [
		...new Set(
			items
				.map((item) => Number(item))
				.filter((item) => Number.isInteger(item) && item >= 0 && item <= 23),
		),
	].sort((a, b) => a - b);
}

function normalizeAutomationConfig(config = {}) {
	return {
		autoSyncEnabled: config.autoSyncEnabled !== false,
		autoDailyIntervalMinutes: asPositiveNumber(
			config.autoDailyIntervalMinutes,
			30,
			{ min: 5, max: 24 * 60 },
		),
		autoDailyCheckpointHours: normalizeCheckpointHours(
			config.autoDailyCheckpointHours,
		),
		autoMetaTime: normalizeTime(config.autoMetaTime, "03:00"),
		autoFinesIntervalMinutes: asPositiveNumber(
			config.autoFinesIntervalMinutes,
			60,
			{ min: 15, max: 24 * 60 },
		),
		autoMapMatchIntervalMinutes: asPositiveNumber(
			config.autoMapMatchIntervalMinutes,
			60,
			{ min: 15, max: 24 * 60 },
		),
		autoMapMatchEnabled: config.autoMapMatchEnabled !== false,
		autoMetaEnabled: config.autoMetaEnabled !== false,
		autoFinesEnabled: config.autoFinesEnabled !== false,
		autoDailyEnabled: config.autoDailyEnabled !== false,
	};
}

function isMetaProfile(profile) {
	return [
		PROFILE.META_D0,
		PROFILE.META_D_MINUS_ONE,
		PROFILE.META_AUDIT_DAILY,
	].includes(profile);
}

function isStoreProfile(profile) {
	return [PROFILE.LOJA, PROFILE.META_AUDIT_STORE].includes(profile);
}

function isFinesProfile(profile) {
	return profile === PROFILE.MULTAS;
}

function isPeriodSnapshotProfile(profile) {
	return isMetaProfile(profile) || isStoreProfile(profile) || isFinesProfile(profile);
}

function operationalProfileFor(profile) {
	if (profile === PROFILE.META_AUDIT_DAILY) return PROFILE.META_D0;
	if (profile === PROFILE.META_AUDIT_STORE) return PROFILE.LOJA;
	return profile;
}

function normalizeText(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizeCityKey(value) {
	return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

function todaySaoPaulo() {
	const text = new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
	return text;
}

function parseDateOnly(value) {
	const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
}

function addDays(dateText, days) {
	const date = parseDateOnly(dateText) || parseDateOnly(todaySaoPaulo());
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function addMonths(dateText, months) {
	const date = parseDateOnly(dateText) || parseDateOnly(todaySaoPaulo());
	date.setUTCMonth(date.getUTCMonth() + months);
	return date.toISOString().slice(0, 10);
}

function toSaoPauloDateOnly(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function toHubsoftDate(dateText, endOfDay = false) {
	const date = parseDateOnly(dateText);
	if (!date) return "";
	if (endOfDay) {
		date.setUTCHours(23, 59, 59, 0);
	}
	return date.toISOString();
}

function toHubsoftDateOnly(dateText) {
	const date = parseDateOnly(dateText);
	if (!date) return "";
	return date.toISOString().slice(0, 10);
}

function currentMapPeriod(referenceDate = todaySaoPaulo()) {
	const date = parseDateOnly(referenceDate) || new Date();
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const end = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));
	return {
		inicio: `${year}-01-01`,
		fim: end.toISOString().slice(0, 10),
	};
}

function normalizeBaseUrl(value) {
	const url = cleanText(value || DEFAULT_INTERNAL_BASE_URL).replace(/\/+$/, "");
	if (!url) return DEFAULT_INTERNAL_BASE_URL;
	return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function readConfig() {
	const item = await documents.getDocument(CONFIG_PATH).catch(() => null);
	return item?.data || {};
}

async function saveSchedulerState(patch = {}) {
	const current = await readConfig();
	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: "hubsoft_config",
		documentId: "global",
		parentPath: null,
		data: {
			...current,
			...patch,
			autoSyncLastSchedulerAt: new Date().toISOString(),
		},
	});
}

function sanitizeErrorMessage(error) {
	return cleanText(error?.message || error || "")
		.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
		.slice(0, 500);
}

async function parseResponse(response) {
	const text = await response.text();
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return { raw: text.slice(0, 500) };
	}
}

async function fetchWithTimeout(url, options = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), HUBSOFT_REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, {
			...options,
			signal: controller.signal,
		});
	} catch (error) {
		if (error?.name === "AbortError") {
			const timeoutError = new Error("Tempo esgotado ao consultar HubSoft.");
			timeoutError.code = "FAILED";
			timeoutError.statusCode = 504;
			throw timeoutError;
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

async function authenticateWithOAuth(config) {
	const baseUrl = normalizeBaseUrl(config.baseUrl || process.env.HUBSOFT_BASE_URL);
	const clientId = cleanText(config.clientId || process.env.HUBSOFT_CLIENT_ID);
	const clientSecret = cleanText(
		config.clientSecret || process.env.HUBSOFT_CLIENT_SECRET,
	);
	const username = cleanText(config.username || process.env.HUBSOFT_USERNAME);
	const password = cleanText(config.password || process.env.HUBSOFT_PASSWORD);
	const grantType = cleanText(config.grantType || "password");
	if (!clientId || !clientSecret || !username || !password) return null;

	const response = await fetchWithTimeout(`${baseUrl}/oauth/token`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			username,
			password,
			grant_type: grantType,
		}),
	});
	const payload = await parseResponse(response);
	if (!response.ok || !payload?.access_token) {
		const error = new Error(
			payload?.message || payload?.error || `HubSoft HTTP ${response.status}`,
		);
		error.code = "FAILED_AUTH";
		throw error;
	}
	return {
		baseUrl,
		token: payload.access_token,
		tokenType: payload.token_type || "Bearer",
	};
}

async function authenticateWithPlaywright(config) {
	const username = cleanText(
		config.webUsername ||
			process.env.HUBSOFT_WEB_USERNAME ||
			config.username ||
			process.env.HUBSOFT_USERNAME,
	);
	const password = cleanText(
		config.webPassword ||
			process.env.HUBSOFT_WEB_PASSWORD ||
			config.password ||
			process.env.HUBSOFT_PASSWORD,
	);
	if (!username || !password) return null;
	let chromium;
	try {
		({ chromium } = require("playwright"));
	} catch {
		const error = new Error(
			"Login HubSoft configurado, mas o Playwright nao esta instalado no backend.",
		);
		error.code = "FAILED_AUTH";
		error.statusCode = 400;
		throw error;
	}
	const webBase = normalizeBaseUrl(
		config.webBaseUrl ||
			process.env.HUBSOFT_WEB_BASE_URL ||
			"https://sempre.hubsoft.com.br",
	);
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const firstVisible = async (locator) => {
			const count = await locator.count().catch(() => 0);
			for (let index = 0; index < count; index += 1) {
				const item = locator.nth(index);
				if (await item.isVisible().catch(() => false)) return item;
			}
			return locator.first();
		};
		const fillInput = async (locator, value) => {
			const input = await firstVisible(locator);
			await input.waitFor({ state: "visible", timeout: 30_000 });
			await input.click({ timeout: 10_000 }).catch(() => {});
			await input.fill("");
			await input.type(value, { delay: 20 });
			await input.evaluate((element) => {
				element.dispatchEvent(new Event("input", { bubbles: true }));
				element.dispatchEvent(new Event("change", { bubbles: true }));
				element.dispatchEvent(new Event("blur", { bubbles: true }));
			});
		};
		const submitByText = async (label, fallbackInput) => {
			const target = page.getByText(label, { exact: false }).last();
			await page
				.waitForFunction((text) => {
					const candidates = [
						...globalThis.document.querySelectorAll(
							"button, [role='button'], a, span",
						),
					];
					return candidates.some((element) => {
						const content = String(element.textContent || "").trim().toUpperCase();
						const disabled =
							element.disabled ||
							element.getAttribute("aria-disabled") === "true" ||
							String(element.className || "").toLowerCase().includes("disabled");
						return content.includes(text) && !disabled;
					});
				}, String(label).toUpperCase(), { timeout: 10_000 })
				.catch(() => {});
			try {
				await target.click({ timeout: 10_000 });
			} catch {
				await fallbackInput.first().press("Enter");
			}
		};
		await page.goto(`${webBase}/login`, {
			waitUntil: "domcontentloaded",
			timeout: 60_000,
		});
		const usernameInput = page.locator(
			'input[type="email"], input[name="email"], input[type="text"]',
		);
		await fillInput(usernameInput, username);
		await submitByText("VALIDAR", usernameInput);
		const passwordInput = page.locator(
			'input[type="password"], input[name*="senha" i], input[name*="password" i]',
		);
		await firstVisible(passwordInput).then((input) =>
			input.waitFor({ state: "visible", timeout: 20_000 }),
		);
		await fillInput(passwordInput, password);
		await submitByText("ENTRAR", passwordInput);
		await page.waitForFunction(() => {
			try {
				const value = JSON.parse(localStorage.getItem("auth") || "null");
				return Boolean(value?.login?.access_token || value?.login?.token || value?.access_token || value?.token);
			} catch { return false; }
		}, null, { timeout: 20_000 }).catch(() => {});
		const auth = await page.evaluate(() => {
			const raw = localStorage.getItem("auth");
			const parsed = raw ? JSON.parse(raw) : null;
			const login = parsed?.login || parsed || {};
			const token = login.access_token || login.token || parsed?.access_token;
			const tokenType = login.token_type || parsed?.token_type || "Bearer";
			return token ? { token, tokenType } : null;
		});
		if (!auth?.token) {
			const notices = await page.locator('[role="alert"], .alert-danger, md-toast, .toast-message').allTextContents().catch(() => []);
			const detail = notices.join(" ").replaceAll(password, "[redacted]").replaceAll(username, "[usuario]").trim().slice(0, 250);
			const error = new Error(`HubSoft web auth nao retornou token.${detail ? ` ${detail}` : " Verifique as credenciais e eventuais etapas adicionais de login."}`);
			error.code = "FAILED_AUTH";
			throw error;
		}
		return {
			baseUrl: normalizeBaseUrl(
				config.internalBaseUrl ||
					process.env.HUBSOFT_INTERNAL_BASE_URL ||
					DEFAULT_INTERNAL_BASE_URL,
			),
			token: auth.token,
			tokenType: auth.tokenType,
		};
	} finally {
		await browser.close().catch(() => {});
	}
}

function currentSessionDay() {
	return todaySaoPaulo();
}

function isReusableAutomationSession(session) {
	return Boolean(
		session?.token &&
			session.sessionDay === currentSessionDay(),
	);
}

async function buildAutomationSession() {
	const config = await readConfig();
	const configuredToken = cleanText(
		config.accessToken || process.env.HUBSOFT_ACCESS_TOKEN,
	);
	if (configuredToken) {
		return {
			baseUrl: normalizeBaseUrl(
				config.internalBaseUrl ||
					process.env.HUBSOFT_INTERNAL_BASE_URL ||
					config.baseUrl ||
					DEFAULT_INTERNAL_BASE_URL,
			),
			token: configuredToken,
			tokenType: cleanText(config.tokenType || "Bearer"),
			sessionDay: currentSessionDay(),
			managed: true,
		};
	}
	const session =
		(await authenticateWithOAuth(config)) ||
		(await authenticateWithPlaywright(config));
	if (!session?.token) {
		const error = new Error(
			"Configure as credenciais do HubSoft antes de sincronizar: informe token, OAuth ou login/senha de acesso.",
		);
		error.code = "FAILED_AUTH";
		error.statusCode = 400;
		throw error;
	}
	return {
		...session,
		sessionDay: currentSessionDay(),
		managed: true,
	};
}

async function getSession({ force = false } = {}) {
	if (!force && isReusableAutomationSession(automationSessionCache)) {
		return automationSessionCache;
	}
	if (automationSessionPromise) return automationSessionPromise;
	automationSessionPromise = buildAutomationSession()
		.then((session) => {
			automationSessionCache = session;
			return session;
		})
		.finally(() => {
			automationSessionPromise = null;
		});
	return automationSessionPromise;
}

async function refreshAutomationSession(failedSession) {
	if (
		isReusableAutomationSession(automationSessionCache) &&
		automationSessionCache.token !== failedSession?.token
	) {
		return automationSessionCache;
	}
	automationSessionCache = null;
	return getSession({ force: true });
}

async function hubsoftRequest(
	session,
	path,
	{ method = "GET", body, retryAuthentication = true } = {},
) {
	if (!session?.token) {
		const error = new Error("Sessao HubSoft indisponivel.");
		error.code = "FAILED_AUTH";
		error.statusCode = 400;
		throw error;
	}
	const url = /^https?:\/\//i.test(path) ? path : `${session.baseUrl}${path}`;
	const response = await fetchWithTimeout(url, {
		method,
		headers: {
			Accept: "application/json",
			Authorization: `${session.tokenType || "Bearer"} ${session.token}`,
			...(body ? { "Content-Type": "application/json;charset=UTF-8" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	const payload = await parseResponse(response);
	if (
		response.status === 401 &&
		retryAuthentication &&
		session.managed
	) {
		const refreshed = await refreshAutomationSession(session);
		Object.assign(session, refreshed);
		return hubsoftRequest(session, path, {
			method,
			body,
			retryAuthentication: false,
		});
	}
	if (!response.ok) {
		const error = new Error(
			payload?.message || payload?.error || `HubSoft HTTP ${response.status}`,
		);
		error.code = response.status === 401 || response.status === 403 ? "FAILED_AUTH" : "FAILED";
		error.statusCode = response.status;
		throw error;
	}
	return payload;
}

function flattenFinanceCharges(payload = {}) {
	const groups = payload?.cobrancas_agrupadas?.data || [];
	const charges = [];
	for (const group of groups) {
		const rows = group?.cobrancas?.data || [];
		for (const row of rows) {
			charges.push({
				...row,
				groupVencimento: group.vencimento,
				groupVencimentoBr: group.vencimento_br,
			});
		}
	}
	return charges;
}

function isEquipmentFineCharge(charge = {}) {
	const description = normalizeText(charge.descricao);
	return description.includes("MULTA") && description.includes("EQUIPAMENTO");
}

function pickFineCharges(record, charges) {
	const serviceId = cleanText(record?.raw_excerpt?.id_cliente_servico);
	const candidates = charges.filter(isEquipmentFineCharge);
	if (!serviceId) return candidates;
	const exact = candidates.filter(
		(charge) => cleanText(charge.id_cliente_servico) === serviceId,
	);
	return exact.length ? exact : candidates;
}

async function fetchFinanceCharges(session, record) {
	const clientId = cleanText(record?.raw_excerpt?.id_cliente);
	if (!clientId) return [];
	const baseDate = toSaoPauloDateOnly(record.source_date) || todaySaoPaulo();
	const payload = await hubsoftRequest(
		session,
		"/api/v1/cliente/financeiro/cobranca/agrupadas/paginado/50?page=1",
		{
			method: "POST",
			body: {
				filtros: {
					id_cliente: clientId,
					cliente_servico: null,
					data_inicio: addMonths(baseDate, -6),
					data_fim: addMonths(baseDate, 12),
					tipo: "ativo",
					situacao: "todos",
				},
			},
		},
	);
	return flattenFinanceCharges(payload);
}

async function enrichFineRecordsWithFinance(session, records = [], onProgress) {
	if (!session?.token || !records.length) return records;
	const cache = new Map();
	const enriched = new Array(records.length);
	let cursor = 0;
	let processed = 0;
	const concurrency = Math.min(6, records.length);
	const enrichRecord = async (record) => {
		const clientId = cleanText(record?.raw_excerpt?.id_cliente);
		if (!clientId) return record;
		if (!cache.has(clientId)) {
			cache.set(
				clientId,
				fetchFinanceCharges(session, record).catch((error) => ({ error })),
			);
		}
		const result = await cache.get(clientId);
		const charges = Array.isArray(result) ? result : [];
		const fineCharges = pickFineCharges(record, charges);
		if (!fineCharges.length) return record;
		const valorLancado = fineCharges.reduce(
			(total, charge) => total + (Number(charge.valor) || 0),
			0,
		);
		const saldo = fineCharges.reduce(
			(total, charge) => total + (Number(charge.saldo) || 0),
			0,
		);
		const finance = {
			totalCharges: fineCharges.length,
			ids: fineCharges.map((charge) => charge.id_cobranca),
			descriptions: fineCharges.map((charge) => charge.descricao),
			dueDates: [
				...new Set(
					fineCharges
						.map((charge) => charge.data_vencimento_br || charge.data_vencimento)
						.filter(Boolean),
				),
			],
			lancadoPor:
				[
					...new Set(
						fineCharges
							.map((charge) => cleanText(charge.id_usuario_cadastro))
							.filter(Boolean),
					),
				].join(", ") || "",
			valorLancado,
			saldo,
			auditReason: fineCharges
				.map((charge) => `${charge.id_cobranca} - ${charge.descricao}`)
				.join("; "),
			reconciledAt: new Date().toISOString(),
		};
		return {
			...record,
			raw_excerpt: {
				...(record.raw_excerpt || {}),
				finance,
			},
		};
	};
	const workers = Array.from({ length: concurrency }, async () => {
		while (cursor < records.length) {
			const index = cursor;
			cursor += 1;
			enriched[index] = await enrichRecord(records[index]);
			processed += 1;
			if (processed % 10 === 0 || processed === records.length) {
				await onProgress?.({
					stage: `Conciliando financeiro ${processed}/${records.length}`,
					percent: Math.min(70, 62 + Math.round((processed / records.length) * 8)),
				});
			}
		}
	});
	await Promise.all(workers);
	return enriched;
}

async function requestHubsoft(path, options = {}) {
	const session = await getSession();
	return hubsoftRequest(session, path, options);
}

function rowsOf(payload) {
	return (
		payload?.ordens_servico?.data ||
		payload?.paginador?.data ||
		payload?.data?.data ||
		payload?.data ||
		payload?.dados ||
		[]
	);
}

function paginationOf(payload, rows) {
	const page = payload?.ordens_servico || payload?.paginador || payload || {};
	const total = Number(page.total ?? payload?.total ?? rows.length);
	const perPage = Number(page.per_page ?? page.itens_por_pagina ?? PAGE_SIZE);
	const lastPage = Number(
		page.last_page ?? page.total_paginas ?? Math.max(1, Math.ceil(total / perPage)),
	);
	return {
		total,
		perPage,
		currentPage: Number(page.current_page ?? page.pagina ?? 1),
		lastPage,
	};
}

function assertEnvelope(payload, rows) {
	if (!payload || typeof payload !== "object" || !Array.isArray(rows)) {
		const error = new Error("Envelope HubSoft inesperado.");
		error.code = "SCHEMA_CHANGED";
		throw error;
	}
}

async function fetchCreateMetadata(session) {
	return hubsoftRequest(session, "/api/v1/ordem_servico/create");
}

function findTypes(createPayload, ids) {
	const set = new Set([...ids].map(Number));
	return (createPayload?.tipos_ordem_servico || [])
		.filter((type) => set.has(Number(type.id_tipo_ordem_servico)))
		.map((type) => ({
			id_tipo_ordem_servico: Number(type.id_tipo_ordem_servico),
			descricao: type.descricao,
			display: type.display || type.descricao,
			tempo_alocacao_agenda: type.tempo_alocacao_agenda,
			prioridade: type.prioridade,
		}));
}

function findMotivoConcluida(createPayload) {
	return (
		(createPayload?.motivo_fechamento || []).find(
			(item) => Number(item.id_motivo_fechamento) === META_MOTIVO_CONCLUIDA_ID,
		) || { id_motivo_fechamento: META_MOTIVO_CONCLUIDA_ID, descricao: "CONCLUÍDA" }
	);
}

function baseReportPayload({ period, types }) {
	return {
		data_inicio: toHubsoftDate(period.inicio),
		data_fim: toHubsoftDate(period.fim),
		tipo_data: "data_cadastro",
		status_ordem_servico: ["aguardando_agendamento", "pendente"],
		tipo_ordem_servicos: types,
		pagina: 1,
		itens_por_pagina: PAGE_SIZE,
	};
}

function metaPayload({ date, startDate, endDate, createPayload }) {
	const initialDate = startDate || date;
	const finalDate = endDate || date || initialDate;
	return {
		tipo_data: "data_termino_executado",
		order_by: "data_termino_executado",
		order_by_key: "ASC",
		status_ordem_servico: ["finalizado"],
		prioridade: [],
		reservada: null,
		assinatura_cliente: null,
		motivo_fechamento: [findMotivoConcluida(createPayload)],
		pop: [],
		periodos: [],
		tipo_ordem_servicos: findTypes(createPayload, META_TYPE_IDS),
		usuario_abertura: [],
		tecnicos: [],
		participantes: [],
		agendas: [],
		fluxo_aprovacao_configuracao: [],
		cidades: [],
		servico: [],
		servico_status: [],
		grupos_clientes: [],
		grupos_clientes_servicos: [],
		bairros: null,
		condominios: null,
		data_inicio: toHubsoftDate(initialDate),
		data_fim: toHubsoftDate(finalDate, true),
	};
}

function finesPayload({ date, startDate, endDate }) {
	const initialDate = startDate || date;
	const finalDate = endDate || date || initialDate;
	return {
		data_inicio: toHubsoftDateOnly(initialDate),
		data_fim: toHubsoftDateOnly(finalDate),
		tipo_data: "data_cadastro",
		order_by: "data_cadastro",
		order_by_key: "ASC",
		tipo_endereco: { valor: "instalacao" },
		tipo_atendimento: [
			{
				id_tipo_atendimento: MULTA_EQUIPAMENTO_ATTENDANCE_TYPE_ID,
				descricao: "MULTA - EQUIPAMENTO",
			},
		],
		pagina: 1,
		itens_por_pagina: PAGE_SIZE,
	};
}

function finesSchedulerOptions(date) {
	return {
		date,
		skipFineFinanceEnrichment: true,
	};
}

async function collectPaginated(
	session,
	{ path, payload, pageMode = "query", onProgress, maxPages = 500 },
) {
	const all = [];
	let expectedTotal = 0;
	let expectedPages = 1;
	let receivedPages = 0;
	for (let page = 1; page <= expectedPages; page += 1) {
		await onProgress?.({
			stage: `Consultando HubSoft pagina ${page}/${expectedPages}`,
			percent: Math.min(45, 15 + page),
		});
		const body =
			pageMode === "body" ? { ...payload, pagina: page, page } : payload;
		const targetPath = pageMode === "query" ? `${path}?page=${page}` : path;
		let json;
		for (let attempt = 1; attempt <= PAGE_RETRY_ATTEMPTS; attempt += 1) {
			try {
				json = await hubsoftRequest(session, targetPath, { method: "POST", body });
				break;
			} catch (error) {
				if (attempt >= PAGE_RETRY_ATTEMPTS || ["SCHEMA_CHANGED", "FAILED_AUTH"].includes(error?.code)) throw error;
				const backoff = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
				await onProgress?.({ stage: `Retentando pagina ${page} (${attempt}/${PAGE_RETRY_ATTEMPTS})`, percent: Math.min(45, 15 + page), checkpointPage: page - 1 });
				await wait(backoff);
			}
		}
		const rows = rowsOf(json);
		assertEnvelope(json, rows);
		const pagination = paginationOf(json, rows);
		expectedTotal = pagination.total;
		expectedPages = pagination.lastPage;
		receivedPages += 1;
		all.push(...rows);
		if (expectedPages > maxPages) {
			const error = new Error("Paginacao HubSoft suspeita.");
			error.code = "SUSPICIOUS";
			throw error;
		}
	}
	return {
		rows: all,
		expectedTotal,
		expectedPages,
		receivedPages,
	};
}

async function collectFirstNonEmpty(session, attempts, onProgress) {
	let last = null;
	for (const attempt of attempts) {
		await onProgress?.({
			stage: `Consultando HubSoft (${attempt.label})`,
			percent: attempt.percent || 20,
		});
		const collected = await collectPaginated(session, {
			path: attempt.path,
			payload: attempt.payload,
			pageMode: attempt.pageMode || "body",
			onProgress,
		});
		last = { ...collected, attemptLabel: attempt.label };
		if (collected.rows.length > 0 || Number(collected.expectedTotal || 0) > 0) {
			return last;
		}
	}
	return last;
}

async function collectProfile(profile, options = {}) {
	const session = await getSession();
	await options.onProgress?.({ stage: "Sessao HubSoft autenticada", percent: 8 });
	const createPayload =
		isFinesProfile(profile) || isStoreProfile(profile)
			? null
			: await fetchCreateMetadata(session);
	if (createPayload) {
		await options.onProgress?.({
			stage: "Metadados HubSoft carregados",
			percent: 12,
		});
	}
	if (isMetaProfile(profile)) {
		const date =
			options.date ||
			(profile === PROFILE.META_D_MINUS_ONE
				? addDays(todaySaoPaulo(), -1)
				: todaySaoPaulo());
		const startDate = options.startDate || date;
		const endDate = options.endDate || date;
		const payload = metaPayload({ date, startDate, endDate, createPayload });
		const collected = await collectPaginated(session, {
			path: `/api/v1/ordem_servico/consultar/paginado/${PAGE_SIZE}`,
			payload,
			pageMode: "query",
			onProgress: options.onProgress,
		});
		return {
			...collected,
			requestSummary: {
				date,
				startDate,
				endDate,
				tipo_data: payload.tipo_data,
				status_ordem_servico: payload.status_ordem_servico,
				motivo_fechamento: payload.motivo_fechamento.map((item) => ({
					id_motivo_fechamento: item.id_motivo_fechamento,
					descricao: item.descricao,
				})),
				tipo_ordem_servicos: payload.tipo_ordem_servicos.map((item) => ({
					id_tipo_ordem_servico: item.id_tipo_ordem_servico,
					descricao: item.descricao,
				})),
			},
		};
	}

	if (isFinesProfile(profile)) {
		const date = options.date || todaySaoPaulo();
		const startDate = options.startDate || date;
		const endDate = options.endDate || date;
		const payload = finesPayload({ date, startDate, endDate });
		const collected = await collectPaginated(session, {
			path: "/api/v1/relatorio/atendimento",
			payload,
			pageMode: "body",
			onProgress: options.onProgress,
			maxPages: 2000,
		});
		return {
			...collected,
			hubsoftSession: session,
			requestSummary: {
				date,
				startDate,
				endDate,
				tipo_data: payload.tipo_data,
				tipo_atendimento: payload.tipo_atendimento,
				tipo_endereco: payload.tipo_endereco,
			},
		};
	}

	if (isStoreProfile(profile)) {
		const date = options.date || addDays(todaySaoPaulo(), -1);
		const startDate = options.startDate || date;
		const endDate = options.endDate || date;
		const basePayload = {
			data_inicio: toHubsoftDateOnly(startDate),
			data_fim: toHubsoftDateOnly(endDate),
			tipo_data: "data_fechamento",
			order_by: "data_fechamento",
			order_by_key: "ASC",
			tipo_endereco: { valor: "instalacao" },
			tipo_atendimento: [
				{
					id_tipo_atendimento: LOJA_ATTENDANCE_TYPE_ID,
					descricao: " ENTREGA DE EQUIPAMENTO EM LOJA",
				},
			],
			status_atendimento: [
				{
					id_atendimento_status: 3,
					prefixo: "resolvido",
					descricao: "RESOLVIDO",
				},
			],
			status_fechamento: [{ descricao: "Concluído", valor: "concluido" }],
			pagina: 1,
			itens_por_pagina: PAGE_SIZE,
		};
		const collected = await collectFirstNonEmpty(
			session,
			[
				{
					label: "relatorio/atendimento concluido",
					path: "/api/v1/relatorio/atendimento",
					payload: basePayload,
					pageMode: "body",
					percent: 20,
				},
				{
					label: "relatorio/atendimento sem status",
					path: "/api/v1/relatorio/atendimento",
					payload: {
						...basePayload,
						status_fechamento: undefined,
					},
					pageMode: "body",
					percent: 32,
				},
			],
			options.onProgress,
		);
		return {
			...collected,
			requestSummary: {
				date,
				startDate,
				endDate,
				attempt: collected?.attemptLabel || null,
				tipo_data: basePayload.tipo_data,
				tipo_atendimento: basePayload.tipo_atendimento,
				status_atendimento: basePayload.status_atendimento,
				status_fechamento: basePayload.status_fechamento,
			},
		};
	}

	const period = options.period || currentMapPeriod(options.date);
	const allTypes = createPayload?.tipos_ordem_servico || [];
	const types =
		profile === PROFILE.MAPA
			? findTypes(createPayload, MAPA_TYPE_IDS)
			: allTypes
					.filter(
						(type) =>
							!MATCH_IGNORED_TYPE_IDS.has(Number(type.id_tipo_ordem_servico)),
					)
					.map((type) => ({
						id_tipo_ordem_servico: Number(type.id_tipo_ordem_servico),
						descricao: type.descricao,
						display: type.display || type.descricao,
					}));
	if (profile === PROFILE.MATCH) {
		await Promise.all(
			MATCH_KNOWN_IGNORED.map(([id, descricao]) =>
				db.query(
					`insert into hubsoft_unknown_os_types
              (id_tipo_ordem_servico, descricao, status, source_payload)
             values ($1, $2, 'IGNORED', $3::jsonb)
             on conflict (id_tipo_ordem_servico) do update set
               descricao = excluded.descricao,
               last_seen_at = now()`,
					[id, descricao, JSON.stringify({ source: "built_in_ignore" })],
				),
			),
		);
	}
	const payload = baseReportPayload({ period, types });
	const collected = await collectPaginated(session, {
		path: `/api/v1/ordem_servico/consultar/paginado/${PAGE_SIZE}`,
		payload,
		pageMode: "query",
		onProgress: options.onProgress,
	});
	const mapPhoneEnrichment =
		profile === PROFILE.MAPA
			? await enrichMapRowsWithMissingPhones(session, collected.rows, options)
			: { rows: collected.rows, summary: null };
	return {
		...collected,
		rows: mapPhoneEnrichment.rows,
		requestSummary: {
			period,
			tipo_data: payload.tipo_data,
			status_ordem_servico: payload.status_ordem_servico,
			phoneEnrichment: mapPhoneEnrichment.summary,
			tipo_ordem_servicos: types.map((item) => ({
				id_tipo_ordem_servico: item.id_tipo_ordem_servico,
				descricao: item.descricao,
			})),
		},
	};
}

function uniqueKeyFor(profile, row) {
	if (isStoreProfile(profile) || isFinesProfile(profile)) {
		return cleanText(row.id_atendimento || row.protocolo);
	}
	return cleanText(row.id_ordem_servico || row.numero_ordem_servico);
}

function extractTechnicians(row = {}) {
	const list = Array.isArray(row.tecnicos)
		? row.tecnicos
		: Array.isArray(row.ordem_servico_tecnico)
			? row.ordem_servico_tecnico.map((item) => item.usuario || item)
			: [];
	return list
		.map((item) => ({
			id: Number(item.id || item.id_usuario || item.id_tecnico || 0) || null,
			name: cleanText(item.name || item.nome || item.display || item.descricao),
		}))
		.filter((item) => item.id || item.name);
}

function extractCity(row = {}) {
	return (
		row?.cliente_servico?.endereco_instalacao?.endereco_numero?.cidade?.nome ||
		row?.cliente_servico?.cliente_servico_endereco?.find?.(
			(item) => item?.tipo === "instalacao",
		)?.endereco_numero?.cidade?.nome ||
		row?.cliente_servico?.cliente_servico_endereco?.[0]?.endereco_numero?.cidade
			?.nome ||
		row?.cidade?.nome ||
		row?.cidade ||
		row?.endereco_instalacao?.cidade?.nome ||
		null
	);
}

function extractCityId(row = {}) {
	return (
		row?.cliente_servico?.endereco_instalacao?.endereco_numero?.cidade
			?.id_cidade ||
		row?.cliente_servico?.cliente_servico_endereco?.find?.(
			(item) => item?.tipo === "instalacao",
		)?.endereco_numero?.cidade?.id_cidade ||
		row?.cliente_servico?.cliente_servico_endereco?.[0]?.endereco_numero?.cidade
			?.id_cidade ||
		row?.cidade?.id_cidade ||
		null
	);
}

function extractOrderType(row = {}) {
	return (
		row?.tipo_ordem_servico?.descricao ||
		row?.tipo_atendimento?.descricao ||
		(typeof row?.tipo_atendimento === "string" ? row.tipo_atendimento : "") ||
		row?.tipo_ordem_servico ||
		row?.tipo ||
		""
	);
}

function extractOrderTypeId(row = {}) {
	return Number(
		row?.tipo_ordem_servico?.id_tipo_ordem_servico ||
			row?.tipo_atendimento?.id_tipo_atendimento ||
			row?.id_tipo_atendimento ||
			row?.id_tipo_ordem_servico ||
			0,
	);
}

function extractMotivo(row = {}) {
	return row?.motivo_fechamento?.descricao || row?.motivo_fechamento || "";
}

function extractServiceName(row = {}) {
	const servico = row?.cliente_servico || row?.servico || {};
	return cleanText(
		row.servico ||
			row.plano ||
			row.nome_plano ||
			servico.display ||
			servico.descricao ||
			servico.servico?.descricao ||
			servico.plano?.descricao ||
			"",
	);
}

function extractClientId(row = {}) {
	return cleanText(
		row.id_cliente ||
			row.cliente?.id_cliente ||
			row.cliente_servico?.id_cliente ||
			row.cliente_servico?.cliente?.id_cliente ||
			"",
	);
}

function extractClientCode(row = {}) {
	return cleanText(
		row.codigo_cliente ||
			row.cliente?.codigo_cliente ||
			row.cliente_servico?.cliente?.codigo_cliente ||
			"",
	);
}

function extractClientName(row = {}) {
	const cliente = row.cliente || row.cliente_servico?.cliente || {};
	return cleanText(
		row.nome_razaosocial ||
			cliente.nome_razaosocial ||
			cliente.nome ||
			row.cliente_nome ||
			"",
	);
}

function extractStatus(row = {}) {
	return row?.status || row?.status_ordem_servico || "";
}

function extractDateFromHubsoftProtocol(value) {
	const digits = cleanText(value).replace(/\D/g, "");
	if (digits.length < 8) return null;
	const year = digits.slice(0, 4);
	const month = digits.slice(4, 6);
	const day = digits.slice(6, 8);
	if (!/^20\d{2}$/.test(year)) return null;
	const parsed = new Date(`${year}-${month}-${day}T00:00:00-03:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	return `${year}-${month}-${day}`;
}

function extractSourceDate(row = {}) {
	return (
		row?.data_termino_executado ||
		row?.data_termino_executado_br ||
		row?.data_fechamento ||
		row?.data_fechamento_br ||
		row?.data_resolucao ||
		row?.data_resolucao_br ||
		row?.data_cadastro ||
		row?.data_cadastro_br ||
		row?.created_at ||
		extractDateFromHubsoftProtocol(row?.protocolo || row?.numero_protocolo) ||
		null
	);
}

function extractFineRegistrationDate(row = {}) {
	return (
		row?.data_cadastro ||
		row?.data_cadastro_br ||
		row?.created_at ||
		extractDateFromHubsoftProtocol(row?.protocolo || row?.numero_protocolo) ||
		null
	);
}

function safeTimestamp(value) {
	const text = cleanText(value);
	if (!text) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		const date = new Date(`${text}T12:00:00.000-03:00`);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const br = text.match(
		/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
	);
	if (br) {
		const [, day, month, year, hour = "00", minute = "00", second = "00"] = br;
		const date = new Date(
			`${year}-${month}-${day}T${hour}:${minute}:${second}.000-03:00`,
		);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	let iso = text.includes(" ") ? text.replace(" ", "T") : text;
	if (
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(iso)
	) {
		iso = `${iso}-03:00`;
	}
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePhone(value) {
	return cleanText(value).replace(/\D/g, "");
}

function extractPhonesFromText(value) {
	const text = cleanText(value);
	if (!text) return [];
	const phoneLines = text
		.split(/\n+/)
		.filter((line) => /telefone|whats|celular/i.test(line));
	const source = phoneLines.length ? phoneLines.join(" ") : text;
	const lineCandidates = phoneLines
		.map((line) => normalizePhone(line))
		.filter((phone) => phone.length >= 10 && phone.length <= 13);
	const textCandidates = [
		...source.matchAll(/(?:\+?55\D*)?\(?\d{2}\)?\D*9?\d{4}\D*\d{4}/g),
	]
		.map((match) => normalizePhone(match[0]))
		.filter((phone) => phone.length >= 10 && phone.length <= 13);
	return [...lineCandidates, ...textCandidates];
}

const PHONE_FIELD_PATTERN = /(telefone|telefones|celular|whats|whatsapp|fone|contato|contatos)/i;

function collectPhoneCandidatesFromObject(value, candidates = [], seen = new Set(), depth = 0) {
	if (value === null || value === undefined || depth > 6) return candidates;
	if (typeof value === "string" || typeof value === "number") {
		candidates.push(...extractPhonesFromText(value));
		return candidates;
	}
	if (typeof value !== "object") return candidates;
	if (seen.has(value)) return candidates;
	seen.add(value);
	if (Array.isArray(value)) {
		value.forEach((item) =>
			collectPhoneCandidatesFromObject(item, candidates, seen, depth + 1),
		);
		return candidates;
	}
	for (const [key, nested] of Object.entries(value)) {
		if (PHONE_FIELD_PATTERN.test(key)) {
			if (Array.isArray(nested)) {
				nested.forEach((item) =>
					collectPhoneCandidatesFromObject(item, candidates, seen, depth + 1),
				);
			} else if (nested && typeof nested === "object") {
				collectPhoneCandidatesFromObject(nested, candidates, seen, depth + 1);
			} else {
				candidates.push(...extractPhonesFromText(nested));
			}
			continue;
		}
		if (nested && typeof nested === "object") {
			collectPhoneCandidatesFromObject(nested, candidates, seen, depth + 1);
		}
	}
	return candidates;
}

function uniquePhones(values = []) {
	const unique = [];
	const seen = new Set();
	for (const value of values) {
		const phone = normalizePhone(value);
		if (!phone || phone.length < 10 || phone.length > 13 || seen.has(phone)) {
			continue;
		}
		seen.add(phone);
		unique.push(phone);
	}
	return unique;
}

function extractInstallationAddress(row = {}) {
	const addresses = row?.cliente_servico?.cliente_servico_endereco || [];
	const selected =
		row?.cliente_servico?.endereco_instalacao?.endereco_numero ||
		addresses.find?.((item) => item?.tipo === "instalacao")?.endereco_numero ||
		addresses[0]?.endereco_numero ||
		{};
	return {
		endereco:
			selected.endereco ||
			row.endereco ||
			row.endereco_instalacao ||
			row.cliente_servico?.endereco_numero_completo ||
			"",
		numero: selected.numero || row.numero || "",
		bairro: selected.bairro || row.bairro || "",
		coordenadas:
			row.coordenadas ||
			[selected.latitude, selected.longitude].filter(Boolean).join(", "),
	};
}

function adaptReportRow(row = {}) {
	const cliente = row.cliente || row.cliente_servico?.cliente || {};
	const servico = row.cliente_servico || row.servico || {};
	const address = extractInstallationAddress(row);
	const telefones = [
		row.telefone_primario,
		row.telefone_secundario,
		row.telefone_terciario,
		row.telefone_principal,
		row.telefone_cliente,
		row.telefone,
		row.celular,
		row.whatsapp,
		row.fone,
		cliente.telefone_primario,
		cliente.telefone_secundario,
		cliente.telefone_terciario,
		cliente.telefone,
		cliente.celular,
		cliente.whatsapp,
		servico.telefone_primario,
		servico.telefone_secundario,
		servico.telefone_terciario,
		servico.telefone,
		...(Array.isArray(row.telefones) ? row.telefones : []),
		...(Array.isArray(cliente.telefones) ? cliente.telefones : []),
		...(Array.isArray(servico.telefones) ? servico.telefones : []),
		...extractPhonesFromText(row.descricao_abertura),
		...extractPhonesFromText(row.descricao_servico),
		...collectPhoneCandidatesFromObject(row),
	];
	const telefonesUnicos = uniquePhones(telefones);
	return {
		numero_ordem_servico: cleanText(
			row.numero_ordem_servico || row.num_os || row.numero_os,
		),
		status: cleanText(row.status?.descricao || row.status),
		tipo_ordem_servico: cleanText(extractOrderType(row)),
		cidade: cleanText(extractCity(row) || row.cidade),
		codigo_cliente: cleanText(row.codigo_cliente || cliente.codigo_cliente),
		nome_razaosocial: cleanText(
			row.nome_razaosocial || cliente.nome_razaosocial || cliente.nome,
		),
		endereco: cleanText(address.endereco),
		numero: cleanText(address.numero),
		bairro: cleanText(address.bairro),
		telefone_primario: telefonesUnicos[0] || "",
		telefone_secundario: telefonesUnicos[1] || "",
		telefone_terciario: telefonesUnicos[2] || "",
		telefones: telefonesUnicos,
		data_cadastro: cleanText(row.data_cadastro || row.data_cadastro_br),
		servico: cleanText(row.servico || servico.display || servico.descricao),
		numero_plano: cleanText(row.numero_plano || servico.numero_plano),
		id_cliente_servico: cleanText(
			row.id_cliente_servico || servico.id_cliente_servico,
		),
		mac_addr: cleanText(row.mac_addr || row["Mac Addr"]),
		phy_addr: cleanText(row.phy_addr || row["Phy Addr"]),
		coordenadas: cleanText(address.coordenadas),
		tecnicos: extractTechnicians(row)
			.map((item) => item.name)
			.filter(Boolean)
			.join(", "),
	};
}

function phonesFromHubsoftRecord(row = {}) {
	const cliente = row.cliente || row.cliente_servico?.cliente || {};
	const servico = row.cliente_servico || row.servico || {};
	return uniquePhones([
		row.telefone_primario,
		row.telefone_secundario,
		row.telefone_terciario,
		row.telefone_principal,
		row.telefone_cliente,
		row.telefone,
		row.celular,
		row.whatsapp,
		row.fone,
		cliente.telefone_primario,
		cliente.telefone_secundario,
		cliente.telefone_terciario,
		cliente.telefone,
		cliente.celular,
		cliente.whatsapp,
		servico.telefone_primario,
		servico.telefone_secundario,
		servico.telefone_terciario,
		servico.telefone,
		...(Array.isArray(row.telefones) ? row.telefones : []),
		...(Array.isArray(cliente.telefones) ? cliente.telefones : []),
		...(Array.isArray(servico.telefones) ? servico.telefones : []),
		...extractPhonesFromText(row.descricao_abertura),
		...extractPhonesFromText(row.descricao_servico),
		...collectPhoneCandidatesFromObject(row),
	]);
}

function withPhones(row = {}, phones = []) {
	const telefones = uniquePhones([...phonesFromHubsoftRecord(row), ...phones]);
	if (!telefones.length) return row;
	return {
		...row,
		telefone_primario: row.telefone_primario || telefones[0] || "",
		telefone_secundario: row.telefone_secundario || telefones[1] || "",
		telefone_terciario: row.telefone_terciario || telefones[2] || "",
		telefones,
	};
}

function mapOrderNumber(row = {}) {
	return cleanText(
		row.numero_ordem_servico ||
			row.num_os ||
			row.numero_os ||
			row.ordem_servico?.numero_ordem_servico ||
			"",
	);
}

async function reuseStoredMapPhones(rows = []) {
	const orderNumbers = [...new Set(rows.map(mapOrderNumber).filter(Boolean))];
	const clientCodes = [
		...new Set(rows.map((row) => extractClientCode(row)).filter(Boolean)),
	];
	if (!orderNumbers.length && !clientCodes.length) return { rows, reused: 0 };
	const result = await db.query(
		`select num_os, codigo_cliente, telefone, telefones
		   from (
		     select num_os, codigo_cliente, telefone, telefones
		       from ordens_servico
		      where num_os = any($1::text[]) or codigo_cliente = any($2::text[])
		     union all
		     select os as num_os, codigo_cliente, telefone, array[telefone]::text[] as telefones
		       from tentativas_opportunities
		      where os = any($1::text[]) or codigo_cliente = any($2::text[])
		     union all
		     select os as num_os, codigo_cliente, telefone, array[telefone]::text[] as telefones
		       from mensageria_fila
		      where os = any($1::text[]) or codigo_cliente = any($2::text[])
		   ) known_phones
		  where coalesce(telefone, '') <> '' or cardinality(telefones) > 0`,
		[orderNumbers, clientCodes],
	);
	const storedByOrder = new Map();
	const storedByClient = new Map();
	for (const row of result.rows) {
		const phones = uniquePhones([row.telefone, ...(row.telefones || [])]);
		if (!phones.length) continue;
		const orderNumber = cleanText(row.num_os);
		const clientCode = cleanText(row.codigo_cliente);
		if (orderNumber && !storedByOrder.has(orderNumber)) {
			storedByOrder.set(orderNumber, phones);
		}
		if (clientCode && !storedByClient.has(clientCode)) {
			storedByClient.set(clientCode, phones);
		}
	}
	let reused = 0;
	const nextRows = rows.map((row) => {
		if (phonesFromHubsoftRecord(row).length) return row;
		const stored =
			storedByOrder.get(mapOrderNumber(row)) ||
			storedByClient.get(extractClientCode(row)) ||
			[];
		if (!stored.length) return row;
		reused += 1;
		return withPhones(row, stored);
	});
	return { rows: nextRows, reused };
}

function phoneSearchIds(row = {}) {
	return {
		orderId: cleanText(
			row.id_ordem_servico ||
				row.ordem_servico?.id_ordem_servico ||
				row.id ||
				"",
		),
		clientId: cleanText(
			row.id_cliente ||
				row.cliente?.id_cliente ||
				row.cliente_servico?.cliente?.id_cliente ||
				"",
		),
		clientCode: cleanText(extractClientCode(row)).replace(/\D/g, ""),
	};
}

async function tryHubsoftPhonePath(session, path) {
	try {
		const payload = await hubsoftRequest(session, path);
		return phonesFromHubsoftRecord(payload);
	} catch {
		return [];
	}
}

async function fetchPhonesForMapRow(session, row = {}) {
	const ids = phoneSearchIds(row);
	const lookupKey = ids.clientId
		? `client:${ids.clientId}`
		: ids.orderId
			? `order:${ids.orderId}`
			: ids.clientCode
				? `code:${ids.clientCode}`
				: "";
	const cached = lookupKey ? mapPhoneLookupCache.get(lookupKey) : null;
	if (cached && cached.expiresAt > Date.now()) return cached.promise;
	if (cached) mapPhoneLookupCache.delete(lookupKey);

	const lookup = (async () => {
		const paths = [];
		if (ids.clientId) {
			paths.push(
				`/api/v1/cliente/${encodeURIComponent(ids.clientId)}`,
				`/api/v1/integracao/cliente/${encodeURIComponent(ids.clientId)}`,
			);
		}
		if (ids.orderId) {
			paths.push(
				`/api/v1/ordem_servico/${encodeURIComponent(ids.orderId)}`,
				`/api/v1/integracao/ordem_servico/${encodeURIComponent(ids.orderId)}`,
			);
		}
		for (const path of paths) {
			const phones = await tryHubsoftPhonePath(session, path);
			if (phones.length) return phones;
		}
		return [];
	})();

	if (lookupKey) {
		mapPhoneLookupCache.set(lookupKey, {
			expiresAt: Date.now() + MAP_PHONE_LOOKUP_CACHE_TTL_MS,
			promise: lookup,
		});
		while (mapPhoneLookupCache.size > MAP_PHONE_LOOKUP_CACHE_MAX_SIZE) {
			mapPhoneLookupCache.delete(mapPhoneLookupCache.keys().next().value);
		}
	}
	return lookup;
}

async function enrichMapRowsWithMissingPhones(session, rows = [], options = {}) {
	const cached = await reuseStoredMapPhones(rows).catch(() => ({
		rows,
		reused: 0,
	}));
	const requestedStartDate = cleanText(
		options.phoneEnrichmentStartDate || MAP_PHONE_ENRICH_START_DATE,
	);
	const startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate)
		? requestedStartDate
		: "2026-01-01";
	const minDate = new Date(`${startDate}T00:00:00.000-03:00`);
	const indexes = [];
	for (let index = 0; index < cached.rows.length; index += 1) {
		const row = cached.rows[index];
		if (phonesFromHubsoftRecord(row).length) continue;
		const sourceDate = safeTimestamp(extractSourceDate(row));
		if (sourceDate && new Date(sourceDate) < minDate) continue;
		indexes.push({
			index,
			timestamp: sourceDate ? new Date(sourceDate).getTime() : 0,
		});
	}
	indexes.sort((left, right) => right.timestamp - left.timestamp);
	if (!indexes.length) {
		return {
			rows: cached.rows,
			summary: {
				startDate,
				reused: cached.reused,
				attempted: 0,
				enriched: 0,
			},
		};
	}
	const nextRows = [...cached.rows];
	let cursor = 0;
	let enriched = 0;
	const concurrency = Math.min(MAP_PHONE_ENRICH_CONCURRENCY, indexes.length);
	const workers = Array.from({ length: concurrency }, async () => {
		while (cursor < indexes.length) {
			const current = cursor;
			cursor += 1;
			const { index } = indexes[current];
			const phones = await fetchPhonesForMapRow(session, nextRows[index]);
			if (!phones.length) continue;
			nextRows[index] = withPhones(nextRows[index], phones);
			enriched += 1;
		}
	});
	await Promise.all(workers);
	return {
		rows: nextRows,
		summary: {
			startDate,
			reused: cached.reused,
			attempted: indexes.length,
			enriched,
			concurrency,
		},
	};
}

async function findOpenOrderByClientCode(clientCode) {
	const codigo = cleanText(clientCode).replace(/\D/g, "");
	if (!codigo) return null;

	const session = await getSession();
	const createPayload = await fetchCreateMetadata(session);
	const types = findTypes(createPayload, MAPA_TYPE_IDS);
	const period = currentMapPeriod();
	const basePayload = baseReportPayload({ period, types });
	const pageSize = Math.min(PAGE_SIZE, 100);
	const searchPayload = {
		...basePayload,
		codigo_cliente: codigo,
		cliente: codigo,
		termo_busca: codigo,
		busca: "codigo_cliente",
		pagina: 1,
		itens_por_pagina: pageSize,
	};
	const json = await hubsoftRequest(
		session,
		`/api/v1/ordem_servico/consultar/paginado/${pageSize}?page=1`,
		{
			method: "POST",
			body: searchPayload,
		},
	);
	const rows = rowsOf(json);
	assertEnvelope(json, rows);
	const matched =
		rows.find(
			(row) => cleanText(extractClientCode(row)).replace(/\D/g, "") === codigo,
		) ||
		rows.find(
			(row) => cleanText(extractClientId(row)).replace(/\D/g, "") === codigo,
		);
	if (!matched) return null;
	return {
		...adaptReportRow(matched),
		fonte: "HubSoft",
	};
}

async function listActiveWithdrawalTechnicians() {
	const result = await db.query(
		`select id, hubsoft_technician_id, nome_hubsoft, nome_exibicao, ativo
       from hubsoft_withdrawal_technicians
      where ativo = true`,
	);
	return result.rows;
}

async function upsertWithdrawalTechnician(technician = {}, user = {}) {
	const result = await db.query(
		`insert into hubsoft_withdrawal_technicians
        (hubsoft_technician_id, nome_hubsoft, nome_exibicao, ativo, observacao,
         created_by, updated_by, source_payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (hubsoft_technician_id) do update set
         nome_hubsoft = excluded.nome_hubsoft,
         nome_exibicao = coalesce(nullif(hubsoft_withdrawal_technicians.nome_exibicao, ''), excluded.nome_exibicao),
         ativo = excluded.ativo,
         observacao = coalesce(excluded.observacao, hubsoft_withdrawal_technicians.observacao),
         updated_by = excluded.updated_by,
         source_payload = excluded.source_payload
       returning *`,
		[
			Number(technician.hubsoft_technician_id || technician.id),
			cleanText(technician.nome_hubsoft || technician.name),
			cleanText(
				technician.nome_exibicao || technician.nome_hubsoft || technician.name,
			),
			technician.ativo !== false,
			technician.observacao || null,
			user.uid || user.email || null,
			user.uid || user.email || null,
			JSON.stringify(technician.source_payload || technician),
		],
	);
	return result.rows[0];
}

async function discoverWithdrawalTechnicians(user = {}) {
	const session = await getSession();
	const createPayload = await fetchCreateMetadata(session);
	const candidates = (createPayload?.tecnicos || []).filter((technician) =>
		/TECNICO RETIRADA|TÉCNICO RETIRADA/i.test(
			normalizeText(technician.name || technician.nome),
		),
	);
	const saved = [];
	for (const technician of candidates) {
		saved.push(
			await upsertWithdrawalTechnician(
				{
					id: technician.id,
					name: technician.name || technician.nome,
					source_payload: {
						id: technician.id,
						name: technician.name || technician.nome,
					},
				},
				user,
			),
		);
	}
	return { candidates: candidates.length, saved };
}

async function listWithdrawalTechnicians() {
	const result = await db.query(
		`select *
       from hubsoft_withdrawal_technicians
      order by ativo desc, nome_exibicao nulls last, nome_hubsoft`,
	);
	return result.rows;
}

async function refreshHubsoftTechnicians(user = {}) {
	const session = await getSession();
	const createPayload = await fetchCreateMetadata(session);
	const unique = new Map();
	for (const technician of createPayload?.tecnicos || []) {
		const id = Number(technician.id ?? technician.id_usuario);
		const name = cleanText(
			technician.name || technician.nome || technician.display,
		);
		if (!Number.isFinite(id) || !id || !name) continue;
		unique.set(id, {
			id,
			name,
			displayName: name,
			isWithdrawal: /TECNICO RETIRADA|TÉCNICO RETIRADA/i.test(
				normalizeText(name),
			),
			sourcePayload: {
				id,
				name,
			},
		});
	}
	const items = [...unique.values()];
	const actor = cleanText(user.uid || user.email || user.nome) || null;
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query(
			`update hubsoft_technicians
			    set active = false, updated_by = $1
			  where active = true`,
			[actor],
		);
		if (items.length) {
			await client.query(
				`insert into hubsoft_technicians
				  (hubsoft_technician_id, name, display_name, active, is_withdrawal,
				   last_seen_at, source_payload, updated_by)
				 select item.id, item.name, item.display_name, true, item.is_withdrawal,
				        now(), item.source_payload, $2
				   from jsonb_to_recordset($1::jsonb) as item(
				        id bigint,
				        name text,
				        display_name text,
				        is_withdrawal boolean,
				        source_payload jsonb
				   )
				 on conflict (hubsoft_technician_id) do update set
				   name = excluded.name,
				   display_name = excluded.display_name,
				   active = true,
				   is_withdrawal = excluded.is_withdrawal,
				   last_seen_at = now(),
				   source_payload = excluded.source_payload,
				   updated_by = excluded.updated_by`,
				[
					JSON.stringify(
						items.map((item) => ({
							id: item.id,
							name: item.name,
							display_name: item.displayName,
							is_withdrawal: item.isWithdrawal,
							source_payload: item.sourcePayload,
						})),
					),
					actor,
				],
			);
		}
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
	return {
		total: items.length,
		withdrawal: items.filter((item) => item.isWithdrawal).length,
		updatedAt: new Date().toISOString(),
	};
}

async function listHubsoftTechnicians(options = {}) {
	const limit = Math.min(Math.max(Number(options.limit || 1000), 1), 2000);
	const search = cleanText(options.q);
	const params = [];
	let where = "where active = true";
	if (search) {
		params.push(`%${search}%`);
		where += ` and (name ilike $${params.length} or display_name ilike $${params.length})`;
	}
	params.push(limit);
	const result = await db.query(
		`select hubsoft_technician_id, name, display_name, active,
		        is_withdrawal, last_seen_at
		   from hubsoft_technicians
		   ${where}
		  order by is_withdrawal desc, display_name, name
		  limit $${params.length}`,
		params,
	);
	return result.rows;
}

async function buildClassificationMaps() {
	const [technicians, regionais, agentesDocs] = await Promise.all([
		listActiveWithdrawalTechnicians(),
		regionaisRepository.listAllRegionalDocuments(),
		documents.listAllDocuments("agentes").catch(() => []),
	]);
	const techById = new Map(
		technicians.map((item) => [Number(item.hubsoft_technician_id), item]),
	);
	const techByName = new Map(
		technicians
			.map((item) => [
				normalizeText(item.nome_hubsoft || item.nome_exibicao),
				item,
			])
			.filter(([key]) => key),
	);
	const regionalsByCity = new Map();
	const duplicateRegionalCities = new Map();
	for (const row of regionais) {
		const regionalName = row.data?.nome || row.nome || row.id;
		for (const city of row.data?.cidades || []) {
			const key = normalizeCityKey(city?.nome || city);
			if (!key) continue;
			const entry = {
				cidade: city?.nome || city,
				tipo: city?.tipo || "",
				regional: regionalName,
				regionalId: row.id,
			};
			if (regionalsByCity.has(key)) {
				duplicateRegionalCities.set(key, [
					...(duplicateRegionalCities.get(key) || [regionalsByCity.get(key)]),
					entry,
				]);
			} else {
				regionalsByCity.set(key, entry);
			}
		}
	}
	const agentsByCity = new Map();
	for (const row of agentesDocs) {
		const data = row.data || {};
		const key = normalizeCityKey(data.cidade);
		if (!key) continue;
		agentsByCity.set(key, {
			cidade: data.cidade,
			regional: data.regional_nome,
			regionalId: data.regional_id,
			ownerName: data.responsavel?.nome || data.cidade,
			ownerId: row.id,
		});
	}
	return { techById, techByName, regionalsByCity, duplicateRegionalCities, agentsByCity };
}

function classifyOrder(row, maps) {
	const technicians = extractTechnicians(row);
	for (const technician of technicians) {
		const registered =
			maps.techById.get(Number(technician.id)) ||
			maps.techByName?.get(normalizeText(technician.name));
		if (registered) {
			return {
				production_channel: "RETIRADA",
				production_owner_id: String(registered.hubsoft_technician_id),
				production_owner_name:
					registered.nome_exibicao || registered.nome_hubsoft || technician.name,
				classification_rule: "WITHDRAWAL_TECHNICIAN_ID",
				classification_reason: "TECHNICIAN_MATCH",
			};
		}
	}
	const withdrawalTechnician = technicians.find((technician) =>
		normalizeText(technician.name).includes("RETIRADA"),
	);
	if (withdrawalTechnician) {
		return {
			production_channel: "RETIRADA",
			production_owner_id: withdrawalTechnician.id
				? String(withdrawalTechnician.id)
				: normalizeText(withdrawalTechnician.name),
			production_owner_name: withdrawalTechnician.name || "Técnico de retirada",
			classification_rule: "HUBSOFT_WITHDRAWAL_TECHNICIAN_NAME",
			classification_reason: "WITHDRAWAL_TECHNICIAN_NAME",
		};
	}

	const city = extractCity(row);
	const cityKey = normalizeCityKey(city);
	if (!cityKey) {
		return {
			production_channel: "UNCLASSIFIED",
			classification_rule: "UNCLASSIFIED",
			classification_reason: "MISSING_CITY",
		};
	}
	const agent = maps.agentsByCity.get(cityKey);
	if (agent) {
		return {
			production_channel: "AA",
			production_owner_id: agent.ownerId || cityKey,
			production_owner_name: agent.cidade || city,
			classification_rule: "AUTHORIZED_AGENT_CITY",
			classification_reason: "AUTHORIZED_AGENT_CITY",
		};
	}
	if (maps.duplicateRegionalCities.has(cityKey)) {
		return {
			production_channel: "UNCLASSIFIED",
			classification_rule: "UNCLASSIFIED",
			classification_reason: "REGIONAL_AMBIGUOUS",
		};
	}
	const regional = maps.regionalsByCity.get(cityKey);
	if (regional) {
		return {
			production_channel: "REGIONAL",
			production_owner_id: regional.regionalId || regional.regional,
			production_owner_name: regional.regional,
			classification_rule: "REGIONAL_CITY",
			classification_reason: "REGIONAL_CITY",
		};
	}
	return {
		production_channel: "UNCLASSIFIED",
		classification_rule: "UNCLASSIFIED",
		classification_reason: "CITY_NOT_FOUND",
	};
}

function classifyStoreAttendance(row, maps) {
	const city = extractCity(row);
	const cityKey = normalizeCityKey(city);
	const agent = cityKey ? maps.agentsByCity.get(cityKey) : null;
	if (agent) {
		return {
			production_channel: "AA",
			production_owner_id: agent.ownerId || cityKey,
			production_owner_name: agent.cidade || city,
			classification_rule: "AUTHORIZED_AGENT_CITY",
			classification_reason: "AUTHORIZED_AGENT_CITY",
		};
	}
	return {
		production_channel: "LOJA",
		production_owner_id: null,
		production_owner_name: null,
		classification_rule: "STORE_DELIVERY",
		classification_reason: cityKey ? "NON_AGENT_CITY" : "MISSING_CITY",
	};
}

function recordFor(profile, row, maps) {
	const isMeta = isMetaProfile(profile);
	let classification = {
		production_channel: null,
		production_owner_id: null,
		production_owner_name: null,
		classification_rule: null,
		classification_reason: null,
	};
	if (isMeta) {
		classification = classifyOrder(row, maps);
	} else if (isStoreProfile(profile)) {
		classification = classifyStoreAttendance(row, maps);
	}
	const hubsoftNumber = cleanText(
		row.numero_ordem_servico || row.protocolo || row.id_atendimento,
	);
	const sourceDate =
		(isFinesProfile(profile)
			? extractFineRegistrationDate(row)
			: extractSourceDate(row)) || extractDateFromHubsoftProtocol(hubsoftNumber);
	const serviceName = extractServiceName(row);
	const equipment = classifyEquipmentByServiceSpeed(
		[
			serviceName,
			row.numero_plano,
			row?.cliente_servico?.numero_plano,
			row?.cliente_servico?.display,
			row?.cliente_servico?.servico?.descricao,
		]
			.filter(Boolean)
			.join(" "),
	);
	return {
		profile,
		entity_type: isStoreProfile(profile) || isFinesProfile(profile) ? "attendance" : "order",
		hubsoft_id: String(uniqueKeyFor(profile, row)),
		hubsoft_number: hubsoftNumber,
		source_status: cleanText(extractStatus(row)),
		source_type: cleanText(extractOrderType(row) || row.tipo_atendimento?.descricao),
		source_city: cleanText(extractCity(row) || row.cidade),
		source_city_id: cleanText(extractCityId(row)),
		source_date: safeTimestamp(sourceDate),
		raw_excerpt: {
			tecnicos: extractTechnicians(row),
			id_tipo_ordem_servico: extractOrderTypeId(row),
			motivo_fechamento: extractMotivo(row),
			servico: serviceName,
			numero_plano: cleanText(
				row.numero_plano || row?.cliente_servico?.numero_plano || "",
			),
			id_cliente: extractClientId(row),
			codigo_cliente: extractClientCode(row),
			id_cliente_servico: cleanText(
				row.id_cliente_servico ||
					row?.cliente_servico?.id_cliente_servico ||
					"",
			),
			equipment_type: equipment.equipmentType,
			equipment_speed_mbps: equipment.speedMbps,
			equipment_classification_reason: equipment.reason,
			cliente_nome: extractClientName(row),
			usuario_abertura: cleanText(
				row.usuario_abertura?.name ||
					row.usuario_abertura?.nome ||
					row.usuario_abertura ||
					"",
			),
			usuario_fechamento: cleanText(
				row.usuario_fechamento?.name ||
					row.usuario_fechamento?.nome ||
					row.usuario_fechamento ||
					"",
			),
			usuarios_responsaveis: cleanText(row.usuarios_responsaveis || ""),
		},
		...classification,
		classified_at: isMeta ? new Date().toISOString() : null,
	};
}

async function createRun(profile, user = {}) {
	const result = await db.query(
		`insert into hubsoft_sync_runs
        (profile, status, created_by, created_by_name)
       values ($1, 'RUNNING', $2, $3)
       returning *`,
		[profile, user.uid || user.email || null, user.nome || user.name || ""],
	);
	return result.rows[0];
}

async function updateRun(id, patch = {}) {
	const current = await db.query(`select * from hubsoft_sync_runs where id = $1`, [
		id,
	]);
	const row = current.rows[0] || {};
	const next = { ...row, ...patch };
	await db.query(
		`update hubsoft_sync_runs set
         status = $2,
         finished_at = $3,
         duration_ms = $4,
         expected_total = $5,
         expected_pages = $6,
         received_pages = $7,
         received_rows = $8,
         unique_rows = $9,
         duplicate_rows = $10,
         inserted = $11,
         updated = $12,
         deactivated = $13,
         ignored = $14,
         unclassified = $15,
         error_code = $16,
         error_message = $17,
         request_summary = $18::jsonb,
         result_summary = $19::jsonb
       where id = $1
       returning *`,
		[
			id,
			next.status,
			next.finished_at || null,
			next.duration_ms || null,
			next.expected_total ?? null,
			next.expected_pages ?? null,
			next.received_pages ?? null,
			next.received_rows ?? null,
			next.unique_rows ?? null,
			next.duplicate_rows ?? null,
			next.inserted || 0,
			next.updated || 0,
			next.deactivated || 0,
			next.ignored || 0,
			next.unclassified || 0,
			next.error_code || null,
			next.error_message || null,
			JSON.stringify(next.request_summary || {}),
			JSON.stringify(next.result_summary || {}),
		],
	);
	return next;
}

async function updateRunProgress(runId, patch = {}) {
	const run = await getRun(runId);
	if (run?.profile) {
		await db.query(
			`update hubsoft_sync_locks
          set expires_at = $3
        where profile = $1 and sync_run_id = $2`,
			[
				run.profile,
				runId,
				new Date(Date.now() + LOCK_TTL_MS).toISOString(),
			],
		);
	}
	await updateRun(runId, {
		status: RUN_STATUS.RUNNING,
		result_summary: {
			...patch,
			stage: patch.stage || "Processando",
			percent: Number(patch.percent || 0),
			heartbeatAt: new Date().toISOString(),
		},
	});
	await db.query(
		`update hubsoft_sync_runs
		    set checkpoint_stage = $2,
		        checkpoint_page = coalesce($3, checkpoint_page),
		        checkpoint_batch = coalesce($4, checkpoint_batch),
		        checkpoint_at = now()
		  where id = $1`,
		[runId, patch.stage || "Processando", patch.checkpointPage ?? null, patch.checkpointBatch ?? null],
	);
}

async function releaseStaleLock(profile) {
	const result = await db.query(
		`select l.profile,
		        l.sync_run_id,
		        l.expires_at,
		        r.status,
		        r.started_at,
		        r.result_summary,
		        coalesce(
		          (r.result_summary->>'heartbeatAt')::timestamptz,
		          r.started_at
		        ) as heartbeat_at
		   from hubsoft_sync_locks l
		   left join hubsoft_sync_runs r on r.id = l.sync_run_id
		  where l.profile = $1
		    and (
		      l.expires_at < now()
		      or r.id is null
		      or (
		        r.status = $2
		        and coalesce((r.result_summary->>'heartbeatAt')::timestamptz, r.started_at)
		            < now() - interval '15 minutes'
		      )
		    )
		  limit 1`,
		[profile, RUN_STATUS.RUNNING],
	);
	const stale = result.rows[0];
	if (!stale) return false;
	await db.query(`delete from hubsoft_sync_locks where profile = $1`, [profile]);
	if (stale.sync_run_id && stale.status === RUN_STATUS.RUNNING) {
		await updateRun(stale.sync_run_id, {
			status: RUN_STATUS.FAILED,
			finished_at: new Date().toISOString(),
			error_code: "STALE_RUN",
			error_message:
				"Execução interrompida sem heartbeat recente. Uma nova execução pode retomar pelo checkpoint.",
			result_summary: {
				...(stale.result_summary || {}),
				stage: "Execução interrompida",
				heartbeatAt: new Date().toISOString(),
			},
		}).catch(() => null);
	}
	return true;
}

async function releaseOrphanedSchedulerLocks() {
	const result = await db.query(
		`select l.profile, l.sync_run_id, r.status, r.result_summary
		   from hubsoft_sync_locks l
		   left join hubsoft_sync_runs r on r.id = l.sync_run_id
		  where l.locked_by = $1
		    and (r.id is null or r.status = $2)`,
		[SCHEDULER_USER.uid, RUN_STATUS.RUNNING],
	);
	if (!result.rows.length) return 0;
	await db.query(
		`delete from hubsoft_sync_locks
		  where locked_by = $1
		    and profile = any($2::text[])`,
		[SCHEDULER_USER.uid, result.rows.map((row) => row.profile)],
	);
	for (const row of result.rows) {
		if (!row.sync_run_id || row.status !== RUN_STATUS.RUNNING) continue;
		await updateRun(row.sync_run_id, {
			status: RUN_STATUS.FAILED,
			finished_at: new Date().toISOString(),
			error_code: "STALE_RUN",
			error_message:
				"Execução interrompida por reinício da API. A rotina automática pode retomar em seguida.",
			result_summary: {
				...(row.result_summary || {}),
				stage: "Execução interrompida",
				heartbeatAt: new Date().toISOString(),
			},
		}).catch(() => null);
	}
	return result.rows.length;
}

async function getActiveLock(profile) {
	await releaseStaleLock(profile);
	const result = await db.query(
		`select *
		   from hubsoft_sync_locks
		  where profile = $1
		    and expires_at > now()
		  limit 1`,
		[profile],
	);
	return result.rows[0] || null;
}

async function acquireLock(profile, runId, user = {}) {
	await releaseStaleLock(profile);
	const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
	const result = await db.query(
		`insert into hubsoft_sync_locks (profile, sync_run_id, expires_at, locked_by)
       values ($1, $2, $3, $4)
       on conflict (profile) do update set
         sync_run_id = excluded.sync_run_id,
         locked_at = now(),
         expires_at = excluded.expires_at,
         locked_by = excluded.locked_by
       where hubsoft_sync_locks.expires_at < now()
       returning *`,
		[profile, runId, expiresAt, user.uid || user.email || null],
	);
	if (!result.rows.length) {
		const error = new Error(`Profile ${profile} ja esta em execucao.`);
		error.code = "ALREADY_RUNNING";
		throw error;
	}
}

async function releaseLock(profile, runId) {
	await db.query(
		`delete from hubsoft_sync_locks
      where profile = $1 and sync_run_id = $2`,
		[profile, runId],
	);
}

function runDateRangeOptions(profile, options = {}) {
	if (!isPeriodSnapshotProfile(profile)) return {};
	const startDate = cleanText(options.startDate || options.date);
	const endDate = cleanText(options.endDate || options.date || startDate);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
		return {};
	}
	return startDate > endDate
		? { startDate: endDate, endDate: startDate, preserveOutsidePeriod: true }
		: { startDate, endDate, preserveOutsidePeriod: true };
}

async function persistRecords(runId, profile, records, options = {}) {
	let inserted = 0;
	let updated = 0;
	const activeIds = records.map((record) => record.hubsoft_id);
	for (let offset = 0; offset < records.length; offset += PERSIST_BATCH_SIZE) {
		const batchNumber = Math.floor(offset / PERSIST_BATCH_SIZE) + 1;
		const batch = records.slice(offset, offset + PERSIST_BATCH_SIZE).map((record) => ({
			...record,
			source_date: record.source_date || safeTimestamp(extractDateFromHubsoftProtocol(record.hubsoft_number)),
			raw_excerpt: record.raw_excerpt || {},
		}));
		const result = await db.query(
			`insert into hubsoft_sync_records
          (sync_run_id, profile, entity_type, hubsoft_id, hubsoft_number,
           source_status, source_type, source_city, source_city_id, source_date,
           production_channel, production_owner_id, production_owner_name,
           classification_rule, classification_reason, classified_at,
           raw_excerpt, active)
		 select $1, item.profile, item.entity_type, item.hubsoft_id, item.hubsoft_number,
		        item.source_status, item.source_type, item.source_city, item.source_city_id,
		        item.source_date, item.production_channel, item.production_owner_id,
		        item.production_owner_name, item.classification_rule,
		        item.classification_reason, item.classified_at, item.raw_excerpt, true
		   from jsonb_to_recordset($2::jsonb) as item(
			profile text, entity_type text, hubsoft_id text, hubsoft_number text,
			source_status text, source_type text, source_city text, source_city_id text,
			source_date timestamptz, production_channel text, production_owner_id text,
			production_owner_name text, classification_rule text, classification_reason text,
			classified_at timestamptz, raw_excerpt jsonb)
         on conflict (profile, entity_type, hubsoft_id) do update set
           sync_run_id = excluded.sync_run_id,
           hubsoft_number = excluded.hubsoft_number,
           source_status = excluded.source_status,
           source_type = excluded.source_type,
           source_city = excluded.source_city,
           source_city_id = excluded.source_city_id,
           source_date = excluded.source_date,
           production_channel = excluded.production_channel,
           production_owner_id = excluded.production_owner_id,
           production_owner_name = excluded.production_owner_name,
           classification_rule = excluded.classification_rule,
           classification_reason = excluded.classification_reason,
           classified_at = excluded.classified_at,
           raw_excerpt = excluded.raw_excerpt,
		   active = true
		 where (hubsoft_sync_records.hubsoft_number, hubsoft_sync_records.source_status,
		        hubsoft_sync_records.source_type, hubsoft_sync_records.source_city,
		        hubsoft_sync_records.source_city_id, hubsoft_sync_records.source_date,
		        hubsoft_sync_records.production_channel, hubsoft_sync_records.production_owner_id,
		        hubsoft_sync_records.production_owner_name, hubsoft_sync_records.classification_rule,
		        hubsoft_sync_records.classification_reason, hubsoft_sync_records.classified_at,
		        hubsoft_sync_records.raw_excerpt, hubsoft_sync_records.active)
		       is distinct from
		       (excluded.hubsoft_number, excluded.source_status, excluded.source_type,
		        excluded.source_city, excluded.source_city_id, excluded.source_date,
		        excluded.production_channel, excluded.production_owner_id,
		        excluded.production_owner_name, excluded.classification_rule,
		        excluded.classification_reason, excluded.classified_at,
		        excluded.raw_excerpt, true)
         returning (xmax = 0) as inserted`,
			[runId, JSON.stringify(batch)],
		);
		inserted += result.rows.filter((row) => row.inserted).length;
		updated += result.rows.filter((row) => !row.inserted).length;
		await options.onProgress?.({
			stage: `Salvando lote ${batchNumber} de ${Math.ceil(records.length / PERSIST_BATCH_SIZE)}`,
			percent: Math.min(82, 72 + Math.round(((offset + batch.length) / Math.max(1, records.length)) * 10)),
			checkpointBatch: batchNumber,
		});
	}
	const periodOptions = options.preserveOutsidePeriod
		? runDateRangeOptions(profile, options)
		: {};
	const preserveAllFineRecords = isFinesProfile(profile);
	const deactivated = preserveAllFineRecords
		? { rowCount: 0 }
		: periodOptions.preserveOutsidePeriod
		? await db.query(
				`update hubsoft_sync_records
	          set active = false
	        where profile = $1
	          and sync_run_id <> $2
	          and active = true
	          and not (hubsoft_id = any($3::text[]))
	          and source_date >= ($4::date::timestamp at time zone '${TIME_ZONE}')
	          and source_date < (($5::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')`,
				[profile, runId, activeIds, periodOptions.startDate, periodOptions.endDate],
			)
		: await db.query(
				`update hubsoft_sync_records
	        set active = false
	      where profile = $1
	        and sync_run_id <> $2
	        and active = true
	        and not (hubsoft_id = any($3::text[]))`,
				[profile, runId, activeIds],
			);
	return { inserted, updated, deactivated: deactivated.rowCount || 0 };
}

function validateCollected(collected, uniqueRows) {
	if (collected.expectedTotal === 0 && collected.receivedRows === 0) {
		return RUN_STATUS.VALID_EMPTY_RESULT;
	}
	if (collected.expectedTotal !== collected.receivedRows) return RUN_STATUS.INCOMPLETE;
	if (uniqueRows !== collected.receivedRows) return RUN_STATUS.SUSPICIOUS;
	return RUN_STATUS.COMPLETE;
}

function shouldTolerateDuplicateRows(profile, collectedStats = {}) {
	if (![PROFILE.MAPA, PROFILE.MATCH, PROFILE.LOJA].includes(profile)) return false;
	const duplicates = Number(collectedStats.duplicateRows || 0);
	const receivedRows = Number(collectedStats.receivedRows || 0);
	if (duplicates <= 0 || receivedRows <= 0) return false;
	return duplicates <= Math.max(10, Math.ceil(receivedRows * 0.001));
}

function summarizeRecords(records) {
	const byChannel = {};
	const byReason = {};
	const byCity = {};
	const byType = {};
	for (const record of records) {
		const channel = record.production_channel || "N/A";
		byChannel[channel] = (byChannel[channel] || 0) + 1;
		const city = record.source_city || "Sem cidade";
		byCity[city] = (byCity[city] || 0) + 1;
		const type = record.source_type || "Sem tipo";
		byType[type] = (byType[type] || 0) + 1;
		if (record.classification_reason) {
			byReason[record.classification_reason] =
				(byReason[record.classification_reason] || 0) + 1;
		}
	}
	const rankingFrom = (source) =>
		Object.entries(source)
			.map(([label, total]) => ({ label, total }))
			.sort((left, right) => right.total - left.total)
			.slice(0, 10);
	return {
		byChannel,
		byReason,
		ranking: {
			cidades: rankingFrom(byCity),
			tipos: rankingFrom(byType),
			canais: rankingFrom(byChannel),
		},
	};
}

async function maybeApplyOperationalProfile(profile, rows, records, options, user) {
	const operationalProfile = operationalProfileFor(profile);
	if (![PROFILE.MAPA, PROFILE.MATCH, PROFILE.META_D0, PROFILE.META_D_MINUS_ONE, PROFILE.LOJA, PROFILE.MULTAS].includes(operationalProfile)) return null;
	if (options.applyOperational === false) return null;
	if (operationalProfile === PROFILE.MULTAS) {
		return operationalImports.persistHubsoftFineRecords({
			profile: operationalProfile,
			date: options.date || todaySaoPaulo(),
			startDate: options.startDate,
			endDate: options.endDate,
			records,
			user,
		});
	}
	if ([PROFILE.META_D0, PROFILE.META_D_MINUS_ONE, PROFILE.LOJA].includes(operationalProfile)) {
		if (!records.length) {
			return {
				skipped: true,
				reason: "EMPTY_RESULT_NOT_APPLIED",
				message: "Resultado vazio registrado sem alterar metas/painéis.",
			};
		}
		return operationalImports.persistHubsoftMetaRecords({
			profile: operationalProfile,
			date:
				options.date ||
				(operationalProfile === PROFILE.META_D_MINUS_ONE || operationalProfile === PROFILE.LOJA
					? addDays(todaySaoPaulo(), -1)
					: todaySaoPaulo()),
			records,
			user,
		});
	}
	if ([PROFILE.MAPA, PROFILE.MATCH].includes(operationalProfile) && !records.length) {
		return {
			skipped: true,
			reason: "EMPTY_RESULT_NOT_APPLIED",
			message: "Resultado vazio registrado sem alterar Mapa/Match.",
		};
	}
	const payload = {
		rows: rows.map(adaptReportRow),
		periodo: options.period || currentMapPeriod(options.date),
		fontes: options.fontes || ["sempre", "onnet"],
	};
	if (profile === PROFILE.MAPA) {
		return operationalImports.persistMapaImport(payload, user, {});
	}
	return operationalImports.persistMatchImport(payload, user, {});
}

function assertValidProfile(profile) {
	const blockedProfiles = [
		PROFILE.META_AUDIT,
		PROFILE.META_AUDIT_DAILY,
		PROFILE.META_AUDIT_STORE,
	];
	if (
		Object.values(PROFILE)
			.filter((item) => !blockedProfiles.includes(item))
			.includes(profile)
	) {
		return;
	}
	const error = new Error(`Profile HubSoft invalido: ${profile}`);
	error.statusCode = 400;
	throw error;
}

function assertValidInternalProfile(profile) {
	if ([PROFILE.META_AUDIT_DAILY, PROFILE.META_AUDIT_STORE].includes(profile)) return;
	assertValidProfile(profile);
}

async function executeProfileRunCore(run, profile, options = {}, user = {}) {
	const started = new Date(run.started_at || Date.now()).getTime() || Date.now();
	let lockAcquired = false;
	let previousMapSnapshot = null;
	try {
		await acquireLock(profile, run.id, user);
		lockAcquired = true;
		await updateRunProgress(run.id, {
			stage: "Iniciando execucao",
			percent: 3,
		});
		if (options.discoverTechnicians !== false) {
			await updateRunProgress(run.id, {
				stage: "Atualizando tecnicos de retirada",
				percent: 5,
			});
			await discoverWithdrawalTechnicians(user).catch(() => null);
		}
		const collected = await collectProfile(profile, {
			...options,
			onProgress: (progress) => updateRunProgress(run.id, progress),
		});
		await updateRunProgress(run.id, {
			stage: "Normalizando registros",
			percent: 55,
		});
		const keys = collected.rows.map((row) => uniqueKeyFor(profile, row)).filter(Boolean);
		const uniqueRows = new Set(keys).size;
		const duplicateRows = keys.length - uniqueRows;
		const collectedStats = {
			expectedTotal: collected.expectedTotal,
			expectedPages: collected.expectedPages,
			receivedPages: collected.receivedPages,
			receivedRows: collected.rows.length,
			uniqueRows,
			duplicateRows,
		};
		await updateRunProgress(run.id, {
			stage: "Classificando producao",
			percent: 62,
		});
		const maps = await buildClassificationMaps();
		const records = collected.rows
			.filter((row) => uniqueKeyFor(profile, row))
			.map((row) => recordFor(profile, row, maps));
		const recordsToPersist = isFinesProfile(profile) && options.skipFineFinanceEnrichment !== true
			? await enrichFineRecordsWithFinance(
					collected.hubsoftSession,
					records,
					(progress) => updateRunProgress(run.id, progress),
				)
			: records;
		let status = validateCollected(
			{ ...collectedStats, receivedRows: collected.rows.length },
			uniqueRows,
		);
		if (
			status === RUN_STATUS.SUSPICIOUS &&
			shouldTolerateDuplicateRows(profile, collectedStats)
		) {
			status = RUN_STATUS.COMPLETE;
		}
		let persistence = { inserted: 0, updated: 0, deactivated: 0 };
		let operational = null;
		if (status === RUN_STATUS.COMPLETE || (status === RUN_STATUS.VALID_EMPTY_RESULT && ![PROFILE.MAPA, PROFILE.MATCH].includes(profile))) {
			await updateRunProgress(run.id, {
				stage: "Salvando historico HubSoft",
				percent: 72,
			});
			if ([PROFILE.MAPA, PROFILE.MATCH].includes(profile) && status === RUN_STATUS.COMPLETE) {
				previousMapSnapshot = await mapSyncUpdates.captureActiveMapSnapshot(profile);
			}
			persistence = await persistRecords(run.id, profile, recordsToPersist, {
				...options,
				...runDateRangeOptions(profile, options),
				onProgress: (progress) => updateRunProgress(run.id, progress),
			});
			await updateRunProgress(run.id, {
				stage: "Aplicando nos paineis operacionais",
				percent: 84,
			});
			operational = await maybeApplyOperationalProfile(
				profile,
				collected.rows,
				recordsToPersist,
				options,
				user,
			);
		}
		const unclassified = records.filter(
			(record) => record.production_channel === "UNCLASSIFIED",
		).length;
		const finishedAt = new Date().toISOString();
		const resultSummary = {
			...summarizeRecords(records),
			operational,
			stage: "Concluido",
			percent: 100,
			heartbeatAt: finishedAt,
			date: options.date || null,
			period: options.period || null,
		};
		await updateRun(run.id, {
			status,
			finished_at: finishedAt,
			duration_ms: Date.now() - started,
			expected_total: collectedStats.expectedTotal,
			expected_pages: collectedStats.expectedPages,
			received_pages: collectedStats.receivedPages,
			received_rows: collectedStats.receivedRows,
			unique_rows: uniqueRows,
			duplicate_rows: duplicateRows,
			inserted: persistence.inserted,
			updated: persistence.updated,
			deactivated: persistence.deactivated,
			unclassified,
			request_summary: collected.requestSummary,
			result_summary: resultSummary,
		});
		if ([PROFILE.MAPA, PROFILE.MATCH].includes(profile) && status === RUN_STATUS.COMPLETE) {
			const mapUpdate = await mapSyncUpdates
				.processCompletedMapRun({
					runId: run.id,
					previousSnapshot: previousMapSnapshot,
					currentRecords: records,
					finishedAt,
				})
				.catch((error) => {
					console.error(
						"[hubsoftSyncProfiles] Falha ao registrar diff do MAPA:",
						error,
					);
					return null;
				});
			if (mapUpdate) {
				const updateLabel = profile === PROFILE.MATCH ? "Match" : "Mapa";
				await operationalImports.publishAcompanhamentoUpdate?.(profile.toLowerCase(), {
					generatedAt: finishedAt,
					updatedBy: user.uid || null,
					notify: mapUpdate.addedCount > 0 || mapUpdate.executedCount > 0,
					notifyAcompanhamento:
						mapUpdate.addedCount > 0 || mapUpdate.executedCount > 0,
					message: `${updateLabel} atualizado automaticamente: ${mapUpdate.addedCount} nova(s), ${mapUpdate.executedCount} executada(s) confirmada(s).`,
					summary: { mapUpdate },
				});
			}
		}
		return getRun(run.id);
	} catch (error) {
		const status = error.code === "FAILED_AUTH" ? RUN_STATUS.FAILED_AUTH : error.code === "SCHEMA_CHANGED" ? RUN_STATUS.SCHEMA_CHANGED : error.code === "SUSPICIOUS" ? RUN_STATUS.SUSPICIOUS : RUN_STATUS.FAILED;
		await updateRun(run.id, {
			status,
			finished_at: new Date().toISOString(),
			duration_ms: Date.now() - started,
			error_code: error.code || status,
			error_message: sanitizeErrorMessage(error),
		});
		throw error;
	} finally {
		if (lockAcquired) await releaseLock(profile, run.id).catch(() => {});
	}
}

async function executeProfileRun(run, profile, options = {}, user = {}) {
	return metrics.observeOperation(
		{
			kind: "job",
			name: "hubsoft_sync",
			stage: profile,
			summarize: (result) => ({
				processed: result?.received_rows || 0,
				updated: (result?.inserted || 0) + (result?.updated || 0),
				ignored: (result?.duplicate_rows || 0) + (result?.deactivated || 0),
			}),
		},
		() => executeProfileRunCore(run, profile, options, user),
	);
}

async function runProfile(profile, options = {}, user = {}) {
	assertValidProfile(profile);
	const activeLock = await getActiveLock(profile);
	if (activeLock?.sync_run_id) return getRun(activeLock.sync_run_id);
	const run = await createRun(profile, user);
	return executeProfileRun(run, profile, options, user);
}

async function runInternalProfile(profile, options = {}, user = {}) {
	assertValidInternalProfile(profile);
	const activeLock = await getActiveLock(profile);
	if (activeLock?.sync_run_id) return getRun(activeLock.sync_run_id);
	const run = await createRun(profile, user);
	return executeProfileRun(run, profile, options, user);
}

async function startProfileRun(profile, options = {}, user = {}) {
	assertValidProfile(profile);
	const activeLock = await getActiveLock(profile);
	if (activeLock?.sync_run_id) return getRun(activeLock.sync_run_id);
	const run = await createRun(profile, user);
	setImmediate(() => {
		executeProfileRun(run, profile, options, user).catch((error) => {
			console.error(
				`[hubsoftSyncProfiles] Falha na execucao async ${profile}:`,
				error?.message || error,
			);
		});
	});
	return getRun(run.id);
}

function normalizeAuditDates(dates = []) {
	return [
		...new Set(
			(Array.isArray(dates) ? dates : [])
				.map((item) => cleanText(item).slice(0, 10))
				.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
		),
	].sort();
}

function hasSameAuditRange(summary = {}, startDate, endDate) {
	const dates = Array.isArray(summary?.dates) ? summary.dates : [];
	if (dates[0] === startDate && dates[dates.length - 1] === endDate) {
		return true;
	}
	return summary?.startDate === startDate && summary?.endDate === endDate;
}

async function findReusableAuditRun(profile, startDate, endDate) {
	const result = await db.query(
		`select *
       from hubsoft_sync_runs
      where profile = $1
        and status in ($2, $3)
        and (
          result_summary->'dates' is not null
          or (request_summary->>'startDate' = $4 and request_summary->>'endDate' = $5)
        )
      order by started_at desc
      limit 10`,
		[profile, RUN_STATUS.COMPLETE, RUN_STATUS.VALID_EMPTY_RESULT, startDate, endDate],
	);
	return (
		result.rows.find((row) =>
			hasSameAuditRange(row.result_summary || {}, startDate, endDate) ||
			hasSameAuditRange(row.request_summary || {}, startDate, endDate),
		) || null
	);
}

async function findLatestMetaAuditCheckpoint(startDate, endDate) {
	const result = await db.query(
		`select result_summary
       from hubsoft_sync_runs
      where profile = $1
        and result_summary->'dates' is not null
      order by started_at desc
      limit 10`,
		[PROFILE.META_AUDIT],
	);
	for (const row of result.rows) {
		const summary = row.result_summary || {};
		if (!hasSameAuditRange(summary, startDate, endDate)) continue;
		const appliedDates = Array.isArray(summary.appliedDates)
			? summary.appliedDates
			: [];
		if (appliedDates.length) return new Set(appliedDates);
		const results = Array.isArray(summary.results) ? summary.results : [];
		if (results.length) {
			return new Set(results.map((item) => item?.date).filter(Boolean));
		}
	}
	return new Set();
}

async function executeMetaAuditRun(run, dates = [], user = {}, options = {}) {
	const started = new Date(run.started_at || Date.now()).getTime() || Date.now();
	const validDates = normalizeAuditDates(dates);
	const results = [];
	const appliedDates = new Set();
	let lockAcquired = false;
	try {
		await acquireLock(PROFILE.META_AUDIT, run.id, user);
		lockAcquired = true;
		if (!validDates.length) {
			const error = new Error("Informe ao menos uma data para auditar metas.");
			error.code = "EMPTY_AUDIT_DATES";
			throw error;
		}
		const startDate = validDates[0];
		const endDate = validDates[validDates.length - 1];
		await updateRun(run.id, {
			result_summary: {
				stage: "Preparando auditoria de metas",
				percent: 1,
				heartbeatAt: new Date().toISOString(),
				dates: validDates,
				appliedDates: [],
				results,
			},
		});
		const previousAppliedDates = options.force
			? new Set()
			: await findLatestMetaAuditCheckpoint(startDate, endDate);
		for (const date of previousAppliedDates) {
			appliedDates.add(date);
		}
		let metaRun = options.force
			? null
			: await findReusableAuditRun(PROFILE.META_AUDIT_DAILY, startDate, endDate);
		if (!metaRun) {
			await updateRunProgress(run.id, {
				stage: `Coletando metas HubSoft ${startDate} a ${endDate}`,
				percent: 2,
				current: 0,
				total: validDates.length,
				date: startDate,
				dates: validDates,
				appliedDates: [...previousAppliedDates],
				results,
			});
			metaRun = await runInternalProfile(
				PROFILE.META_AUDIT_DAILY,
				{
					startDate,
					endDate,
					discoverTechnicians: false,
					applyOperational: false,
				},
				user,
			);
		}
		let storeRun = options.force
			? null
			: await findReusableAuditRun(PROFILE.META_AUDIT_STORE, startDate, endDate);
		if (!storeRun) {
			await updateRunProgress(run.id, {
				stage: `Coletando entregas em loja ${startDate} a ${endDate}`,
				percent: 35,
				current: 0,
				total: validDates.length,
				date: startDate,
				dates: validDates,
				appliedDates: [...previousAppliedDates],
				results,
			});
			storeRun = await runInternalProfile(
				PROFILE.META_AUDIT_STORE,
				{
					startDate,
					endDate,
					discoverTechnicians: false,
					applyOperational: false,
				},
				user,
			);
		}
		const [metaRecords, storeRecords] = await Promise.all([
			listAllRecordsForRun(metaRun?.id),
			listAllRecordsForRun(storeRun?.id),
		]);
		const metaByDate = groupRecordsBySourceDate(metaRecords);
		const storeByDate = groupRecordsBySourceDate(storeRecords);
		for (let index = 0; index < validDates.length; index += 1) {
			const date = validDates[index];
			if (appliedDates.has(date)) {
				results.push({ date, skipped: true, reason: "checkpoint" });
				continue;
			}
			const metaDayRecords = metaByDate.get(date) || [];
			const storeDayRecords = storeByDate.get(date) || [];
			const metaOperational = await operationalImports.persistHubsoftMetaRecords({
				profile: PROFILE.META_D0,
				date,
				records: metaDayRecords,
				user,
				quiet: true,
			});
			const storeOperational = await operationalImports.persistHubsoftMetaRecords({
				profile: PROFILE.LOJA,
				date,
				records: storeDayRecords,
				user,
				quiet: true,
			});
			results.push({
				date,
				metaRunId: metaRun?.id,
				metaStatus: metaRun?.status,
				metaTotal: metaDayRecords.length,
				lojaRunId: storeRun?.id,
				lojaStatus: storeRun?.status,
				lojaTotal: storeDayRecords.length,
				metaOperational,
				lojaOperational: storeOperational,
			});
			appliedDates.add(date);
			await updateRunProgress(run.id, {
				stage: `Aplicado ${date}`,
				percent: Math.max(
					40,
					Math.round(40 + ((index + 1) / validDates.length) * 58),
				),
				current: index + 1,
				total: validDates.length,
				date,
				dates: validDates,
				appliedDates: [...appliedDates],
				results,
			});
		}
		const finishedAt = new Date().toISOString();
		await operationalImports.publishAcompanhamentoUpdate?.("metas", {
			generatedAt: finishedAt,
			updatedBy: user.uid || null,
			message: `Auditoria de metas HubSoft concluida de ${startDate} a ${endDate}.`,
			summary: {
				profile: PROFILE.META_AUDIT,
				startDate,
				endDate,
				totalDias: validDates.length,
				appliedDates: appliedDates.size,
			},
		});
		await operationalImports.refreshDashboardSnapshot?.(finishedAt);
		await updateRun(run.id, {
			status: RUN_STATUS.COMPLETE,
			finished_at: finishedAt,
			duration_ms: Date.now() - started,
			expected_total: validDates.length,
			received_rows: results.length,
			unique_rows: results.length,
			result_summary: {
				stage: "Auditoria de metas concluida",
				percent: 100,
				heartbeatAt: finishedAt,
				dates: validDates,
				appliedDates: [...appliedDates],
				results,
			},
		});
		return getRun(run.id);
	} catch (error) {
		await updateRun(run.id, {
			status: RUN_STATUS.FAILED,
			finished_at: new Date().toISOString(),
			duration_ms: Date.now() - started,
			error_code: error.code || RUN_STATUS.FAILED,
			error_message: sanitizeErrorMessage(error),
			result_summary: {
				stage: "Auditoria de metas falhou",
				percent: 0,
				heartbeatAt: new Date().toISOString(),
				dates: validDates,
				appliedDates: [...appliedDates],
				results,
			},
		});
		throw error;
	} finally {
		if (lockAcquired) await releaseLock(PROFILE.META_AUDIT, run.id).catch(() => {});
	}
}

async function startMetaAudit(dates = [], user = {}, options = {}) {
	const run = await createRun(PROFILE.META_AUDIT, user);
	setImmediate(() => {
		executeMetaAuditRun(run, dates, user, options).catch((error) => {
			console.error(
				"[hubsoftSyncProfiles] Falha na auditoria async de metas:",
				error?.message || error,
			);
		});
	});
	return getRun(run.id);
}

function localDateParts(date = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	})
		.formatToParts(date)
		.reduce((acc, item) => {
			acc[item.type] = item.value;
			return acc;
		}, {});
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		time: `${parts.hour}:${parts.minute}`,
	};
}

function minutesSince(value) {
	const time = value ? new Date(value).getTime() : 0;
	if (!Number.isFinite(time) || time <= 0) return Infinity;
	return (Date.now() - time) / 60_000;
}

function isTimeDue(nowTime, targetTime) {
	return nowTime >= normalizeTime(targetTime);
}

function lastRunFor(rawConfig, profile) {
	if (profile === PROFILE.MAPA) {
		return rawConfig.autoMapLastRunAt || rawConfig.autoMapMatchLastRunAt;
	}
	if (profile === PROFILE.MATCH) {
		return rawConfig.autoMatchLastRunAt || rawConfig.autoMapMatchLastRunAt;
	}
	return null;
}

async function runProfileSafely(profile, options = {}) {
	try {
		return await runProfile(
			profile,
			{ ...options, discoverTechnicians: false },
			SCHEDULER_USER,
		);
	} catch (error) {
		console.error(
			`[hubsoftSyncProfiles] Falha na rotina ${profile}:`,
			error?.message || error,
		);
		return null;
	}
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryMapMatchRun(run) {
	if (![PROFILE.MAPA, PROFILE.MATCH].includes(run?.profile)) return false;
	if (!run) return true;
	return [
		RUN_STATUS.FAILED,
		RUN_STATUS.INCOMPLETE,
		RUN_STATUS.SUSPICIOUS,
		RUN_STATUS.SCHEMA_CHANGED,
	].includes(run.status);
}

function mapMatchRetryDelay(attempt, random = Math.random) {
	return Math.min(
		5 * 60_000,
		MAP_MATCH_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1) + Math.floor(random() * 1000),
	);
}

async function runMapMatchProfileWithRetry(profile, options = {}) {
	let lastRun = null;
	for (let attempt = 0; attempt <= MAP_MATCH_RETRY_ATTEMPTS; attempt += 1) {
		if (attempt > 0) {
			const retryDelay = mapMatchRetryDelay(attempt);
			console.warn(
				`[hubsoftSyncProfiles] Retentando ${profile} (${attempt}/${MAP_MATCH_RETRY_ATTEMPTS}) em ${retryDelay}ms.`,
			);
			await wait(retryDelay);
		}
		lastRun = await runProfileSafely(profile, {
			...options,
			retryAttempt: attempt,
		});
		if (!shouldRetryMapMatchRun(lastRun)) return lastRun;
	}
	return lastRun;
}

async function runMapMatchScheduler(rawConfig, config) {
	if (!config.autoMapMatchEnabled) return [];
	if (mapMatchSchedulerRunning) {
		const elapsedMs = Date.now() - Number(mapMatchSchedulerStartedAt || 0);
		if (elapsedMs < MAP_MATCH_WATCHDOG_MS) {
			return [{ profile: "MAP_MATCH", skipped: "already_running" }];
		}
		console.warn(
			"[hubsoftSyncProfiles] Watchdog liberou rotina MAPA/MATCH presa em memoria.",
		);
		mapMatchSchedulerRunning = false;
		mapMatchSchedulerStartedAt = 0;
	}

	const mapDue =
		minutesSince(lastRunFor(rawConfig, PROFILE.MAPA)) >=
		config.autoMapMatchIntervalMinutes;
	const matchDue =
		minutesSince(lastRunFor(rawConfig, PROFILE.MATCH)) >=
		config.autoMapMatchIntervalMinutes;

	if (!mapDue && !matchDue) return [];

	mapMatchSchedulerRunning = true;
	mapMatchSchedulerStartedAt = Date.now();
	const results = [];
	(async () => {
		try {
			const mapResult = mapDue
				? await runMapMatchProfileWithRetry(PROFILE.MAPA)
				: null;
			if (mapDue) {
				results.push({ profile: PROFILE.MAPA, result: mapResult });
				if ([RUN_STATUS.COMPLETE, RUN_STATUS.VALID_EMPTY_RESULT].includes(mapResult?.status)) {
					await saveSchedulerState({
						autoMapLastRunAt: mapResult.started_at || new Date().toISOString(),
					});
				}
			}

			const matchResult = matchDue
				? await runMapMatchProfileWithRetry(PROFILE.MATCH)
				: null;
			if (matchDue) {
				results.push({ profile: PROFILE.MATCH, result: matchResult });
				if ([RUN_STATUS.COMPLETE, RUN_STATUS.VALID_EMPTY_RESULT].includes(matchResult?.status)) {
					await saveSchedulerState({
						autoMatchLastRunAt: matchResult.started_at || new Date().toISOString(),
					});
				}
			}

			if (
				(!mapDue || [RUN_STATUS.COMPLETE, RUN_STATUS.VALID_EMPTY_RESULT].includes(mapResult?.status)) &&
				(!matchDue || [RUN_STATUS.COMPLETE, RUN_STATUS.VALID_EMPTY_RESULT].includes(matchResult?.status))
			) {
				await saveSchedulerState({ autoMapMatchLastRunAt: new Date().toISOString() });
			}
		} catch (error) {
			console.error(
				"[hubsoftSyncProfiles] Falha na rotina MAPA/MATCH:",
				error?.message || error,
			);
		} finally {
			mapMatchSchedulerRunning = false;
			mapMatchSchedulerStartedAt = 0;
		}
	})();

	return [
		{
			profile: "MAP_MATCH",
			background: true,
			mapDue,
			matchDue,
		},
	];
}

async function runSchedulerTick() {
	if (schedulerTickRunning) return { ok: true, skipped: "already_running" };
	schedulerTickRunning = true;
	try {
	const rawConfig = await readConfig();
	const config = normalizeAutomationConfig(rawConfig);
	if (!config.autoSyncEnabled) return { ok: true, skipped: "disabled" };

	const now = localDateParts();
	const results = [];
	const succeeded = (run) => [RUN_STATUS.COMPLETE, RUN_STATUS.VALID_EMPTY_RESULT].includes(run?.status);
	const checkpointKey = `${now.date}-${String(now.hour).padStart(2, "0")}`;
	const checkpointDue = config.autoDailyCheckpointHours.includes(now.hour) && rawConfig.autoDailyLastCheckpointKey !== checkpointKey;

	if (
		config.autoDailyEnabled &&
		(minutesSince(rawConfig.autoDailyLastRunAt) >= config.autoDailyIntervalMinutes || checkpointDue)
	) {
		const dailyResult = await runProfileSafely(PROFILE.META_D0, { date: now.date });
		results.push({
			profile: PROFILE.META_D0,
			result: dailyResult,
		});
		const storeResult = await runProfileSafely(PROFILE.LOJA, { date: now.date });
		results.push({
			profile: PROFILE.LOJA,
			result: storeResult,
		});
		const patch = { autoDailyLastRunAt: new Date().toISOString() };
		if (config.autoDailyCheckpointHours.includes(now.hour)) {
			const checkpointKey = `${now.date}-${String(now.hour).padStart(2, "0")}`;
			if (rawConfig.autoDailyLastCheckpointKey !== checkpointKey) {
				patch.autoDailyLastCheckpointKey = checkpointKey;
				patch.autoDailyLastCheckpointAt = new Date().toISOString();
			}
		}
		if (succeeded(dailyResult) && succeeded(storeResult)) await saveSchedulerState(patch);
	}

	if (
		config.autoMetaEnabled &&
		isTimeDue(now.time, config.autoMetaTime) &&
		rawConfig.autoMetaLastRunDate !== now.date
	) {
		results.push({
			profile: PROFILE.META_D_MINUS_ONE,
			result: await runProfileSafely(PROFILE.META_D_MINUS_ONE, {
				date: addDays(now.date, -1),
			}),
		});
		if (succeeded(results[results.length - 1].result)) await saveSchedulerState({
			autoMetaLastRunDate: now.date,
			autoMetaLastRunAt: new Date().toISOString(),
		});
	}

	if (config.autoMetaEnabled && isTimeDue(now.time, config.autoMetaTime) && rawConfig.autoStoreLastRunDate !== now.date) {
		const result = await runProfileSafely(PROFILE.LOJA, { date: now.date });
		results.push({ profile: PROFILE.LOJA, result });
		if (succeeded(result)) await saveSchedulerState({ autoStoreLastRunDate: now.date, autoStoreLastRunAt: new Date().toISOString() });
	}

	if (
		config.autoSyncEnabled &&
		config.autoFinesEnabled &&
		minutesSince(rawConfig.autoFinesLastRunAt) >=
			config.autoFinesIntervalMinutes
	) {
		const result = await runProfileSafely(
			PROFILE.MULTAS,
			finesSchedulerOptions(now.date),
		);
		results.push({ profile: PROFILE.MULTAS, result });
		if (succeeded(result)) {
			await saveSchedulerState({
				autoFinesLastRunDate: now.date,
				autoFinesLastRunAt: new Date().toISOString(),
			});
		}
	}

	results.push(...(await runMapMatchScheduler(rawConfig, config)));

	return { ok: true, results };
	} finally {
		schedulerTickRunning = false;
	}
}

function startScheduler(app) {
	if (app?.locals?.hubsoftSyncProfilesTimer) return app.locals.hubsoftSyncProfilesTimer;
	setImmediate(() => {
		releaseOrphanedSchedulerLocks()
			.then((released) => {
				if (released > 0) {
					console.warn(
						`[hubsoftSyncProfiles] ${released} lock(s) orfao(s) do scheduler liberado(s) na inicializacao.`,
					);
				}
			})
			.catch((error) => {
				console.error(
					"[hubsoftSyncProfiles] Falha ao liberar locks orfaos na inicializacao:",
					error?.message || error,
				);
			});
	});
	const timer = setInterval(() => {
		runSchedulerTick().catch((error) => {
			console.error(
				"[hubsoftSyncProfiles] Falha no scheduler:",
				error?.message || error,
			);
		});
	}, Number(process.env.HUBSOFT_SYNC_SCHEDULER_INTERVAL_MS || SCHEDULER_CHECK_INTERVAL_MS));
	timer.unref?.();
	if (app?.locals) app.locals.hubsoftSyncProfilesTimer = timer;
	return timer;
}

async function getRun(id) {
	const result = await db.query(`select * from hubsoft_sync_runs where id = $1`, [
		id,
	]);
	return result.rows[0] || null;
}

async function listRuns({ limit = 20, profile, id } = {}) {
	const clauses = [];
	const params = [];
	if (id) {
		params.push(id);
		clauses.push(`id = $${params.length}`);
	}
	if (profile) {
		params.push(profile);
		clauses.push(`profile = $${params.length}`);
	}
	params.push(Math.min(Math.max(Number(limit || 20), 1), 100));
	const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
	const result = await db.query(
		`select *
       from hubsoft_sync_runs
       ${where}
      order by started_at desc
      limit $${params.length}`,
		params,
	);
	return result.rows;
}

async function listRecords({ runId, profile, channel, limit = 200 } = {}) {
	const clauses = [];
	const params = [];
	if (runId) {
		params.push(runId);
		clauses.push(`sync_run_id = $${params.length}`);
	}
	if (profile) {
		params.push(profile);
		clauses.push(`profile = $${params.length}`);
	}
	if (channel) {
		params.push(channel);
		clauses.push(`production_channel = $${params.length}`);
	}
	params.push(Math.min(Math.max(Number(limit || 200), 1), 1000));
	const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
	const result = await db.query(
		`select *
       from hubsoft_sync_records
       ${where}
      order by source_date nulls last, hubsoft_number
      limit $${params.length}`,
		params,
	);
	return result.rows;
}

async function listAllRecordsForRun(runId) {
	const result = await db.query(
		`select *
       from hubsoft_sync_records
      where sync_run_id = $1
      order by source_date nulls last, hubsoft_number`,
		[runId],
	);
	return result.rows;
}

function groupRecordsBySourceDate(records = []) {
	const grouped = new Map();
	for (const record of records) {
		const date = toSaoPauloDateOnly(record.source_date);
		if (!date) continue;
		if (!grouped.has(date)) grouped.set(date, []);
		grouped.get(date).push(record);
	}
	return grouped;
}

async function getProfilesOverview() {
	const visibleProfiles = VISIBLE_PROFILES;
	const runs = await db.query(
		`select distinct on (profile) *
       from hubsoft_sync_runs
      where profile = any($1::text[])
      order by profile, started_at desc`,
		[visibleProfiles],
	);
	const locks = await db.query(
		`select *
       from hubsoft_sync_locks
      where profile = any($1::text[])
        and expires_at > now()`,
		[visibleProfiles],
	);
	const lockByProfile = new Map(locks.rows.map((lock) => [lock.profile, lock]));
	const lastRunByProfile = new Map(
		runs.rows.map((run) => [run.profile, run]),
	);
	return visibleProfiles.map((profile) => {
		const lastRun = lastRunByProfile.get(profile) || null;
		const lock = lockByProfile.get(profile) || null;
		return {
			profile,
			status: lock ? RUN_STATUS.RUNNING : lastRun?.status || "NEVER_RUN",
			lastRun,
			locked: Boolean(lock),
			lock,
		};
	});
}

module.exports = {
	PROFILE,
	RUN_STATUS,
	automationRequest: hubsoftRequest,
	classifyOrder,
	createAutomationSession: getSession,
	discoverWithdrawalTechnicians,
	refreshHubsoftTechnicians,
	getProfilesOverview,
	getRun,
	findOpenOrderByClientCode,
	listRecords,
	listRuns,
	listWithdrawalTechnicians,
	listHubsoftTechnicians,
	requestHubsoft,
	runSchedulerTick,
	runProfile,
	startScheduler,
	startMetaAudit,
	startProfileRun,
	upsertWithdrawalTechnician,
	__testables: {
		classifyStoreAttendance,
		extractFineRegistrationDate,
		finesPayload,
		finesSchedulerOptions,
		mapMatchRetryDelay,
		normalizeAutomationConfig,
		shouldRetryMapMatchRun,
	},
};
