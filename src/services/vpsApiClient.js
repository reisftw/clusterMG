import { captureApiError } from "./errorTracking";
import {
	clearVpsAuthSession,
	getVpsAuthSession,
	getVpsAuthToken,
	getVpsCsrfToken,
	setVpsAuthSession,
} from "./vpsAuthSession";

const DEFAULT_API_BASE_URL = "https://retiradas.tech/api";
let csrfRefreshPromise = null;

export function isVpsBackendEnabled() {
	return (
		String(import.meta.env.VITE_DATA_BACKEND || "").toLowerCase() === "vps"
	);
}

export function getApiBaseUrl() {
	return String(
		import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
	).replace(/\/+$/, "");
}

function isUnsafeMethod(method) {
	return !["GET", "HEAD", "OPTIONS"].includes(
		String(method || "GET").toUpperCase(),
	);
}

async function parseJsonResponse(response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

async function refreshCsrfToken() {
	if (!csrfRefreshPromise) {
		csrfRefreshPromise = (async () => {
			const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
				cache: "no-store",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
			});
			const data = await parseJsonResponse(response);
			if (!response.ok || !data?.user) {
				if (response.status === 401) clearVpsAuthSession();
				throw new Error(data?.error || `Erro HTTP ${response.status}.`);
			}
			setVpsAuthSession({
				...getVpsAuthSession(),
				csrfToken: data.csrfToken || "",
				token: data.token || getVpsAuthSession()?.token || "",
				user: data.user,
			});
			return data.csrfToken || "";
		})().finally(() => {
			csrfRefreshPromise = null;
		});
	}
	return csrfRefreshPromise;
}

async function buildRequestHeaders(options = {}) {
	const token = getVpsAuthToken();
	const method = String(options.method || "GET").toUpperCase();
	const isFormData =
		typeof FormData !== "undefined" && options.body instanceof FormData;
	const headers = {
		...(options.headers || {}),
	};
	if (!isFormData && !headers["Content-Type"])
		headers["Content-Type"] = "application/json";
	if (token) headers.Authorization = `Bearer ${token}`;
	if (isUnsafeMethod(method)) {
		const csrfToken = getVpsCsrfToken() || (await refreshCsrfToken());
		if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
	}
	return headers;
}

async function fetchVpsApi(path, options = {}) {
	const response = await fetch(`${getApiBaseUrl()}${path}`, {
		...options,
		cache: options.cache || "no-store",
		credentials: options.credentials || "include",
		headers: await buildRequestHeaders(options),
	});
	const data = await parseJsonResponse(response);
	return { data, response };
}

function isCsrfError(response, data) {
	return (
		response.status === 403 &&
		String(data?.error || "")
			.toLowerCase()
			.includes("csrf")
	);
}

export async function requestVpsApi(path, options = {}) {
	let { data, response } = await fetchVpsApi(path, options);

	if (isUnsafeMethod(options.method) && isCsrfError(response, data)) {
		await refreshCsrfToken();
		({ data, response } = await fetchVpsApi(path, options));
	}

	if (!response.ok) {
		const message = data?.error || `Erro HTTP ${response.status}.`;
		const error = new Error(message);
		error.status = response.status;
		error.data = data;
		error.details = data?.details || data?.message || data?.hint || "";
		captureApiError({
			path,
			method: options.method || "GET",
			status: response.status,
			message,
		});
		throw error;
	}

	return data;
}

export async function getVpsDocument(documentPath) {
	const encodedPath = String(documentPath || "")
		.split("/")
		.map(encodeURIComponent)
		.join("/");
	const response = await requestVpsApi(`/documents/${encodedPath}`);
	return response?.data ? { id: response.documentId, ...response.data } : null;
}

export async function listVpsDocuments(
	collectionPath,
	{ limit = 100, offset = 0 } = {},
) {
	const params = new URLSearchParams({
		collection: collectionPath,
		limit: String(limit),
		offset: String(offset),
	});
	const response = await requestVpsApi(`/documents?${params.toString()}`);
	return (response?.items || []).map((item) => ({
		id: item.documentId,
		...item.data,
	}));
}

export async function listAllVpsDocuments(
	collectionPath,
	{ pageSize = 1000, max = Infinity } = {},
) {
	const items = [];
	let offset = 0;

	while (items.length < max) {
		const page = await listVpsDocuments(collectionPath, {
			limit: Number.isFinite(max)
				? Math.min(pageSize, max - items.length)
				: pageSize,
			offset,
		});

		items.push(...page);
		if (page.length < pageSize) break;
		offset += page.length;
	}

	return items;
}

export async function createVpsDocument(
	collectionPath,
	data,
	documentId = null,
) {
	const response = await requestVpsApi("/admin/documents", {
		method: "POST",
		body: JSON.stringify({
			collectionPath,
			documentId,
			data,
		}),
	});

	return {
		id: response?.documentId,
		path: response?.path,
	};
}

export async function setVpsDocument(documentPath, data) {
	const encodedPath = String(documentPath || "")
		.split("/")
		.map(encodeURIComponent)
		.join("/");
	const response = await requestVpsApi(`/admin/documents/${encodedPath}`, {
		method: "PUT",
		body: JSON.stringify(data || {}),
	});

	return {
		id: response?.documentId,
		path: response?.path,
	};
}

export async function updateVpsDocument(documentPath, data) {
	const current = await getVpsDocument(documentPath).catch(() => null);
	const { id: _id, ...currentData } = current || {};
	return setVpsDocument(documentPath, {
		...currentData,
		...(data || {}),
	});
}

export async function deleteVpsDocument(documentPath) {
	const encodedPath = String(documentPath || "")
		.split("/")
		.map(encodeURIComponent)
		.join("/");
	await requestVpsApi(`/admin/documents/${encodedPath}`, {
		method: "DELETE",
	});
}

export async function listPublicVpsDocuments(
	collectionPath,
	{ limit = 100, offset = 0 } = {},
) {
	const params = new URLSearchParams({
		collection: collectionPath,
		limit: String(limit),
		offset: String(offset),
	});
	const response = await fetch(
		`${getApiBaseUrl()}/public/documents?${params.toString()}`,
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
		},
	);

	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}

	if (!response.ok) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}

	return (data?.items || []).map((item) => ({
		id: item.documentId,
		...item.data,
	}));
}

export async function getPublicVpsDocument(documentPath) {
	const encodedPath = String(documentPath || "")
		.split("/")
		.map(encodeURIComponent)
		.join("/");
	const response = await fetch(
		`${getApiBaseUrl()}/public/documents/${encodedPath}`,
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
		},
	);

	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}

	if (!response.ok) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}

	return data?.data ? { id: data.documentId, ...data.data } : null;
}

export async function listAllPublicVpsDocuments(
	collectionPath,
	{ pageSize = 1000, max = Infinity } = {},
) {
	const items = [];
	let offset = 0;

	while (items.length < max) {
		const page = await listPublicVpsDocuments(collectionPath, {
			limit: Number.isFinite(max)
				? Math.min(pageSize, max - items.length)
				: pageSize,
			offset,
		});

		items.push(...page);
		if (page.length < pageSize) break;
		offset += page.length;
	}

	return items;
}

export async function getVpsStaticSnapshot(domain) {
	const response = await fetch(
		`${getApiBaseUrl()}/public/static/${encodeURIComponent(domain)}`,
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
		},
	);

	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}

	if (!response.ok) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}

	return data;
}
