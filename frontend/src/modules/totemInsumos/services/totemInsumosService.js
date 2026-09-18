import { getApiBaseUrl } from "../../../services/vpsApiClient";

async function parseJson(response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

async function requestTotem(path, { token = "", ...options } = {}) {
	const response = await fetch(`${getApiBaseUrl()}${path}`, {
		...options,
		cache: "no-store",
		credentials: "omit",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers || {}),
		},
	});
	const data = await parseJson(response);
	if (!response.ok) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

export function normalizeTotemEmail(value = "") {
	return String(value || "").trim().toLowerCase();
}

export function isBrasilTecparEmail(value = "") {
	const normalized = normalizeTotemEmail(value);
	const parts = normalized.split("@");
	return parts.length === 2 && parts[0] && parts[1] === "brasiltecpar.com.br";
}

export async function solicitarTotemOtp(email) {
	return requestTotem("/totem/otp/request", {
		method: "POST",
		body: JSON.stringify({ email: normalizeTotemEmail(email) }),
	});
}

export async function validarTotemOtp({ email, code, kioskId = "TOTEM-001" }) {
	return requestTotem("/totem/otp/verify", {
		method: "POST",
		body: JSON.stringify({
			email: normalizeTotemEmail(email),
			code: String(code || "").replace(/\D/g, ""),
			kioskId,
		}),
	});
}

export async function carregarTotemInsumos(token) {
	return requestTotem("/totem/insumos", { token });
}

export async function criarTotemRequisicoes({ token, items }) {
	return requestTotem("/totem/requisicoes", {
		token,
		method: "POST",
		body: JSON.stringify({ items }),
	});
}

export async function encerrarTotemSessao({ token, reason = "finished" }) {
	if (!token) return { ok: true };
	return requestTotem("/totem/session/end", {
		token,
		method: "POST",
		body: JSON.stringify({ reason }),
	}).catch(() => ({ ok: false }));
}
