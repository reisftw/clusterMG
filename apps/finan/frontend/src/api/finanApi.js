const TOKEN_KEY = "finan-auth-token";

export function getFinanToken() {
	return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function setFinanToken(token) {
	if (token) window.localStorage.setItem(TOKEN_KEY, token);
	else window.localStorage.removeItem(TOKEN_KEY);
}

export async function requestFinanApi(path, options = {}) {
	const token = getFinanToken();
	const response = await fetch(`/api/finan${path}`, {
		...options,
		cache: "no-store",
		headers: {
			"Content-Type": "application/json",
			...(options.headers || {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

export async function requestFinanFinanceiroApi(path, options = {}) {
	const token = getFinanToken();
	const response = await fetch(`/api/financeiro${path}`, {
		...options,
		cache: "no-store",
		headers: {
			"Content-Type": "application/json",
			...(options.headers || {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data;
}

export async function loginFinan(email, password) {
	const data = await requestFinanApi("/auth/login", {
		method: "POST",
		body: JSON.stringify({ email, password }),
	});
	if (data.mfaRequired) return data;
	setFinanToken(data.token);
	return { user: data.user };
}

export async function verifyFinanEmailMfa(challengeId, code) {
	const data = await requestFinanApi("/auth/mfa/email/verify", {
		method: "POST",
		body: JSON.stringify({ challengeId, code }),
	});
	setFinanToken(data.token);
	return { user: data.user };
}

export async function requestFinanPasswordReset(email) {
	return requestFinanApi("/auth/password/forgot", {
		method: "POST",
		body: JSON.stringify({ email }),
	});
}

export async function resetFinanPassword(token, password) {
	return requestFinanApi("/auth/password/reset", {
		method: "POST",
		body: JSON.stringify({ token, password }),
	});
}

export async function fetchFinanMe() {
	const data = await requestFinanApi("/auth/me");
	return data.user;
}

export async function logoutFinan() {
	try {
		await requestFinanApi("/auth/logout", { method: "POST" });
	} finally {
		setFinanToken("");
	}
}

export async function fetchFinanPinStatus() {
	const data = await requestFinanApi("/auth/pin/status");
	return {
		configured: Boolean(data.configured),
		idleTimeoutMinutes: Number(data.idleTimeoutMinutes) || 20,
	};
}

export async function setupFinanPin({ pin, secretWord, currentPin }) {
	return requestFinanApi("/auth/pin/setup", {
		method: "POST",
		body: JSON.stringify({ pin, secretWord, currentPin }),
	});
}

export async function verifyFinanPin(pin) {
	return requestFinanApi("/auth/pin/verify", {
		method: "POST",
		body: JSON.stringify({ pin }),
	});
}

export async function requestFinanPinRecovery(email) {
	return requestFinanApi("/auth/pin/recover/request", {
		method: "POST",
		body: JSON.stringify({ email }),
	});
}

export async function confirmFinanPinRecovery({ token, secretWord, newPin }) {
	return requestFinanApi("/auth/pin/recover/confirm", {
		method: "POST",
		body: JSON.stringify({ token, secretWord, newPin }),
	});
}

export async function changeFinanPassword({ currentPassword, newPassword }) {
	return requestFinanApi("/auth/password/change", {
		method: "POST",
		body: JSON.stringify({ currentPassword, newPassword }),
	});
}

export async function uploadFinanOwnAvatar(file) {
	const token = getFinanToken();
	const formData = new FormData();
	formData.append("avatar", file);
	const response = await fetch("/api/finan/auth/avatar", {
		method: "POST",
		cache: "no-store",
		headers: token ? { Authorization: `Bearer ${token}` } : undefined,
		body: formData,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data.avatarUrl;
}

export async function fetchFinanCalendarEvents({ from, to } = {}) {
	const params = new URLSearchParams();
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	const query = params.toString();
	const data = await requestFinanApi(`/calendario-financeiro${query ? `?${query}` : ""}`);
	return data.events || [];
}

export async function createFinanCalendarEvent(payload) {
	const data = await requestFinanApi("/calendario-financeiro", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.event;
}

export async function updateFinanCalendarEvent(id, payload) {
	const data = await requestFinanApi(`/calendario-financeiro/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.event;
}

export async function deleteFinanCalendarEvent(id) {
	return requestFinanApi(`/calendario-financeiro/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanCalendarCatalog(kind) {
	const data = await requestFinanApi(`/calendario-financeiro/config/${kind}`);
	return data.items || [];
}

export async function createFinanCalendarCatalogItem(kind, payload) {
	const data = await requestFinanApi(`/calendario-financeiro/config/${kind}`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.item;
}

export async function deleteFinanCalendarCatalogItem(kind, id) {
	return requestFinanApi(`/calendario-financeiro/config/${kind}/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanCalendarHolidays({ from, to, city } = {}) {
	const params = new URLSearchParams();
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	if (city) params.set("city", city);
	const query = params.toString();
	const data = await requestFinanApi(`/calendario-financeiro/feriados${query ? `?${query}` : ""}`);
	return data.holidays || [];
}

export async function createFinanCalendarHoliday(payload) {
	const data = await requestFinanApi("/calendario-financeiro/feriados", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.holiday;
}

export async function deleteFinanCalendarHoliday(id) {
	return requestFinanApi(`/calendario-financeiro/feriados/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanCalendarRules() {
	const data = await requestFinanApi("/calendario-financeiro/regras");
	return data.rules || [];
}

export async function createFinanCalendarRule(payload) {
	const data = await requestFinanApi("/calendario-financeiro/regras", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.rule;
}

export async function updateFinanCalendarRule(id, payload) {
	const data = await requestFinanApi(`/calendario-financeiro/regras/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.rule;
}

export async function deleteFinanCalendarRule(id) {
	return requestFinanApi(`/calendario-financeiro/regras/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanPushVapidPublicKey() {
	const data = await requestFinanApi("/push/vapid-public-key");
	return { enabled: Boolean(data.enabled), publicKey: data.publicKey || "" };
}

export async function fetchFinanPushStatus() {
	const data = await requestFinanApi("/push/status");
	return { enabled: Boolean(data.enabled), subscribed: Boolean(data.subscribed) };
}

export async function subscribeFinanPush(subscription) {
	return requestFinanApi("/push/subscribe", {
		method: "POST",
		body: JSON.stringify({ subscription }),
	});
}

export async function unsubscribeFinanPush(endpoint) {
	return requestFinanApi("/push/unsubscribe", {
		method: "POST",
		body: JSON.stringify({ endpoint }),
	});
}

export async function fetchFinanPinManageableUsers() {
	const data = await requestFinanApi("/pin-admin/users");
	return data.users || [];
}

export async function unlockFinanUserPin(userId) {
	return requestFinanApi(`/pin-admin/${encodeURIComponent(userId)}/unlock`, {
		method: "POST",
	});
}

export async function resetFinanUserPin(userId) {
	return requestFinanApi(`/pin-admin/${encodeURIComponent(userId)}/reset`, {
		method: "POST",
	});
}

export async function fetchFinanUsers() {
	const data = await requestFinanApi("/usuarios");
	return data.users || [];
}

export async function fetchFinanRoles() {
	const data = await requestFinanApi("/usuarios/roles");
	return data.roles || [];
}

export async function createFinanRole(payload) {
	const data = await requestFinanApi("/usuarios/roles", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.role;
}

export async function updateFinanRole(id, payload) {
	const data = await requestFinanApi(`/usuarios/roles/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.role;
}

export async function updateFinanUser(id, payload) {
	const data = await requestFinanApi(`/usuarios/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.user;
}

export async function fetchFinanSettingsSummary() {
	const data = await requestFinanApi("/configuracoes/summary");
	return data.summary || {};
}

export async function fetchFinanSettingSection(section) {
	const data = await requestFinanApi(`/configuracoes/section/${encodeURIComponent(section)}`);
	return data;
}

export async function saveFinanSettingSection(section, value) {
	const data = await requestFinanApi(`/configuracoes/section/${encodeURIComponent(section)}`, {
		method: "PUT",
		body: JSON.stringify({ value }),
	});
	return data.setting;
}

export async function fetchFinanDatabaseStatus() {
	const data = await requestFinanApi("/configuracoes/database");
	return data;
}

export async function fetchFinanAuditLogs() {
	const data = await requestFinanApi("/configuracoes/audit-logs");
	return data.logs || [];
}

export async function fetchFinanIntegrations() {
	const data = await requestFinanApi("/integracoes");
	return data.integracoes || [];
}

export async function fetchFinanIntegration(provider) {
	const data = await requestFinanApi(`/integracoes/${encodeURIComponent(provider)}`);
	return data.integracao;
}

export async function saveFinanIntegration(provider, payload) {
	const data = await requestFinanApi(`/integracoes/${encodeURIComponent(provider)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.integracao;
}
