import { useEffect, useRef, useState } from "react";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import { getApiBaseUrl } from "../../../services/vpsApiClient";
import { logger } from "../../../utils/logger";

const API_PATH = "/acompanhamento/resumo";
const DATA_URL = `${getApiBaseUrl()}${API_PATH}`;
const UPDATED_EVENT = "acompanhamento-resumo-updated";
const VERSION_KEY = "acompanhamento-resumo-version";
const CACHE_KEY = "acompanhamento-resumo-cache";
const CACHE_DAY_KEY = "acompanhamento-resumo-cache-day";
const CACHE_NAME = "acompanhamento-resumo-v1";
const CACHE_REQUEST = `${DATA_URL}?cache=acompanhamento-resumo`;
const TIMEZONE = "America/Sao_Paulo";

let cache = null;
let pendingRequest = null;
let cacheGeneration = 0;

function getTodayKey(date = new Date()) {
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: TIMEZONE,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(date);
		const year = parts.find((part) => part.type === "year")?.value;
		const month = parts.find((part) => part.type === "month")?.value;
		const day = parts.find((part) => part.type === "day")?.value;
		if (year && month && day) return `${year}-${month}-${day}`;
	} catch {
		// Browser fallback below.
	}
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function getVersionToken() {
	if (typeof window === "undefined") return "initial";
	return window.localStorage.getItem(VERSION_KEY) || "initial";
}

function buildUrl() {
	return `${getApiBaseUrl()}${API_PATH}?v=${encodeURIComponent(getVersionToken())}`;
}

function canUseLocalStorage() {
	return (
		typeof window !== "undefined" && typeof window.localStorage !== "undefined"
	);
}

function readLocalStorageCache() {
	if (!canUseLocalStorage()) return null;
	if (window.localStorage.getItem(CACHE_DAY_KEY) !== getTodayKey()) return null;
	const raw = window.localStorage.getItem(CACHE_KEY);
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		window.localStorage.removeItem(CACHE_KEY);
		window.localStorage.removeItem(CACHE_DAY_KEY);
		return null;
	}
}

function writeLocalStorageCache(json) {
	if (!canUseLocalStorage()) return;
	try {
		window.localStorage.setItem(CACHE_KEY, JSON.stringify(json));
		window.localStorage.setItem(CACHE_DAY_KEY, getTodayKey());
	} catch {
		window.localStorage.removeItem(CACHE_KEY);
		window.localStorage.removeItem(CACHE_DAY_KEY);
	}
}

async function readCacheStorageData() {
	if (typeof caches === "undefined") return null;
	try {
		const store = await caches.open(CACHE_NAME);
		const response = await store.match(CACHE_REQUEST);
		if (!response) return null;
		if (response.headers.get("x-static-cache-day") !== getTodayKey()) return null;
		return await response.json();
	} catch {
		return null;
	}
}

async function writeCacheStorageData(json) {
	if (typeof caches === "undefined") return;
	try {
		const store = await caches.open(CACHE_NAME);
		const response = new Response(JSON.stringify(json), {
			headers: {
				"content-type": "application/json",
				"x-static-cache-day": getTodayKey(),
			},
		});
		await store.put(CACHE_REQUEST, response);
	} catch {
		// Optional browser cache only.
	}
}

export function invalidateAcompanhamentoResumoCache(versionToken = null) {
	cache = null;
	pendingRequest = null;
	cacheGeneration += 1;
	if (typeof window === "undefined") return;
	const nextVersion = versionToken || new Date().toISOString();
	window.localStorage.setItem(VERSION_KEY, nextVersion);
	window.localStorage.removeItem(CACHE_KEY);
	window.localStorage.removeItem(CACHE_DAY_KEY);
	if (typeof caches !== "undefined") {
		caches.delete(CACHE_NAME).catch(() => {});
	}
	window.dispatchEvent(
		new CustomEvent(UPDATED_EVENT, {
			detail: { version: nextVersion },
		}),
	);
}

async function fetchResumo({ force = false } = {}) {
	const generationAtStart = cacheGeneration;
	if (!force && cache) return cache;
	if (pendingRequest) return pendingRequest;

	pendingRequest = Promise.resolve()
		.then(async () => {
			if (force) return null;
			return readLocalStorageCache() || (await readCacheStorageData());
		})
		.then((cachedJson) => {
			if (cachedJson) return cachedJson;
			return fetch(buildUrl(), {
				cache: force ? "reload" : "no-store",
			}).then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			});
		})
		.then((json) => {
			if (generationAtStart !== cacheGeneration) {
				pendingRequest = null;
				return fetchResumo({ force: true });
			}
			cache = json;
			writeLocalStorageCache(json);
			writeCacheStorageData(json);
			pendingRequest = null;
			return json;
		})
		.catch((error) => {
			pendingRequest = null;
			throw error;
		});

	return pendingRequest;
}

export function useAcompanhamentoResumoData(options = {}) {
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
			fetchResumo({ force })
				.then((json) => {
					if (!mounted.current) return;
					setData(json);
					setLoading(false);
				})
				.catch((err) => {
					if (!mounted.current) return;
					logger.error("[useAcompanhamentoResumoData] Erro:", err);
					setError(err.message || "Erro ao carregar acompanhamento");
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

		const handleUpdated = () => {
			loadData(true, { silent: true });
		};
		window.addEventListener(UPDATED_EVENT, handleUpdated);
		const unsubscribeRealtime = subscribeRealtimeTopics(
			["dashboard", "metas", "mapa", "match", "acompanhamento"],
			(event) => {
				invalidateAcompanhamentoResumoCache(
					event?.emittedAt || new Date().toISOString(),
				);
			},
			{ debounceMs: 250 },
		);

		return () => {
			mounted.current = false;
			if (refreshTimer) window.clearTimeout(refreshTimer);
			if (refreshInterval) window.clearInterval(refreshInterval);
			unsubscribeRealtime();
			window.removeEventListener(UPDATED_EVENT, handleUpdated);
		};
	}, [refreshIntervalMs, refreshKey]);

	return { data, loading, error };
}
