import { fetchRotOauthConfig, saveRotOauthConfig } from "../../../api/rotApi";

export async function criarUsuarioAdmin() {
	throw new Error("Criação de usuário pela empresa ainda deve ser feita em Sistema > Usuários.");
}

// Antes isso gravava em localStorage (apenas no navegador de quem
// mexesse, nunca chegava no backend) — o toggle "Ativo" parecia salvar,
// mas o LoginScreen (que le a config real via GET /api/auth/google/config)
// nunca via a mudanca. Agora usa a mesma rota /api/admin/oauth/:provider
// (rot_settings) que o backend ja expunha.
export async function obterConfigGoogleOAuthAdmin() {
	return fetchRotOauthConfig("google");
}

export async function salvarConfigGoogleOAuthAdmin(config) {
	return saveRotOauthConfig("google", config);
}

export async function obterConfigOktaOAuthAdmin() {
	return fetchRotOauthConfig("okta");
}

export async function salvarConfigOktaOAuthAdmin(config) {
	return saveRotOauthConfig("okta", config);
}
