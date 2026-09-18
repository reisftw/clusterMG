import { clearErrorTrackingUser, setErrorTrackingUser } from "./errorTracking";

const SESSION_STORAGE_KEY = "retiradas_vps_auth_session_v1";
const CSRF_COOKIE_NAME = "retiradas_csrf";

let currentSession = readStoredSession();
const listeners = new Set();

function readCookie(name) {
	if (typeof document === "undefined") return "";
	const prefix = `${name}=`;
	const value = document.cookie
		.split(";")
		.map((item) => item.trim())
		.find((item) => item.startsWith(prefix));
	if (!value) return "";
	try {
		return decodeURIComponent(value.slice(prefix.length));
	} catch {
		return value.slice(prefix.length);
	}
}

function readStoredSession() {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		// SEC-001 cleanup: sessoes salvas antes desta correcao ainda tem um
		// campo "token" gravado no localStorage. Remove na primeira leitura
		// em vez de esperar o proximo login/refresh.
		if (parsed && Object.prototype.hasOwnProperty.call(parsed, "token")) {
			const { token: _legacyToken, ...rest } = parsed;
			window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(rest));
			return rest;
		}
		return parsed;
	} catch {
		return null;
	}
}

// SEC-001: o token JWT nunca vai pro localStorage. O cookie HttpOnly
// (setado pelo backend em /login e /refresh) e a unica fonte de verdade
// da sessao; o token so existe em memoria (currentSession.token) durante
// o tempo de vida da aba, pro Authorization header de compatibilidade —
// um XSS nao ganha mais nada lendo localStorage, so alcancava esse token
// antes por ele estar duplicado aqui ao lado do cookie protegido.
function writeStoredSession(session) {
	if (typeof window === "undefined") return;
	if (!session?.user) {
		window.localStorage.removeItem(SESSION_STORAGE_KEY);
		return;
	}
	window.localStorage.setItem(
		SESSION_STORAGE_KEY,
		JSON.stringify({
			csrfToken: session.csrfToken || "",
			user: session.user,
		}),
	);
}

function notify() {
	for (const listener of listeners) {
		listener(currentSession?.user || null);
	}
}

function areSessionsEqual(a, b) {
	if (!a && !b) return true;
	if (!a || !b) return false;
	if (a.csrfToken !== b.csrfToken) return false;
	if (a.token !== b.token) return false;
	try {
		return JSON.stringify(a.user || null) === JSON.stringify(b.user || null);
	} catch {
		return a.user === b.user;
	}
}

function areSessionIdentitiesEqual(a, b) {
	if (!a && !b) return true;
	if (!a || !b) return false;
	if (a.token !== b.token) return false;
	try {
		return JSON.stringify(a.user || null) === JSON.stringify(b.user || null);
	} catch {
		return a.user === b.user;
	}
}

export function getVpsAuthSession() {
	return currentSession;
}

export function getVpsAuthToken() {
	return currentSession?.token || "";
}

export function getVpsCsrfToken() {
	return currentSession?.csrfToken || readCookie(CSRF_COOKIE_NAME) || "";
}

export function setVpsAuthSession(session) {
	const nextSession = session?.user
		? {
				csrfToken:
					session.csrfToken ||
					readCookie(CSRF_COOKIE_NAME) ||
					currentSession?.csrfToken ||
					"",
				token: session.token || "",
				user: session.user,
			}
		: null;

	if (areSessionsEqual(currentSession, nextSession)) {
		return;
	}

	const shouldNotify = !areSessionIdentitiesEqual(currentSession, nextSession);
	currentSession = nextSession;
	writeStoredSession(currentSession);
	setErrorTrackingUser(currentSession?.user || null);
	if (shouldNotify) notify();
}

export function clearVpsAuthSession() {
	currentSession = null;
	writeStoredSession(null);
	clearErrorTrackingUser();
	notify();
}

export function subscribeToVpsAuthSession(callback) {
	listeners.add(callback);
	callback(currentSession?.user || null);
	return () => listeners.delete(callback);
}
