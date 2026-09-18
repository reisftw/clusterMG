export const WELCOME_MODAL_EVENT = "retiradas:welcome-modal-open";
export const WELCOME_MODAL_VERSION = "2026-09-boas-vindas";
export const WELCOME_MODAL_IMAGE = "/boas-vindas.jpeg";

function getUserKey(user = {}) {
	return user?.uid || user?.id || user?.email || "";
}

export function getWelcomeStorageKey(user = {}) {
	const userKey = getUserKey(user);
	if (!userKey) return "";
	return `retiradas:welcome-modal:${WELCOME_MODAL_VERSION}:${userKey}`;
}

export function hasSeenWelcomeModal(user = {}) {
	const storageKey = getWelcomeStorageKey(user);
	if (!storageKey) return true;
	try {
		return window.localStorage.getItem(storageKey) === "true";
	} catch {
		return false;
	}
}

export function markWelcomeModalSeen(user = {}) {
	const storageKey = getWelcomeStorageKey(user);
	if (!storageKey) return;
	try {
		window.localStorage.setItem(storageKey, "true");
	} catch {
		// Em navegador restrito, o modal pode aparecer novamente sem quebrar login.
	}
}
