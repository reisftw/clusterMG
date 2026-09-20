const crypto = require("node:crypto");
const documents = require("./documents");

const CONFIG_PATH = "logistica_config/global";

const DEFAULT_PROVIDERS = [
	{ id: "manual", nome: "Cotação manual", tipo: "manual", ativo: true },
	{
		id: "lalamove",
		nome: "Lalamove",
		tipo: "api",
		ativo: false,
		environment: "sandbox",
		market: "BR",
		serviceType: "LALAGO",
		language: "pt_BR",
	},
	{ id: "uber_direct", nome: "Uber Direct", tipo: "api", ativo: false },
	{ id: "loggi", nome: "Loggi", tipo: "api", ativo: false },
	{
		id: "ifood_sob_demanda",
		nome: "iFood Sob Demanda",
		tipo: "api",
		ativo: false,
	},
];

const DEFAULT_CONFIG = {
	providers: DEFAULT_PROVIDERS,
	providerPreferencial: "manual",
	cotacaoAutomaticaAtiva: false,
	exigeAprovacaoAntesPedido: true,
	observacoes: "",
};

function cleanText(value) {
	return String(value || "").trim();
}

function normalizeComparableText(value) {
	return cleanText(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^\w\s]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function uniqueTexts(values = []) {
	const seen = new Set();
	return values
		.map(cleanText)
		.filter(Boolean)
		.filter((value) => {
			const key = normalizeComparableText(value);
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

function buildGeocodeCandidates(payload = {}) {
	const estado = cleanText(payload.estado || "MG");
	const pais = cleanText(payload.pais || "Brasil");
	const endereco = cleanText(payload.endereco);
	const numero = cleanText(payload.numero);
	const bairro = cleanText(payload.bairro);
	const cidade = cleanText(payload.cidade);
	const enderecoComNumero = [endereco, numero].filter(Boolean).join(", ");
	return uniqueTexts([
		payload.query,
		[endereco, numero, bairro, cidade, estado, pais].filter(Boolean).join(", "),
		[enderecoComNumero, bairro, cidade, estado, pais].filter(Boolean).join(", "),
		[enderecoComNumero, cidade, estado, pais].filter(Boolean).join(", "),
		[endereco, bairro, cidade, estado, pais].filter(Boolean).join(", "),
		[endereco, cidade, estado, pais].filter(Boolean).join(", "),
		[bairro, cidade, estado, pais].filter(Boolean).join(", "),
		[cidade, estado, pais].filter(Boolean).join(", "),
	]);
}

function getGeocodeAddressText(result = {}) {
	const address = result.address || {};
	return [
		result.display_name,
		address.road,
		address.pedestrian,
		address.neighbourhood,
		address.suburb,
		address.city,
		address.town,
		address.village,
		address.municipality,
		address.state,
		address.country,
	]
		.filter(Boolean)
		.join(" ");
}

function scoreGeocodeResult(result = {}, payload = {}) {
	const address = result.address || {};
	const haystack = normalizeComparableText(getGeocodeAddressText(result));
	const expectedCity = normalizeComparableText(payload.cidade);
	const expectedState = normalizeComparableText(payload.estado || "MG");
	const expectedCountry = normalizeComparableText(payload.pais || "Brasil");
	let score = Number(result.importance || 0) * 10;
	if (expectedCity && haystack.includes(expectedCity)) score += 50;
	if (expectedState && haystack.includes(expectedState)) score += 20;
	if (expectedCountry && haystack.includes(expectedCountry)) score += 10;
	if (String(address.country_code || "").toLowerCase() === "br") score += 15;
	if (["house", "building", "residential", "road"].includes(result.type))
		score += 8;
	return score;
}

function pickBestGeocodeResult(results = [], payload = {}) {
	return results
		.filter((item) => item?.lat && item?.lon)
		.sort(
			(a, b) =>
				scoreGeocodeResult(b, payload) - scoreGeocodeResult(a, payload),
		)[0];
}

function normalizeProvider(provider = {}, currentProvider = {}) {
	const id = cleanText(provider.id || currentProvider.id || provider.nome)
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "_");
	const next = {
		...currentProvider,
		...provider,
		id,
		nome: cleanText(provider.nome || currentProvider.nome || id),
		tipo: cleanText(provider.tipo || currentProvider.tipo || "manual"),
		ativo: provider.ativo !== false,
		baseUrl: cleanText(provider.baseUrl || currentProvider.baseUrl),
		credentialRef: cleanText(
			provider.credentialRef || currentProvider.credentialRef,
		),
		observacoes: cleanText(provider.observacoes || currentProvider.observacoes),
	};
	if (provider.apiKey !== undefined) next.apiKey = cleanText(provider.apiKey);
	if (provider.apiSecret !== undefined && cleanText(provider.apiSecret))
		next.apiSecret = cleanText(provider.apiSecret);
	if (provider.market !== undefined)
		next.market = cleanText(provider.market || "BR").toUpperCase();
	if (provider.environment !== undefined)
		next.environment = cleanText(provider.environment || "sandbox");
	if (provider.serviceType !== undefined)
		next.serviceType = normalizeLalamoveServiceType(
			provider.serviceType || "LALAGO",
		);
	if (provider.language !== undefined)
		next.language = cleanText(provider.language || "pt_BR");
	return next;
}

async function readConfig({ sanitized = true } = {}) {
	const item = await documents.getDocument(CONFIG_PATH).catch(() => null);
	const stored = item?.data || {};
	const currentProviders = new Map(
		(stored.providers || []).map((provider) => [provider.id, provider]),
	);
	const providers = DEFAULT_PROVIDERS.map((provider) =>
		normalizeProvider(currentProviders.get(provider.id) || provider, provider),
	);
	const extraProviders = (stored.providers || []).filter(
		(provider) => !providers.some((item) => item.id === provider.id),
	);
	const config = {
		...DEFAULT_CONFIG,
		...stored,
		providers: [
			...providers,
			...extraProviders.map((provider) => normalizeProvider(provider)),
		],
	};
	if (!sanitized) return config;
	return {
		...config,
		providers: config.providers.map((provider) => {
			const { apiSecret, ...safeProvider } = provider;
			return {
				...safeProvider,
				apiSecret: "",
				apiSecretConfigured: Boolean(
					apiSecret || getProviderEnv(provider.id).apiSecret,
				),
			};
		}),
	};
}

async function saveConfig(payload = {}) {
	const current = await readConfig({ sanitized: false });
	const currentProviders = new Map(
		(current.providers || []).map((provider) => [provider.id, provider]),
	);
	const providers = (
		payload.providers ||
		current.providers ||
		DEFAULT_PROVIDERS
	).map((provider) =>
		normalizeProvider(provider, currentProviders.get(provider.id) || {}),
	);
	const next = {
		...current,
		...payload,
		providers,
		atualizadoEm: new Date().toISOString(),
	};
	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: "logistica_config",
		documentId: "global",
		parentPath: null,
		data: next,
	});
	return readConfig({ sanitized: true });
}

function getProvider(config, providerId) {
	return (
		(config.providers || []).find((provider) => provider.id === providerId) ||
		{}
	);
}

function getProviderEnv(providerId) {
	if (providerId !== "lalamove") return {};
	return {
		apiKey: cleanText(process.env.LALAMOVE_API_KEY),
		apiSecret: cleanText(process.env.LALAMOVE_API_SECRET),
		baseUrl: cleanText(process.env.LALAMOVE_BASE_URL),
		market: cleanText(process.env.LALAMOVE_MARKET),
		serviceType: cleanText(process.env.LALAMOVE_SERVICE_TYPE),
		language: cleanText(process.env.LALAMOVE_LANGUAGE),
		environment: cleanText(process.env.LALAMOVE_ENVIRONMENT),
	};
}

function getLalamoveCredentials(provider = {}) {
	const env = getProviderEnv("lalamove");
	const environment = cleanText(
		env.environment || provider.environment || "sandbox",
	);
	return {
		apiKey: cleanText(env.apiKey || provider.apiKey),
		apiSecret: cleanText(env.apiSecret || provider.apiSecret),
		baseUrl: cleanText(
			env.baseUrl ||
				provider.baseUrl ||
				(environment === "production"
					? "https://rest.lalamove.com"
					: "https://rest.sandbox.lalamove.com"),
		).replace(/\/+$/, ""),
		market: cleanText(env.market || provider.market || "BR").toUpperCase(),
		serviceType: normalizeLalamoveServiceType(
			env.serviceType || provider.serviceType || "LALAGO",
		),
		language: cleanText(env.language || provider.language || "pt_BR"),
		environment,
	};
}

function normalizeLalamoveServiceType(value) {
	const serviceType = cleanText(value || "LALAGO").toUpperCase();
	if (serviceType === "MOTORCYCLE" || serviceType === "MOTO") return "LALAGO";
	const allowed = new Set([
		"CAR",
		"HATCHBACK",
		"LALAGO",
		"LALAGOFOUR",
		"TRUCK330",
		"TRUCK_6H",
		"UV_4H",
		"UV_FIORINO",
		"VAN",
	]);
	return allowed.has(serviceType) ? serviceType : "LALAGO";
}

function buildStop({ address, lat, lng, remarks } = {}) {
	const stop = {
		address: cleanText(address),
		coordinates: {
			lat: cleanText(lat),
			lng: cleanText(lng),
		},
	};
	if (remarks) stop.remarks = cleanText(remarks);
	return stop;
}

function signLalamoveRequest({ apiKey, apiSecret, method, path, body }) {
	const timestamp = Date.now().toString();
	const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
	const signature = crypto
		.createHmac("sha256", apiSecret)
		.update(rawSignature)
		.digest("hex");
	return `hmac ${apiKey}:${timestamp}:${signature}`;
}

function normalizeLalamoveQuote(data = {}) {
	const quote = data.data || data;
	const price =
		quote.priceBreakdown?.total ||
		quote.priceBreakdown?.subTotal ||
		quote.priceBreakdown?.base ||
		"";
	const currency =
		quote.priceBreakdown?.currency || quote.priceBreakdown?.totalCurrency || "";
	const distance = quote.distance?.value
		? `${quote.distance.value} ${quote.distance.unit || "m"}`
		: "";
	return {
		quotationId: quote.quotationId || "",
		expiresAt: quote.expiresAt || "",
		serviceType: quote.serviceType || "",
		price,
		currency,
		distance,
		raw: data,
	};
}

function buildLalamoveError(data, responseText, status) {
	const errors = Array.isArray(data?.errors)
		? data.errors
				.map((item) => item.message || item.detail || item.code)
				.filter(Boolean)
		: [];
	const details = [data?.message, data?.error, data?.data?.message, ...errors]
		.filter(Boolean)
		.join(" | ");
	return `Falha na cotação Lalamove (${status}): ${details || responseText || "sem detalhe retornado"}`;
}

function buildGeocodeUrl(baseUrl, query) {
	const url = new URL(baseUrl);
	url.searchParams.set("format", "jsonv2");
	url.searchParams.set("limit", "5");
	url.searchParams.set("addressdetails", "1");
	url.searchParams.set("countrycodes", "br");
	url.searchParams.set("accept-language", "pt-BR,pt;q=0.9");
	url.searchParams.set("q", query);
	return url;
}

async function tryGeocodeQuery(baseUrl, query, payload) {
	const url = buildGeocodeUrl(baseUrl, query);
	const response = await fetch(url.toString(), {
		headers: {
			Accept: "application/json",
			"User-Agent": cleanText(
				process.env.LOGISTICA_GEOCODER_USER_AGENT ||
					"retiradas.tech logística/1.0",
			),
		},
	});
	const responseText = await response.text();
	let data = null;
	try {
		data = responseText ? JSON.parse(responseText) : null;
	} catch {
		data = null;
	}
	if (!response.ok) return { httpStatus: response.status, result: null };
	const result = Array.isArray(data) ? pickBestGeocodeResult(data, payload) : null;
	return { httpStatus: response.status, result };
}

async function geocodeAddress(payload = {}) {
	const queries = buildGeocodeCandidates(payload);
	if (!queries.length) {
		const error = new Error(
			"Informe um endereço para buscar latitude e longitude.",
		);
		error.statusCode = 400;
		throw error;
	}

	const baseUrl = cleanText(
		process.env.LOGISTICA_GEOCODER_URL ||
			"https://nominatim.openstreetmap.org/search",
	);
	let lastHttpStatus = null;
	let lastQuery = queries[0];
	let result = null;
	for (const query of queries) {
		lastQuery = query;
		const attempt = await tryGeocodeQuery(baseUrl, query, payload);
		lastHttpStatus = attempt.httpStatus;
		result = attempt.result;
		if (result) break;
	}

	if (!result?.lat || !result?.lon) {
		const error = new Error(`Não encontrei coordenadas para: ${lastQuery}`);
		error.statusCode = lastHttpStatus && lastHttpStatus >= 500 ? 502 : 404;
		throw error;
	}

	return {
		lat: result.lat,
		lng: result.lon,
		displayName: result.display_name || lastQuery,
		provider: "nominatim",
		query: lastQuery,
		attempts: queries.length,
	};
}

async function requestLalamoveQuotation(payload = {}) {
	const config = await readConfig({ sanitized: false });
	const credentials = getLalamoveCredentials(getProvider(config, "lalamove"));
	if (!credentials.apiKey || !credentials.apiSecret) {
		const error = new Error(
			"Configure API Key e API Secret da Lalamove em Logística > Configuração.",
		);
		error.statusCode = 400;
		throw error;
	}

	const pickupAddress = cleanText(
		payload.pickup?.address || payload.enderecoColeta,
	);
	const dropoffAddress = cleanText(
		payload.dropoff?.address || payload.pontoEndereco,
	);
	if (!pickupAddress || !dropoffAddress) {
		const error = new Error(
			"Informe endereço de coleta e ponto estratégico para cotar na Lalamove.",
		);
		error.statusCode = 400;
		throw error;
	}

	const pickupLat = payload.pickup?.lat || payload.latColeta;
	const pickupLng = payload.pickup?.lng || payload.lngColeta;
	const dropoffLat = payload.dropoff?.lat || payload.pontoLat;
	const dropoffLng = payload.dropoff?.lng || payload.pontoLng;
	const missingCoordinates = [];
	if (!pickupLat || !pickupLng) missingCoordinates.push("coleta");
	if (!dropoffLat || !dropoffLng) missingCoordinates.push("ponto estratégico");
	if (missingCoordinates.length) {
		const error = new Error(
			`Para testar a Lalamove, preencha latitude e longitude de ${missingCoordinates.join(" e ")}.`,
		);
		error.statusCode = 400;
		throw error;
	}

	const path = "/v3/quotations";
	const method = "POST";
	const body = JSON.stringify({
		data: {
			serviceType: cleanText(payload.serviceType || credentials.serviceType),
			language: cleanText(payload.language || credentials.language),
			stops: [
				buildStop({
					address: pickupAddress,
					lat: pickupLat,
					lng: pickupLng,
					remarks: payload.observacoes,
				}),
				buildStop({
					address: dropoffAddress,
					lat: dropoffLat,
					lng: dropoffLng,
				}),
			],
			item: {
				quantity: "1",
				weight: "LESS_THAN_3KG",
				categories: ["OTHERS"],
			},
		},
	});

	const response = await fetch(`${credentials.baseUrl}${path}`, {
		method,
		headers: {
			Authorization: signLalamoveRequest({
				...credentials,
				method,
				path,
				body,
			}),
			"Content-Type": "application/json",
			Market: credentials.market,
			"Request-ID": crypto.randomUUID(),
		},
		body,
	});
	const responseText = await response.text();
	let data = null;
	try {
		data = responseText ? JSON.parse(responseText) : null;
	} catch {
		data = { message: responseText };
	}
	if (!response.ok) {
		const error = new Error(
			buildLalamoveError(data, responseText, response.status),
		);
		error.statusCode =
			response.status >= 400 && response.status < 500 ? 400 : 502;
		error.details = data;
		throw error;
	}
	return normalizeLalamoveQuote(data);
}

module.exports = {
	geocodeAddress,
	readConfig,
	requestLalamoveQuotation,
	saveConfig,
};
