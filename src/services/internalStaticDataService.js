import { getVpsStaticSnapshot } from "./vpsApiClient";

export const SNAPSHOT_DOMAINS = Object.freeze({
	DASHBOARD: "dashboard",
	RH: "rh",
	OPERACIONAL: "operacional",
	FINANCEIRO: "financeiro",
});

export const INTERNAL_STATIC_DATA_UPDATED_EVENT =
	"internal-static-data-updated";
const INTERNAL_STATIC_DATA_VERSION_KEY = "internal-static-data-version";
const INTERNAL_STATIC_DATA_UNAVAILABLE_UNTIL_KEY =
	"internal-static-data-unavailable-until";
const INTERNAL_STATIC_DATA_UNAVAILABLE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_AGGREGATE_DOMAINS = Object.freeze([
	SNAPSHOT_DOMAINS.DASHBOARD,
	SNAPSHOT_DOMAINS.RH,
	SNAPSHOT_DOMAINS.OPERACIONAL,
	SNAPSHOT_DOMAINS.FINANCEIRO,
]);

const cacheByDomain = new Map();
const pendingByDomain = new Map();

function getUnavailableUntil() {
	if (typeof window === "undefined") return 0;

	const raw = window.localStorage.getItem(
		INTERNAL_STATIC_DATA_UNAVAILABLE_UNTIL_KEY,
	);
	const value = Number(raw || 0);
	return Number.isFinite(value) ? value : 0;
}

function isSnapshotEndpointTemporarilyUnavailable() {
	return getUnavailableUntil() > Date.now();
}

function markSnapshotEndpointUnavailable() {
	if (typeof window === "undefined") return;

	window.localStorage.setItem(
		INTERNAL_STATIC_DATA_UNAVAILABLE_UNTIL_KEY,
		String(Date.now() + INTERNAL_STATIC_DATA_UNAVAILABLE_TTL_MS),
	);
}

function clearSnapshotEndpointUnavailable() {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(INTERNAL_STATIC_DATA_UNAVAILABLE_UNTIL_KEY);
}

function normalizeDomains(domains = DEFAULT_AGGREGATE_DOMAINS) {
	const requestedDomains = Array.isArray(domains) ? domains : [domains];
	return [...new Set(requestedDomains.filter(Boolean))];
}

async function requestInternalSnapshot(domain) {
	if (isSnapshotEndpointTemporarilyUnavailable()) {
		throw new Error("Snapshot interno temporariamente indisponivel.");
	}

	try {
		const snapshot = await getVpsStaticSnapshot(domain);
		clearSnapshotEndpointUnavailable();
		return snapshot;
	} catch (error) {
		markSnapshotEndpointUnavailable();
		throw error;
	}
}

function mergeSnapshotValues(base, next) {
	if (next == null) return base;
	if (base == null) return next;

	if (Array.isArray(base) || Array.isArray(next)) {
		return next;
	}

	if (typeof base !== "object" || typeof next !== "object") {
		return next;
	}

	const result = { ...base };
	Object.entries(next).forEach(([key, value]) => {
		result[key] =
			key in result ? mergeSnapshotValues(result[key], value) : value;
	});
	return result;
}

function mergeSnapshotFragments(fragments = []) {
	return fragments.reduce(
		(accumulator, fragment) => mergeSnapshotValues(accumulator, fragment),
		{},
	);
}

export function invalidateInternalStaticDataCache(versionToken = null) {
	cacheByDomain.clear();
	pendingByDomain.clear();

	if (typeof window === "undefined") return;

	clearSnapshotEndpointUnavailable();
	const nextVersion = versionToken || new Date().toISOString();
	window.localStorage.setItem(INTERNAL_STATIC_DATA_VERSION_KEY, nextVersion);
	window.dispatchEvent(
		new CustomEvent(INTERNAL_STATIC_DATA_UPDATED_EVENT, {
			detail: { version: nextVersion },
		}),
	);
}

export async function getInternalSnapshot(domain, { force = false } = {}) {
	if (!domain) {
		throw new Error("Dominio de snapshot interno obrigatorio.");
	}

	if (!force && cacheByDomain.has(domain)) {
		return cacheByDomain.get(domain);
	}

	if (!force && pendingByDomain.has(domain)) {
		return pendingByDomain.get(domain);
	}

	const request = requestInternalSnapshot(domain)
		.then((snapshot) => {
			cacheByDomain.set(domain, snapshot);
			pendingByDomain.delete(domain);
			return snapshot;
		})
		.catch((error) => {
			pendingByDomain.delete(domain);
			throw error;
		});

	pendingByDomain.set(domain, request);
	return request;
}

export async function getInternalSnapshotSlice(
	domain,
	selector,
	{ force = false } = {},
) {
	try {
		const data = await getInternalSnapshot(domain, { force });
		return typeof selector === "function" ? selector(data) : data;
	} catch {
		return null;
	}
}

export async function getInternalStaticData({
	force = false,
	domains = DEFAULT_AGGREGATE_DOMAINS,
} = {}) {
	const normalizedDomains = normalizeDomains(domains);

	const fragments = await Promise.all(
		normalizedDomains.map((domain) =>
			getInternalSnapshot(domain, { force }).catch(() => null),
		),
	);

	return mergeSnapshotFragments(fragments.filter(Boolean));
}

export async function getInternalStaticDataSlice(
	domainOrSelector,
	selectorOrOptions,
	maybeOptions = {},
) {
	if (typeof domainOrSelector === "string") {
		return getInternalSnapshotSlice(
			domainOrSelector,
			selectorOrOptions,
			maybeOptions,
		);
	}

	try {
		const data = await getInternalStaticData(selectorOrOptions || {});
		return typeof domainOrSelector === "function"
			? domainOrSelector(data)
			: data;
	} catch {
		return null;
	}
}

export async function getInternalStaticDataMeta({
	force = false,
	domain = SNAPSHOT_DOMAINS.DASHBOARD,
} = {}) {
	try {
		const data = await getInternalSnapshot(domain, { force });
		return {
			available: Boolean(data?.generatedAt),
			generatedAt: data?.generatedAt || null,
		};
	} catch {
		return {
			available: false,
			generatedAt: null,
		};
	}
}

export function getCachedInternalStaticData(domain = null) {
	if (domain) {
		return cacheByDomain.get(domain) || null;
	}

	return mergeSnapshotFragments([...cacheByDomain.values()]);
}
