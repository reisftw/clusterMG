const DEFAULT_AUTOISP_URL = "https://autoisp.sempreinternet.com.br";
const DEFAULT_HUBSOFT_URL = "https://sempre.hubsoft.com.br";
const metrics = require("./metrics");
const DEFAULT_TIMEOUT_MS = 90_000;
const AUTOISP_LOOKUP_TIMEOUT_MS = Math.max(
	Number(process.env.AUTOISP_LOOKUP_TIMEOUT_MS || 18_000),
	5_000,
);
const AUTOISP_REQUEST_TIMEOUT_MS = Math.min(AUTOISP_LOOKUP_TIMEOUT_MS, 8_000);
const SESSION_TTL_MS = 20 * 60 * 1000;
const documents = require("./documents");

let browserPromise = null;
let autoIspStorageState = null;
let autoIspStorageExpiresAt = 0;
let hubsoftStorageState = null;
let hubsoftStorageExpiresAt = 0;
let hubsoftTokenCache = null;

function createSingleFlight() {
	const pendingByKey = new Map();
	return (key, loader) => {
		if (pendingByKey.has(key)) return pendingByKey.get(key);
		const pending = Promise.resolve().then(loader);
		pendingByKey.set(key, pending);
		return pending.finally(() => {
			if (pendingByKey.get(key) === pending) pendingByKey.delete(key);
		});
	};
}

const runHubsoftAuthSingleFlight = createSingleFlight();
const runSerialLookupSingleFlight = createSingleFlight();

function cleanText(value) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSerial(value) {
	return String(value || "")
		.replace(/[^a-zA-Z0-9]/g, "")
		.toLowerCase()
		.slice(0, 32);
}

function normalizeToken(value) {
	return cleanText(value).replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase();
}

function normalizeAutoIspError(error) {
	if (Number(error?.statusCode)) return error;
	const normalized = new Error(
		"O AutoISP nao respondeu dentro do prazo. Tente novamente em instantes.",
	);
	normalized.statusCode = 424;
	normalized.cause = error;
	return normalized;
}

function resolveCredential(...values) {
	return cleanText(values.find((value) => cleanText(value)) || "");
}

function resolveHubsoftUsername() {
	return resolveCredential(
		process.env.HUBSOFT_WEB_USERNAME,
		process.env.HUBSOFT_USERNAME,
	);
}

async function readHubsoftWebConfig() {
	const item = await documents.getDocument("hubsoft_config/global").catch(() => null);
	const data = item?.data || {};
	return {
		baseUrl: resolveCredential(data.webBaseUrl, data.baseUrl),
		username: resolveCredential(data.webUsername, data.username),
		password: resolveCredential(data.webPassword, data.password),
	};
}

async function requirePlaywright() {
	try {
		return require("playwright");
	} catch {
		const error = new Error("Playwright nao esta instalado no backend.");
		error.statusCode = 503;
		throw error;
	}
}

async function getBrowser() {
	if (!browserPromise) {
		browserPromise = requirePlaywright()
			.then(({ chromium }) => chromium.launch({ headless: true }))
			.catch((error) => {
				browserPromise = null;
				throw error;
			});
	}
	return browserPromise;
}

async function newCachedContext(storageState, expiresAt) {
	const browser = await getBrowser();
	const options =
		storageState && expiresAt > Date.now()
			? { storageState }
			: {};
	return browser.newContext(options);
}

async function fillHuman(locator, value) {
	const input = await firstVisible(locator);
	await input.waitFor({ state: "visible", timeout: 30_000 });
	await input.click({ timeout: 10_000 }).catch(() => {});
	await input.fill("");
	await input.type(value, { delay: 15 });
	await input.evaluate((element) => {
		element.dispatchEvent(new Event("input", { bubbles: true }));
		element.dispatchEvent(new Event("change", { bubbles: true }));
		element.dispatchEvent(new Event("blur", { bubbles: true }));
	});
}

async function fillHubsoftLogin(locator, value) {
	const input = await firstVisible(locator);
	await input.waitFor({ state: "visible", timeout: 30_000 });
	await input.evaluate((element) => {
		element.setAttribute("type", "text");
		if (element.form) element.form.setAttribute("novalidate", "novalidate");
	});
	await fillHuman(input, value);
}

async function firstVisible(locator) {
	const count = await locator.count().catch(() => 0);
	for (let index = 0; index < count; index += 1) {
		const item = locator.nth(index);
		if (await item.isVisible().catch(() => false)) return item;
	}
	return locator.first();
}

async function clickByText(page, label, fallbackLocator) {
	try {
		await page.getByText(label, { exact: false }).last().click({
			timeout: 10_000,
		});
	} catch {
		await fallbackLocator.first().press("Enter");
	}
}

async function loginAutoIsp(page, { username, password, baseUrl }) {
	await page.goto(`${baseUrl}/onus`, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await page.waitForTimeout(500);
	if (!/\/users\/sign_in/i.test(page.url())) return;

	const emailInput = page.locator(
		"#user_email, input[name='user[email]'], input[type='email'], input[name*='email' i], input[type='text']",
	);
	const passwordInput = page.locator(
		"#user_password, input[name='user[password]'], input[type='password'], input[name*='senha' i], input[name*='password' i]",
	);
	await fillHuman(emailInput, username);
	if (!(await passwordInput.first().isVisible().catch(() => false))) {
		await Promise.all([
			page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {}),
			clickByText(page, "VALIDAR", emailInput).catch(() => emailInput.first().press("Enter")),
		]);
		await page.waitForTimeout(1000);
	}
	await fillHuman(passwordInput, password);
	await Promise.all([
		page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {}),
		page.locator("input[type='submit'], button[type='submit']").last().click(),
	]);
	await page.waitForTimeout(500);
}

function extractAutoIspRows(rows, serial) {
	const serialUpper = serial.toUpperCase();
	const matches = rows
		.map((row) => cleanText(row))
		.filter((row) => row.toUpperCase().includes(serialUpper));
	return matches.map((row) => {
		const parts = row.split(" ").filter(Boolean);
		const serialIndex = parts.findIndex(
			(part) => part.toUpperCase() === serialUpper,
		);
		return {
			raw: row,
			status: parts[0] || "",
			serial: serialUpper,
			erpId: serialIndex >= 0 ? parts[serialIndex + 1] || "" : "",
			descricaoOlt: serialIndex >= 0 ? parts[serialIndex + 2] || "" : "",
			olt: serialIndex >= 0 ? parts[serialIndex + 3] || "" : "",
			pon: serialIndex >= 0 ? parts[serialIndex + 4] || "" : "",
			onuId: serialIndex >= 0 ? parts[serialIndex + 5] || "" : "",
			modelo: serialIndex >= 0 ? parts[serialIndex + 6] || "" : "",
		};
	});
}

function readAutoIspArrayValue(value, index = 0) {
	if (Array.isArray(value)) return cleanText(value[index]);
	return cleanText(value);
}

function normalizeAutoIspRecord(row = {}, serial) {
	const serialUpper = serial.toUpperCase();
	const primarySerial = readAutoIspArrayValue(row.serial_number, 0);
	const secondarySerial = readAutoIspArrayValue(row.serial_number, 1);
	if (
		primarySerial.toUpperCase() !== serialUpper &&
		secondarySerial.toUpperCase() !== serialUpper
	) {
		return null;
	}
	return {
		raw: JSON.stringify(row).slice(0, 2000),
		status: readAutoIspArrayValue(row.signal, 1) || readAutoIspArrayValue(row.signal, 0),
		serial: primarySerial || serialUpper,
		serialAlternativo: secondarySerial,
		erpId: readAutoIspArrayValue(row.circuit_id, 0),
		int6Id: readAutoIspArrayValue(row.int6_id, 0),
		descricaoOlt: normalizeToken(row.description),
		olt: readAutoIspArrayValue(row.olt, 0),
		pon: cleanText(row.ponlink),
		onuId: cleanText(row.onu_id),
		modelo: cleanText(row.onu_info_model || row.onu_type),
	};
}

function extractAutoIspPayloadRows(payload, serial) {
	const rows = Array.isArray(payload?.data) ? payload.data : [];
	return rows
		.map((row) => normalizeAutoIspRecord(row, serial))
		.filter(Boolean);
}

function extractAutoIspDirectResult(text, serial) {
	const normalizedText = cleanText(text);
	const row = extractAutoIspRows([normalizedText], serial)[0] || {};
	const loginRadiusMatch =
		normalizedText.match(/(?:descri[cç][aã]o\s*(?:na\s*)?olt|login\s*radius)\s*:?\s*([a-z0-9._-]{4,})/i) ||
		normalizedText.match(/\b([a-z][a-z0-9._-]{4,}\d{2,})\b/i);
	const descricaoOlt = normalizeToken(
		row.descricaoOlt || loginRadiusMatch?.[1] || "",
	);
	return {
		raw: normalizedText.slice(0, 2000),
		status: row.status || "",
		serial: serial.toUpperCase(),
		erpId: row.erpId || "",
		descricaoOlt,
		olt: row.olt || "",
		pon: row.pon || "",
		onuId: row.onuId || "",
		modelo: row.modelo || "",
	};
}

async function searchAutoIspClientSearch(page, serial, credentials) {
	const url = `${credentials.baseUrl}/client_search?conn_state=1&serial_number=${encodeURIComponent(serial.toUpperCase())}`;
	await page.goto(url, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
	await page.waitForTimeout(1500);
	const body = await page.locator("body").innerText().catch(() => "");
	if (!cleanText(body) || /nenhum|n[aã]o encontrado|sem resultado/i.test(body)) {
		const error = new Error("Serial nao encontrado no AutoISP pela busca direta.");
		error.statusCode = 404;
		throw error;
	}
	const result = extractAutoIspDirectResult(body, serial);
	if (!result.descricaoOlt && !body.toUpperCase().includes(serial.toUpperCase())) {
		const error = new Error("Serial nao encontrado no AutoISP pela busca direta.");
		error.statusCode = 404;
		throw error;
	}
	return result;
}

function buildAutoIspOnusUrl(baseUrl, serial) {
	const columns = [
		{ data: "signal", searchable: "false", orderable: "false", search: "" },
		{ data: "signal", searchable: "true", orderable: "false", search: "all" },
		{ data: "serial_number", searchable: "true", orderable: "true", search: serial },
		{ data: "circuit_id", searchable: "true", orderable: "true", search: "" },
		{ data: "int6_id", searchable: "true", orderable: "true", search: "" },
		{ data: "name", searchable: "true", orderable: "true", search: "" },
		{ data: "description", searchable: "true", orderable: "true", search: "" },
		{ data: "olt", searchable: "true", orderable: "true", search: "" },
		{ data: "ponlink", searchable: "true", orderable: "true", search: "" },
		{ data: "onu_id", searchable: "true", orderable: "true", search: "" },
		{ data: "onu_type", searchable: "true", orderable: "true", search: "" },
		{ data: "onu_info_model", searchable: "true", orderable: "true", search: "" },
		{ data: "topology", searchable: "true", orderable: "true", search: "" },
	];
	const params = new URLSearchParams({
		draw: "1",
		start: "0",
		length: "10",
		"search[value]": "",
		"search[regex]": "false",
		"order[0][column]": "3",
		"order[0][dir]": "asc",
		_: String(Date.now()),
	});
	columns.forEach((column, index) => {
		params.set(`columns[${index}][data]`, column.data);
		params.set(`columns[${index}][name]`, "");
		params.set(`columns[${index}][searchable]`, column.searchable);
		params.set(`columns[${index}][orderable]`, column.orderable);
		params.set(`columns[${index}][search][value]`, column.search);
		params.set(`columns[${index}][search][regex]`, "false");
	});
	return `${baseUrl}/provisioned_onus_datatable.json?${params.toString()}`;
}

async function searchAutoIspOnusJson(context, serial, credentials) {
	const response = await context.request.get(
		buildAutoIspOnusUrl(credentials.baseUrl, serial),
		{ timeout: AUTOISP_REQUEST_TIMEOUT_MS },
	);
	if (!response.ok()) {
		const error = new Error(`AutoISP HTTP ${response.status()} ao consultar ONUs.`);
		error.statusCode = response.status() >= 500 ? 502 : 400;
		throw error;
	}
	const payload = await response.json().catch(() => null);
	const matches = extractAutoIspPayloadRows(payload, serial);
	if (!matches.length) {
		const error = new Error("Serial nao encontrado no AutoISP.");
		error.statusCode = 404;
		throw error;
	}
	return matches[0];
}

async function searchAutoIspSerial(serial, credentials) {
	const hasCachedSession =
		Boolean(autoIspStorageState) && autoIspStorageExpiresAt > Date.now();
	const context = await newCachedContext(
		autoIspStorageState,
		autoIspStorageExpiresAt,
	);
	let timeoutId;
	try {
		const lookup = (async () => {
			if (hasCachedSession) {
				try {
					return await searchAutoIspOnusJson(context, serial, credentials);
				} catch {
					metrics.recordOperation({ kind: "integration", name: "autoisp", stage: "session_fallback", fallback: true });
					autoIspStorageState = null;
					autoIspStorageExpiresAt = 0;
				}
			}
			const page = await context.newPage();
			await loginAutoIsp(page, credentials);
			autoIspStorageState = await context.storageState();
			autoIspStorageExpiresAt = Date.now() + SESSION_TTL_MS;
			try {
				return await searchAutoIspOnusJson(context, serial, credentials);
			} catch {
				metrics.recordOperation({ kind: "integration", name: "autoisp", stage: "json_fallback", fallback: true });
				// Alguns seriais aparecem melhor na busca direta de assinantes.
			}
			try {
				const directResult = await searchAutoIspClientSearch(page, serial, credentials);
				if (directResult.descricaoOlt) return directResult;
			} catch {
				metrics.recordOperation({ kind: "integration", name: "autoisp", stage: "client_search_fallback", fallback: true });
				// Continua com a tela legado abaixo.
			}
			return await searchAutoIspSerialByUi(page, serial, credentials);
		})();
		const deadline = new Promise((_, reject) => {
			timeoutId = setTimeout(() => {
				context.close().catch(() => {});
				reject(normalizeAutoIspError(new Error("Timeout da consulta AutoISP.")));
			}, AUTOISP_LOOKUP_TIMEOUT_MS);
		});
		return await Promise.race([lookup, deadline]);
	} catch (error) {
		throw normalizeAutoIspError(error);
	} finally {
		clearTimeout(timeoutId);
		await context.close().catch(() => {});
	}
}

async function searchAutoIspSerialByUi(page, serial, credentials) {
	await loginAutoIsp(page, credentials);
	await page.goto(`${credentials.baseUrl}/onus`, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

	const serialInput = page.getByPlaceholder("Número de Série ONU");
	await serialInput.waitFor({ state: "visible", timeout: 6_000 });
	const responsePromise = page
		.waitForResponse(
			(response) =>
				/provisioned_onus_datatable\.json/i.test(response.url()) &&
				response.url().includes(encodeURIComponent(serial)),
			{ timeout: 6_000 },
		)
		.catch(() => null);
	await serialInput.fill(serial);
	await serialInput.evaluate((element) => {
		element.dispatchEvent(new Event("input", { bubbles: true }));
		element.dispatchEvent(new Event("change", { bubbles: true }));
	});
	await page.waitForTimeout(800);
	await serialInput.press("Enter").catch(() => {});
	const response = await responsePromise;
	if (response) {
		const payload = await response.json().catch(() => null);
		const matches = extractAutoIspPayloadRows(payload, serial);
		if (matches.length) return matches[0];
	}
	await page.waitForTimeout(1200);

	const rows = await page.evaluate(() =>
		// eslint-disable-next-line no-undef
		[...document.querySelectorAll("tr")]
			.map((row) => row.innerText)
			.filter(Boolean),
	);
	const matches = extractAutoIspRows(rows, serial);
	if (!matches.length) {
		const error = new Error("Serial nao encontrado no AutoISP.");
		error.statusCode = 404;
		throw error;
	}
	return matches[0];
}

async function loginHubsoft(page, { username, password, baseUrl }) {
	await page.goto(`${baseUrl}/cliente`, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
	if (!/\/login/i.test(page.url()) && !(await page.locator("input[type='password']").count())) return;

	const emailInput = page.locator("input[type='email'], input[name='email'], input[type='text']");
	await fillHubsoftLogin(emailInput, username);
	await Promise.all([
		page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {}),
		clickByText(page, "VALIDAR", emailInput),
	]);
	await page.waitForTimeout(1000);

	const passwordInput = page.locator(
		"input[type='password'], input[name*='senha' i], input[name*='password' i]",
	);
	await fillHuman(passwordInput, password);
	await Promise.all([
		page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {}),
		page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {}),
		clickByText(page, "ENTRAR", passwordInput),
	]);
	await page.waitForTimeout(2500);

	const body = cleanText(await page.locator("body").innerText().catch(() => ""));
	if (/usuario ou senha invalido/i.test(body)) {
		const error = new Error("HubSoft recusou usuario ou senha.");
		error.statusCode = 401;
		throw error;
	}
}

async function chooseHubsoftSearchType(page) {
	const selected = await page.evaluate(() => {
		const wanted = "login radius";
		// eslint-disable-next-line no-undef
		const selects = [...document.querySelectorAll("select")];
		for (const select of selects) {
			const options = [...select.options];
			const option = options.find((item) =>
				String(item.textContent || "").trim().toLowerCase().includes(wanted),
			);
			if (!option) continue;
			select.value = option.value;
			select.dispatchEvent(new Event("input", { bubbles: true }));
			select.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		}
		return false;
	});
	if (selected) return true;

	const textOption = page.getByText(/login\s*radius/i).first();
	if ((await textOption.count().catch(() => 0)) > 0) {
		await textOption.click({ timeout: 5000 }).catch(() => {});
		return true;
	}
	return false;
}

function extractHubsoftClient(text, loginRadius) {
	const normalized = cleanText(text);
	const clientMatch = normalized.match(/\((\d{3,})\)\s*([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9\s.'-]{3,})/i);
	return {
		raw: normalized.slice(0, 2000),
		loginRadius,
		clientCode: clientMatch?.[1] || "",
		clientName: cleanText(clientMatch?.[2] || ""),
		found: Boolean(clientMatch),
	};
}

function firstTextFromObject(source, keys = []) {
	for (const key of keys) {
		const value = source?.[key];
		if (value !== undefined && value !== null && cleanText(value)) return cleanText(value);
	}
	return "";
}

function normalizeHubsoftClientObject(row, loginRadius) {
	const cliente = row?.cliente || row?.cliente_servico?.cliente || row;
	const clientCode = firstTextFromObject(cliente, [
		"codigo_cliente",
		"id_cliente",
		"id",
		"codigo",
	]);
	const clientName = firstTextFromObject(cliente, [
		"nome_razaosocial",
		"nome_cliente",
		"razao_social",
		"cliente",
		"nome",
		"display",
	]);
	if (!clientCode && !clientName) return null;
	return {
		raw: JSON.stringify(row).slice(0, 2000),
		loginRadius,
		clientCode,
		clientName,
		found: true,
		source: "hubsoft_web_api",
	};
}

function hubsoftApiBaseFromWebBase(webBaseUrl) {
	try {
		const url = new URL(webBaseUrl || DEFAULT_HUBSOFT_URL);
		if (!url.hostname.startsWith("api.")) url.hostname = `api.${url.hostname}`;
		return `${url.protocol}//${url.hostname}`.replace(/\/+$/, "");
	} catch {
		return "https://api.sempre.hubsoft.com.br";
	}
}

function extractHubsoftAccessRows(payload) {
	return payload?.acessos_cliente?.data || payload?.data || payload?.dados || [];
}

async function readHubsoftAuthToken(page) {
	return page.evaluate(() => {
		try {
			const auth = JSON.parse(localStorage.getItem("auth") || "{}");
			return {
				tokenType: auth.token_type || "Bearer",
				accessToken: auth.access_token || "",
				expiresAt: auth.expires_at || auth.expiresAt || "",
			};
		} catch {
			return { tokenType: "Bearer", accessToken: "", expiresAt: "" };
		}
	});
}

async function requestHubsoftClientByWebApi(loginRadius, credentials, auth) {
	if (!auth.accessToken) {
		const error = new Error("Token web do HubSoft nao encontrado apos login.");
		error.statusCode = 401;
		throw error;
	}
	const apiBaseUrl = hubsoftApiBaseFromWebBase(credentials.baseUrl);
	const url = new URL(`${apiBaseUrl}/api/v1/cliente/acesso/paginado/10`);
	url.searchParams.set("page", "1");
	url.searchParams.set("busca", "login_radius");
	url.searchParams.set("termo_busca", loginRadius);
	const payload = await fetch(url, {
		headers: {
			Accept: "application/json",
			Authorization: `${auth.tokenType || "Bearer"} ${auth.accessToken}`,
		},
		signal: AbortSignal.timeout(30_000),
	}).then(async (response) => {
		const text = await response.text();
		const data = text ? JSON.parse(text) : null;
		if (!response.ok) {
			const error = new Error(
				`HubSoft web API HTTP ${response.status}: ${data?.msg || data?.message || text}`,
			);
			error.statusCode = response.status >= 500 ? 502 : 400;
			throw error;
		}
		return data;
	});
	const rows = extractHubsoftAccessRows(payload);
	const match =
		rows.find((row) =>
			JSON.stringify(row).toLowerCase().includes(loginRadius.toLowerCase()),
		) || rows[0];
	const client = normalizeHubsoftClientObject(match, loginRadius);
	if (!client?.found) {
		const error = new Error("Cliente nao encontrado no HubSoft pelo Login radius.");
		error.statusCode = 404;
		error.details = JSON.stringify(payload).slice(0, 1000);
		throw error;
	}
	return client;
}

async function getHubsoftWebAuth(credentials) {
	const cacheKey = `${credentials.baseUrl}|${credentials.username}`;
	if (
		hubsoftTokenCache?.cacheKey === cacheKey &&
		hubsoftTokenCache.expiresAt > Date.now()
	) {
		return hubsoftTokenCache.auth;
	}

	return runHubsoftAuthSingleFlight(cacheKey, async () => {
		if (
			hubsoftTokenCache?.cacheKey === cacheKey &&
			hubsoftTokenCache.expiresAt > Date.now()
		) {
			return hubsoftTokenCache.auth;
		}

		const context = await newCachedContext(
			hubsoftStorageState,
			hubsoftStorageExpiresAt,
		);
		const page = await context.newPage();
		try {
			await loginHubsoft(page, credentials);
			const auth = await readHubsoftAuthToken(page);
			if (!auth.accessToken) {
				const error = new Error("Token web do HubSoft nao encontrado apos login.");
				error.statusCode = 401;
				throw error;
			}
			const expiresAt = new Date(auth.expiresAt).getTime();
			const fallbackExpiresAt = Date.now() + SESSION_TTL_MS;
			hubsoftTokenCache = {
				cacheKey,
				auth,
				expiresAt: Number.isFinite(expiresAt)
					? Math.min(expiresAt - 60_000, fallbackExpiresAt)
					: fallbackExpiresAt,
			};
			hubsoftStorageState = await context.storageState();
			hubsoftStorageExpiresAt = Date.now() + SESSION_TTL_MS;
			return auth;
		} finally {
			await context.close().catch(() => {});
		}
	});
}

async function searchHubsoftClientByRadius(loginRadius, credentials) {
	const auth = await getHubsoftWebAuth(credentials);
	try {
		return await requestHubsoftClientByWebApi(loginRadius, credentials, auth);
	} catch {
		metrics.recordOperation({ kind: "integration", name: "hubsoft", stage: "web_api_fallback", fallback: true });
		hubsoftTokenCache = null;
		// Se a API web do painel mudar, ainda tentamos a tela como fallback.
	}
	const context = await newCachedContext(
		hubsoftStorageState,
		hubsoftStorageExpiresAt,
	);
	const page = await context.newPage();
	try {
		await loginHubsoft(page, credentials);
	await page.goto(`${credentials.baseUrl}/cliente`, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
	await chooseHubsoftSearchType(page);

	const inputs = page.locator("input:not([type='hidden']):not([type='checkbox']), textarea");
	const count = await inputs.count();
	let target = null;
	for (let index = 0; index < count; index += 1) {
		const input = inputs.nth(index);
		if (!(await input.isVisible().catch(() => false))) continue;
		const type = await input.getAttribute("type").catch(() => "");
		if (type === "password" || type === "email") continue;
		const placeholder = cleanText(await input.getAttribute("placeholder").catch(() => ""));
		if (/cliente|consult|busca|pesquis|login|radius/i.test(placeholder)) {
			target = input;
			break;
		}
	}
	target ||= await firstVisible(inputs);
	await fillHuman(target, loginRadius);
	await Promise.all([
		page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {}),
		clickByText(page, "CONSULTAR", target).catch(() =>
			clickByText(page, "BUSCAR", target),
		),
	]);
	await page.waitForTimeout(4000);
	const body = await page.locator("body").innerText();
	const client = extractHubsoftClient(body, loginRadius);
	if (!client.found) {
		const error = new Error("Cliente nao encontrado no HubSoft pelo Login radius.");
		error.statusCode = 404;
		error.details = client.raw;
		throw error;
	}
	return client;
	} finally {
		await context.close().catch(() => {});
	}
}

async function performSerialLookup(serial) {
	const autoIspCredentials = {
		baseUrl: String(process.env.AUTOISP_BASE_URL || DEFAULT_AUTOISP_URL).replace(/\/+$/, ""),
		username: resolveCredential(
			process.env.AUTOISP_USERNAME,
			process.env.HUBSOFT_WEB_USERNAME,
			process.env.HUBSOFT_USERNAME,
		),
		password: resolveCredential(
			process.env.AUTOISP_PASSWORD,
			process.env.HUBSOFT_WEB_PASSWORD,
			process.env.HUBSOFT_PASSWORD,
		),
	};
	const hubsoftConfig = await readHubsoftWebConfig();
	const hubsoftCredentials = {
		baseUrl: String(
			hubsoftConfig.baseUrl ||
				process.env.HUBSOFT_WEB_BASE_URL ||
				DEFAULT_HUBSOFT_URL,
		).replace(/\/+$/, ""),
		username: resolveCredential(hubsoftConfig.username, resolveHubsoftUsername()),
		password: resolveCredential(
			hubsoftConfig.password,
			process.env.HUBSOFT_WEB_PASSWORD,
			process.env.HUBSOFT_PASSWORD,
		),
	};

	if (!autoIspCredentials.username || !autoIspCredentials.password) {
		const error = new Error("Credenciais do AutoISP nao configuradas.");
		error.statusCode = 503;
		throw error;
	}
	if (!hubsoftCredentials.username || !hubsoftCredentials.password) {
		const error = new Error("Credenciais do HubSoft nao configuradas.");
		error.statusCode = 503;
		throw error;
	}

	const autoIsp = await metrics.observeOperation(
		{ kind: "integration", name: "autoisp", stage: "serial_lookup" },
		() => searchAutoIspSerial(serial, autoIspCredentials),
	);
	const loginRadius = cleanText(autoIsp.descricaoOlt);
	if (!loginRadius) {
		const error = new Error("AutoISP nao retornou descricao na OLT.");
		error.statusCode = 404;
		throw error;
	}
	let hubsoft = null;
	let hubsoftError = null;
	try {
		hubsoft = await metrics.observeOperation(
			{ kind: "integration", name: "hubsoft", stage: "client_lookup" },
			() => searchHubsoftClientByRadius(loginRadius, hubsoftCredentials),
		);
	} catch (error) {
		hubsoftError = error;
	}
	return {
		ok: true,
		partial: Boolean(hubsoftError),
		serial,
		autoIsp,
		loginRadius,
		hubsoft: hubsoft || {
			found: false,
			loginRadius,
			error: hubsoftError?.message || "Cliente nao encontrado no HubSoft.",
		},
		message: hubsoftError
			? "Serial encontrado no AutoISP, mas o cliente ainda nao foi localizado no HubSoft."
			: "",
		testSerial: "4857544361b277b7",
	};
}

async function lookupBySerial(serialRaw) {
	const serial = normalizeSerial(serialRaw);
	if (serial.length < 8) {
		const error = new Error("Informe um serial valido.");
		error.statusCode = 400;
		throw error;
	}
	return runSerialLookupSingleFlight(serial, () => performSerialLookup(serial));
}

module.exports = {
	lookupBySerial,
	normalizeSerial,
	_testing: {
		createSingleFlight,
		normalizeAutoIspError,
		requestHubsoftClientByWebApi,
	},
};
