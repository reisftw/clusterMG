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
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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
      token: session.token || "",
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
        csrfToken: session.csrfToken || readCookie(CSRF_COOKIE_NAME) || currentSession?.csrfToken || "",
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
  if (shouldNotify) notify();
}

export function clearVpsAuthSession() {
  currentSession = null;
  writeStoredSession(null);
  notify();
}

export function subscribeToVpsAuthSession(callback) {
  listeners.add(callback);
  callback(currentSession?.user || null);
  return () => listeners.delete(callback);
}
