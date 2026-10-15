import { getApiBaseUrl } from "../../../services/vpsApiClient";

async function request(path, options = {}) {
	const response = await fetch(`${getApiBaseUrl()}/mercado/${path}`, {
		credentials: "include",
		cache: "no-store",
		headers: { "Content-Type": "application/json", ...(options.headers || {}) },
		...options,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok) throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	return data;
}
export const mercadoProviderApi = {
	login: (email, password) => request("auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
	me: () => request("auth/me"),
	logout: () => request("auth/logout", { method: "POST" }),
	recover: (email) => request("auth/password-recovery", { method: "POST", body: JSON.stringify({ email }) }),
	reset: (token, password) => request("auth/password-reset", { method: "POST", body: JSON.stringify({ token, password }) }),
	register: (payload) => request("auth/register", { method: "POST", body: JSON.stringify(payload) }),
	verifyEmail: (token) => request("auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
	resendVerification: (email) => request("auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }),
	lookupCep: (cep) => request(`onboarding/cep/${encodeURIComponent(cep)}`),
	profile: () => request("onboarding/profile"),
	uploadDocument: async (tipo, file) => {
		const body = new FormData(); body.append("tipo", tipo); body.append("file", file);
		const response = await fetch(`${getApiBaseUrl()}/mercado/onboarding/documents`, { method: "POST", credentials: "include", body });
		const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.error || `Erro HTTP ${response.status}.`); return data;
	},
	dashboard: (q = "") => request(`provider/dashboard${q ? `?q=${encodeURIComponent(q)}` : ""}`),
	cidades: (q = "") => request(`provider/cidades${q ? `?q=${encodeURIComponent(q)}` : ""}`),
	lotes: () => request("provider/lotes"),
	lote: (id) => request(`provider/lotes/${encodeURIComponent(id)}`),
	preview: (payload) => request("provider/montagem/preview", { method: "POST", body: JSON.stringify(payload) }),
	confirmar: (payload) => request("provider/montagem/confirmar", { method: "POST", body: JSON.stringify(payload) }),
};
