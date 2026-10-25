const DEFAULT_TIMEOUT_MS = 15_000;
const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_OPEN_MS = 60_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

let circuit = {
	failures: 0,
	openedAt: 0,
	lastError: "",
};

function cleanText(value) {
	return String(value ?? "").trim();
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizePayload(value) {
	if (Array.isArray(value)) return value.map(sanitizePayload);
	if (!value || typeof value !== "object") return value;
	return Object.entries(value).reduce((result, [key, entry]) => {
		if (/(access_token|token|secret|authorization)/i.test(key)) {
			result[key] = "[REDACTED]";
		} else {
			result[key] = sanitizePayload(entry);
		}
		return result;
	}, {});
}

function graphError(response, payload) {
	const details = payload?.error || payload || {};
	const error = new Error(
		cleanText(details.message) || `Meta Graph API respondeu HTTP ${response.status}.`,
	);
	error.statusCode = response.status === 429 ? 429 : 502;
	error.httpStatus = response.status;
	error.metaCode = cleanText(details.code);
	error.metaSubcode = cleanText(details.error_subcode);
	error.metaType = cleanText(details.type);
	error.details = sanitizePayload(details);
	return error;
}

function assertCircuitAvailable() {
	if (!circuit.openedAt) return;
	if (Date.now() - circuit.openedAt >= CIRCUIT_OPEN_MS) {
		circuit = { failures: 0, openedAt: 0, lastError: "" };
		return;
	}
	const error = new Error(
		"A conexão com a Meta foi pausada temporariamente após falhas consecutivas.",
	);
	error.statusCode = 503;
	error.retryAfterSeconds = Math.ceil(
		(CIRCUIT_OPEN_MS - (Date.now() - circuit.openedAt)) / 1000,
	);
	throw error;
}

function registerSuccess() {
	circuit = { failures: 0, openedAt: 0, lastError: "" };
}

function registerFailure(error) {
	circuit.failures += 1;
	circuit.lastError = cleanText(error?.message);
	if (circuit.failures >= CIRCUIT_FAILURE_LIMIT) circuit.openedAt = Date.now();
}

function normalizeVersion(value) {
	const version = cleanText(value || "v26.0");
	if (!/^v\d+\.\d+$/.test(version)) {
		const error = new Error("Versão da Graph API inválida.");
		error.statusCode = 400;
		throw error;
	}
	return version;
}

function createMetaCloudProvider({ accessToken, graphApiVersion, timeoutMs } = {}) {
	const token = cleanText(accessToken);
	const version = normalizeVersion(graphApiVersion);
	const requestTimeout = Math.max(
		1_000,
		Number(timeoutMs || process.env.META_GRAPH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
	);
	const baseUrl = `https://graph.facebook.com/${version}`;

	function requireToken() {
		if (token) return;
		const error = new Error(
			"META_ACCESS_TOKEN não está configurado no ambiente seguro do backend.",
		);
		error.statusCode = 412;
		throw error;
	}

	async function request(path, options = {}) {
		requireToken();
		assertCircuitAvailable();
		const method = cleanText(options.method || "GET").toUpperCase();
		const retrySafe = options.retrySafe !== false && method === "GET";
		const attempts = retrySafe ? 3 : 1;
		let lastError = null;

		for (let attempt = 0; attempt < attempts; attempt += 1) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), requestTimeout);
			try {
				const response = await fetch(`${baseUrl}/${String(path).replace(/^\/+/, "")}`, {
					method,
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
						...(options.headers || {}),
					},
					body: options.body ? JSON.stringify(options.body) : undefined,
					signal: controller.signal,
				});
				const text = await response.text();
				let payload = {};
				try {
					payload = text ? JSON.parse(text) : {};
				} catch {
					payload = { message: text.slice(0, 500) };
				}
				if (!response.ok) throw graphError(response, payload);
				registerSuccess();
				return {
					data: sanitizePayload(payload),
					httpStatus: response.status,
				};
			} catch (error) {
				lastError = error;
				const isAbort = error?.name === "AbortError";
				if (isAbort) {
					lastError = new Error("A consulta à Meta excedeu o tempo limite.");
					lastError.statusCode = 504;
					lastError.httpStatus = 504;
				}
				const retryable =
					retrySafe &&
					(isAbort || RETRYABLE_STATUS.has(Number(lastError?.httpStatus || 0)));
				if (!retryable || attempt === attempts - 1) break;
				await sleep(300 * 2 ** attempt);
			} finally {
				clearTimeout(timer);
			}
		}

		registerFailure(lastError);
		throw lastError;
	}

	async function validatePhoneNumber(phoneNumberId) {
		const id = encodeURIComponent(cleanText(phoneNumberId));
		if (!id) {
			const error = new Error("Phone Number ID não configurado.");
			error.statusCode = 400;
			throw error;
		}
		return request(
			`${id}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`,
		);
	}

	async function validateWaba(wabaId) {
		const id = encodeURIComponent(cleanText(wabaId));
		if (!id) {
			const error = new Error("WABA ID não configurado.");
			error.statusCode = 400;
			throw error;
		}
		return request(`${id}?fields=id,name,currency,timezone_id`);
	}

	async function listTemplates(wabaId) {
		const id = encodeURIComponent(cleanText(wabaId));
		if (!id) {
			const error = new Error("WABA ID não configurado.");
			error.statusCode = 400;
			throw error;
		}
		const items = [];
		let path = `${id}/message_templates?limit=100&fields=id,name,status,category,language,components`;
		for (let page = 0; path && page < 20; page += 1) {
			const response = await request(path);
			items.push(...(Array.isArray(response.data?.data) ? response.data.data : []));
			const next = cleanText(response.data?.paging?.next);
			path = next.startsWith(`${baseUrl}/`) ? next.slice(baseUrl.length + 1) : "";
		}
		return { items, httpStatus: 200 };
	}

	async function sendTemplate({ phoneNumberId, to, template, language, variables }) {
		const id = encodeURIComponent(cleanText(phoneNumberId));
		const parameters = (Array.isArray(variables) ? variables : [])
			.map((value) => cleanText(value))
			.filter(Boolean)
			.map((text) => ({ type: "text", text: text.slice(0, 1024) }));
		const components = parameters.length
			? [{ type: "body", parameters }]
			: undefined;
		return request(`${id}/messages`, {
			method: "POST",
			retrySafe: false,
			body: {
				messaging_product: "whatsapp",
				recipient_type: "individual",
				to: cleanText(to).replace(/\D/g, ""),
				type: "template",
				template: {
					name: cleanText(template),
					language: { code: cleanText(language || "en_US") },
					...(components ? { components } : {}),
				},
			},
		});
	}

	return {
		baseUrl,
		graphApiVersion: version,
		listTemplates,
		request,
		sendTemplate,
		validatePhoneNumber,
		validateWaba,
	};
}

module.exports = {
	__testables: {
		getCircuit: () => ({ ...circuit }),
		normalizeVersion,
		resetCircuit: () => {
			circuit = { failures: 0, openedAt: 0, lastError: "" };
		},
		sanitizePayload,
	},
	createMetaCloudProvider,
};
