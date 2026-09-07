export const FINAN_WELCOME_MODAL_EVENT = "finan:welcome-modal-open";
export const FINAN_WELCOME_MODAL_VERSION = "2026-09-boas-vindas-finan-v3";
export const FINAN_WELCOME_MODAL_IMAGE = "/finan-boas-vindas.jpg";

function getUserKey(user = {}) {
	return user?.uid || user?.id || user?.email || "";
}

export function getFinanWelcomeStorageKey(user = {}) {
	const userKey = getUserKey(user);
	if (!userKey) return "";
	return `finan:welcome-modal:${FINAN_WELCOME_MODAL_VERSION}:${userKey}`;
}

export function hasSeenFinanWelcomeModal(user = {}) {
	const storageKey = getFinanWelcomeStorageKey(user);
	if (!storageKey) return true;
	try {
		return window.localStorage.getItem(storageKey) === "true";
	} catch {
		return false;
	}
}

export function markFinanWelcomeModalSeen(user = {}) {
	const storageKey = getFinanWelcomeStorageKey(user);
	if (!storageKey) return;
	try {
		window.localStorage.setItem(storageKey, "true");
	} catch {
		// Em navegador restrito, o modal pode aparecer novamente sem quebrar o acesso.
	}
}
