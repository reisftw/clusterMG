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
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
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
