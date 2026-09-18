export async function criarUsuarioAdmin() {
	throw new Error("Criação de usuário pela empresa ainda deve ser feita em Sistema > Usuários.");
}

const DEFAULT_GOOGLE = {
	enabled: false,
	clientId: "",
	allowedDomains: "",
	autoProvision: false,
};

const DEFAULT_OKTA = {
	enabled: false,
	issuer: "",
	clientId: "",
	redirectUri: "",
	allowedDomains: "",
	autoProvision: false,
};

function readLocalConfig(key, fallback) {
	try {
		return JSON.parse(localStorage.getItem(key) || "null") || fallback;
	} catch {
		return fallback;
	}
}

function saveLocalConfig(key, value) {
	localStorage.setItem(key, JSON.stringify(value || {}));
	return value || {};
}

export async function obterConfigGoogleOAuthAdmin() {
	return readLocalConfig("operacao_google_oauth_config", DEFAULT_GOOGLE);
}

export async function salvarConfigGoogleOAuthAdmin(config) {
	return saveLocalConfig("operacao_google_oauth_config", { ...DEFAULT_GOOGLE, ...(config || {}) });
}

export async function obterConfigOktaOAuthAdmin() {
	return readLocalConfig("operacao_okta_oauth_config", DEFAULT_OKTA);
}

export async function salvarConfigOktaOAuthAdmin(config) {
	return saveLocalConfig("operacao_okta_oauth_config", { ...DEFAULT_OKTA, ...(config || {}) });
}
