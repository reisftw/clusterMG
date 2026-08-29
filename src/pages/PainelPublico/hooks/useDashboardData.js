import { useEffect, useRef, useState } from "react";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import { getApiBaseUrl } from "../../../services/vpsApiClient";
import { logger } from "../../../utils/logger";

const VPS_PUBLIC_DASHBOARD_PATH = "/public/dashboard";
const DATA_JSON_URL = `${getApiBaseUrl()}${VPS_PUBLIC_DASHBOARD_PATH}`;
const STATIC_DATA_UPDATED_EVENT = "static-data-updated";
const STATIC_DATA_VERSION_KEY = "static-data-version";
const STATIC_DATA_CACHE_KEY = "public-dashboard-data-cache";
const STATIC_DATA_CACHE_DAY_KEY = "public-dashboard-data-cache-day";
const STATIC_DATA_CACHE_NAME = "public-dashboard-data-v1";
const STATIC_DATA_CACHE_REQUEST = `${DATA_JSON_URL}?cache=public-dashboard`;
const STATIC_DATA_TIMEZONE = "America/Sao_Paulo";

let cache = null;
let pendingRequest = null;
let cacheGeneration = 0;

function getTodayKey(date = new Date()) {
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: STATIC_DATA_TIMEZONE,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(date);

		const year = parts.find((part) => part.type === "year")?.value;
		const month = parts.find((part) => part.type === "month")?.value;
		const day = parts.find((part) => part.type === "day")?.value;

		if (year && month && day) return `${year}-${month}-${day}`;
	} catch {
		// Fallback below keeps the cache usable in restricted browsers.
	}

	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function getVersionToken() {
	if (typeof window === "undefined") return "initial";
	return window.localStorage.getItem(STATIC_DATA_VERSION_KEY) || "initial";
}

function buildDataJsonUrl() {
	const version = encodeURIComponent(getVersionToken());
	return `${DATA_JSON_URL}?v=${version}`;
}

function buildVpsDashboardUrl() {
	const version = encodeURIComponent(getVersionToken());
	return `${getApiBaseUrl()}${VPS_PUBLIC_DASHBOARD_PATH}?v=${version}`;
}

function canUseLocalStorage() {
	return (
		typeof window !== "undefined" && typeof window.localStorage !== "undefined"
	);
}

function readLocalStorageCache() {
	if (!canUseLocalStorage()) return null;
	if (
		window.localStorage.getItem(STATIC_DATA_CACHE_DAY_KEY) !== getTodayKey()
	) {
		return null;
	}

	const raw = window.localStorage.getItem(STATIC_DATA_CACHE_KEY);
	if (!raw) return null;

	try {
		return JSON.parse(raw);
	} catch {
		window.localStorage.removeItem(STATIC_DATA_CACHE_KEY);
		window.localStorage.removeItem(STATIC_DATA_CACHE_DAY_KEY);
		return null;
	}
}

function writeLocalStorageCache(json) {
	if (!canUseLocalStorage()) return;

	try {
		window.localStorage.setItem(STATIC_DATA_CACHE_KEY, JSON.stringify(json));
		window.localStorage.setItem(STATIC_DATA_CACHE_DAY_KEY, getTodayKey());
	} catch {
		window.localStorage.removeItem(STATIC_DATA_CACHE_KEY);
		window.localStorage.removeItem(STATIC_DATA_CACHE_DAY_KEY);
	}
}

async function readCacheStorageData() {
	if (typeof caches === "undefined") return null;

	try {
		const store = await caches.open(STATIC_DATA_CACHE_NAME);
		const response = await store.match(STATIC_DATA_CACHE_REQUEST);
		if (!response) return null;

		const dayKey = response.headers.get("x-static-cache-day");
		if (dayKey !== getTodayKey()) return null;

		return await response.json();
	} catch {
		return null;
	}
}

async function writeCacheStorageData(json) {
	if (typeof caches === "undefined") return;

	try {
		const store = await caches.open(STATIC_DATA_CACHE_NAME);
		const response = new Response(JSON.stringify(json), {
			headers: {
				"content-type": "application/json",
				"x-static-cache-day": getTodayKey(),
			},
		});
		await store.put(STATIC_DATA_CACHE_REQUEST, response);
	} catch {
		// Cache Storage is an optimization only; memory cache still handles the page.
	}
}

export function invalidateDashboardDataCache(versionToken = null) {
	cache = null;
	pendingRequest = null;
	cacheGeneration += 1;

	if (typeof window === "undefined") return;

	const nextVersion = versionToken || new Date().toISOString();
	window.localStorage.setItem(STATIC_DATA_VERSION_KEY, nextVersion);
	window.localStorage.removeItem(STATIC_DATA_CACHE_KEY);
	window.localStorage.removeItem(STATIC_DATA_CACHE_DAY_KEY);
	if (typeof caches !== "undefined") {
		caches.delete(STATIC_DATA_CACHE_NAME).catch(() => {});
	}
	window.dispatchEvent(
		new CustomEvent(STATIC_DATA_UPDATED_EVENT, {
			detail: { version: nextVersion },
		}),
	);
}

async function fetchDataJSON({ force = false } = {}) {
	const generationAtStart = cacheGeneration;
	if (!force && cache) return cache;
	if (pendingRequest && !force) return pendingRequest;

	pendingRequest = Promise.resolve()
		.then(async () => {
			if (force) return null;

			const localStorageCache = readLocalStorageCache();
			if (localStorageCache) return localStorageCache;

			return readCacheStorageData();
		})
		.then((cachedJson) => {
			if (cachedJson) return cachedJson;

			return fetch(buildVpsDashboardUrl(), {
				cache: force ? "reload" : "no-store",
			})
				.then((res) => {
					if (!res.ok) throw new Error(`VPS HTTP ${res.status}`);
					return res.json();
				})
				.catch((error) => {
					logger.warn(
						"[useDashboardData] VPS indisponivel, usando JSON publico legado.",
						error,
					);
					return fetch(buildDataJsonUrl(), {
						cache: force ? "reload" : "default",
					}).then((res) => {
						if (!res.ok) throw new Error(`HTTP ${res.status}`);
						return res.json();
					});
				});
		})
		.then((json) => {
			if (generationAtStart !== cacheGeneration) {
				pendingRequest = null;
				return fetchDataJSON({ force: true });
			}
			cache = json;
			writeLocalStorageCache(json);
			writeCacheStorageData(json);
			pendingRequest = null;
			return json;
		})
		.catch((err) => {
			pendingRequest = null;
			throw err;
		});

	return pendingRequest;
}

export function useDashboardData(options = {}) {
	const refreshIntervalMs = Math.max(0, Number(options.refreshIntervalMs || 0));
	const refreshKey = options.refreshKey || "";
	const [data, setData] = useState(cache);
	const [loading, setLoading] = useState(!cache);
	const [error, setError] = useState(null);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		let refreshTimer = null;
		let refreshInterval = null;

		const loadData = (force = false, { silent = false } = {}) => {
			if (!force && cache) return;

			if (!silent) setLoading(true);
			setError(null);

			fetchDataJSON({ force })
				.then((json) => {
					if (!mounted.current) return;
					setData(json);
					setLoading(false);
				})
				.catch((err) => {
					if (!mounted.current) return;
					logger.error("[useDashboardData] Erro:", err);
					setError(err.message || "Erro ao carregar dados");
					setLoading(false);
				});
		};

		loadData(Boolean(refreshKey), { silent: Boolean(refreshKey) });
		refreshTimer = window.setTimeout(() => {
			loadData(true, { silent: true });
		}, 750);
		if (refreshIntervalMs > 0) {
			refreshInterval = window.setInterval(() => {
				loadData(true, { silent: true });
			}, refreshIntervalMs);
		}

		const handleStaticDataUpdated = () => {
			loadData(true, { silent: true });
		};

		window.addEventListener(STATIC_DATA_UPDATED_EVENT, handleStaticDataUpdated);
		const unsubscribeRealtime = subscribeRealtimeTopics(
			["dashboard", "metas", "mapa", "match", "acompanhamento"],
			(event) => {
				invalidateDashboardDataCache(
					event?.emittedAt || new Date().toISOString(),
				);
				loadData(true, { silent: true });
			},
			{ debounceMs: 250 },
		);

		return () => {
			mounted.current = false;
			if (refreshTimer) window.clearTimeout(refreshTimer);
			if (refreshInterval) window.clearInterval(refreshInterval);
			unsubscribeRealtime();
			window.removeEventListener(
				STATIC_DATA_UPDATED_EVENT,
				handleStaticDataUpdated,
			);
		};
	}, [refreshIntervalMs, refreshKey]);

	return { data, loading, error };
}
