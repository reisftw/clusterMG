import { requestRotApi } from "../api/rotApi";

export function isVpsBackendEnabled() {
	return true;
}

export function getApiBaseUrl() {
	if (typeof window === "undefined") return "/api";
	return `${window.location.origin}/api`;
}

async function parseJsonResponse(response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function encodeDocumentPath(documentPath) {
	return String(documentPath || "").split("/").map(encodeURIComponent).join("/");
}

function normalizePath(path) {
	if (path === "/admin/api-status") return "/health/status";
	if (path === "/admin/oauth/google") return "/admin/oauth/google";
	if (path === "/admin/oauth/okta") return "/admin/oauth/okta";
	return path;
}

export async function requestVpsApi(path, options = {}) {
	const normalized = normalizePath(path);
	const response = await fetch(`/api${normalized}`, {
		...options,
		cache: options.cache || "no-store",
		credentials: "include",
		headers: {
			...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
			"X-Requested-With": "XMLHttpRequest",
			...(options.headers || {}),
		},
	});
	const data = await parseJsonResponse(response);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

export async function getVpsDocument(documentPath) {
	const response = await requestVpsApi(`/documents/${encodeDocumentPath(documentPath)}`);
	return response?.data ? { ...response.data, id: response.documentId } : null;
}

export async function listVpsDocuments(collectionPath, { limit = 100, offset = 0 } = {}) {
	const params = new URLSearchParams({
		collection: collectionPath,
		limit: String(limit),
		offset: String(offset),
	});
	const response = await requestVpsApi(`/documents?${params.toString()}`);
	return (response?.items || []).map((item) => ({ ...(item.data || {}), id: item.documentId }));
}

export async function listAllVpsDocuments(collectionPath, { pageSize = 1000, max = Infinity } = {}) {
	const items = [];
	let offset = 0;
	while (items.length < max) {
		const page = await listVpsDocuments(collectionPath, {
			limit: Number.isFinite(max) ? Math.min(pageSize, max - items.length) : pageSize,
			offset,
		});
		items.push(...page);
		if (page.length < pageSize) break;
		offset += page.length;
	}
	return items;
}

export async function createVpsDocument(collectionPath, data, documentId = null) {
	const response = await requestRotApi("/admin/documents", {
		method: "POST",
		body: JSON.stringify({ collectionPath, documentId, data }),
	});
	return { id: response?.documentId, path: response?.path };
}

export async function setVpsDocument(documentPath, data) {
	const response = await requestRotApi(`/admin/documents/${encodeDocumentPath(documentPath)}`, {
		method: "PUT",
		body: JSON.stringify(data || {}),
	});
	return { id: response?.documentId, path: response?.path };
}

export async function updateVpsDocument(documentPath, data) {
	const current = await getVpsDocument(documentPath).catch(() => null);
	const { id: _id, ...currentData } = current || {};
	return setVpsDocument(documentPath, { ...currentData, ...(data || {}) });
}

export async function deleteVpsDocument(documentPath) {
	await requestRotApi(`/admin/documents/${encodeDocumentPath(documentPath)}`, { method: "DELETE" });
}
