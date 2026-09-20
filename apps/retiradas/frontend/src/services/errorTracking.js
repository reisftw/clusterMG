import * as Sentry from "@sentry/react";

const SENSITIVE_KEY_PATTERN =
	/(authorization|token|password|senha|secret|csrf|cookie|api[-_]?key)/i;
const PII_KEY_PATTERN = /(email|telefone|phone|cpf|cnpj|documento|nome|name)/i;

function maskValue(value) {
	if (value === undefined || value === null) return value;
	return "[Filtered]";
}

function scrubObject(value, depth = 0) {
	if (!value || typeof value !== "object" || depth > 4) return value;
	if (Array.isArray(value))
		return value.map((item) => scrubObject(item, depth + 1));

	return Object.entries(value).reduce((acc, [key, item]) => {
		if (SENSITIVE_KEY_PATTERN.test(key) || PII_KEY_PATTERN.test(key)) {
			acc[key] = maskValue(item);
			return acc;
		}
		acc[key] = scrubObject(item, depth + 1);
		return acc;
	}, {});
}

function anonymizeUser(user) {
	const id = user?.uid || user?.id || user?.email || "";
	if (!id) return null;
	let hash = 0;
	for (let index = 0; index < String(id).length; index += 1) {
		hash = Math.trunc(hash * 31 + String(id).charCodeAt(index));
	}
	return {
		id: `u_${Math.abs(hash).toString(36)}`,
		role: user?.role || user?.perfil || "unknown",
	};
}

export function sanitizeSentryEvent(event) {
	const nextEvent = scrubObject(event);
	if (nextEvent?.request?.headers)
		nextEvent.request.headers = scrubObject(nextEvent.request.headers);
	if (nextEvent?.request?.cookies) nextEvent.request.cookies = "[Filtered]";
	if (nextEvent?.user) nextEvent.user = anonymizeUser(nextEvent.user);
	return nextEvent;
}

export function initErrorTracking() {
	const dsn = import.meta.env.VITE_SENTRY_DSN;
	if (!dsn) return false;

	const integrations = [];
	if (
		String(import.meta.env.VITE_SENTRY_REPLAY_ENABLED || "").toLowerCase() ===
		"true"
	) {
		integrations.push(
			Sentry.replayIntegration({
				maskAllText: true,
				blockAllMedia: true,
			}),
		);
	}

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		release: import.meta.env.VITE_APP_VERSION || undefined,
		integrations,
		tracesSampleRate: Number(
			import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0,
		),
		replaysSessionSampleRate: Number(
			import.meta.env.VITE_SENTRY_REPLAY_SAMPLE_RATE || 0,
		),
		replaysOnErrorSampleRate: Number(
			import.meta.env.VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE || 0,
		),
		beforeSend: sanitizeSentryEvent,
	});

	return true;
}

export function setErrorTrackingUser(user) {
	if (!import.meta.env.VITE_SENTRY_DSN) return;
	Sentry.setUser(anonymizeUser(user));
}

export function clearErrorTrackingUser() {
	if (!import.meta.env.VITE_SENTRY_DSN) return;
	Sentry.setUser(null);
}

export function captureApiError({ path, method, status, message }) {
	if (!import.meta.env.VITE_SENTRY_DSN) return;
	Sentry.captureException(new Error(message || `Erro HTTP ${status || ""}`), {
		tags: {
			feature: "api",
			httpStatus: String(status || ""),
			method: String(method || "GET").toUpperCase(),
		},
		extra: {
			path,
		},
	});
}

export function captureFrontendError(error, context = {}) {
	if (!import.meta.env.VITE_SENTRY_DSN) return;
	Sentry.captureException(error, { extra: scrubObject(context) });
}
