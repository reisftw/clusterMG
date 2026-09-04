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

export async function loginFinan(email, password) {
	const data = await requestFinanApi("/auth/login", {
		method: "POST",
		body: JSON.stringify({ email, password }),
	});
	setFinanToken(data.token);
	return data.user;
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
