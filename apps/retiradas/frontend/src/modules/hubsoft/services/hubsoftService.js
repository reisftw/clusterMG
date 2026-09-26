import { requestVpsApi } from "../../../services/vpsApiClient";

export const DEFAULT_HUBSOFT_CONFIG = {
	enabled: false,
	useHubsoftAsSource: false,
	baseUrl: "",
	clientId: "",
	clientSecret: "",
	username: "",
	password: "",
	webBaseUrl: "https://sempre.hubsoft.com.br",
	webUsername: "",
	webPassword: "",
	grantType: "password",
	syncMode: "preview",
	syncBusca: "numero_ordem_servico",
	syncTermos: [],
	syncStatuses: ["pendente", "aguardando_agendamento"],
	syncFontes: ["sempre", "onnet"],
	syncLimit: 50,
	syncMatchEnabled: true,
};

export async function buscarConfigHubsoft() {
	return requestVpsApi("/admin/hubsoft/config");
}

export async function salvarConfigHubsoft(config) {
	return requestVpsApi("/admin/hubsoft/config", {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function testarConexaoHubsoft() {
	return requestVpsApi("/admin/hubsoft/test", {
		method: "POST",
		body: JSON.stringify({}),
	});
}

export async function associarHubsoft() {
	return requestVpsApi("/admin/hubsoft/associate", {
		method: "POST",
		body: JSON.stringify({}),
	});
}

export async function consultarOrdensHubsoft(params = {}) {
	const searchParams = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim() !== "") {
			searchParams.set(key, String(value));
		}
	});
	return requestVpsApi(
		`/admin/hubsoft/ordens-servico?${searchParams.toString()}`,
	);
}

export async function iniciarSyncHubsoft(payload = {}) {
	return requestVpsApi("/admin/hubsoft/sync", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function buscarJobSyncHubsoft(jobId) {
	return requestVpsApi(`/admin/hubsoft/sync/jobs/${encodeURIComponent(jobId)}`);
}

export async function buscarHistoricoSyncHubsoft(limit = 10) {
	return requestVpsApi(
		`/admin/hubsoft/sync/runs?limit=${encodeURIComponent(limit)}`,
	);
}

export async function buscarProfilesHubsoft() {
	return requestVpsApi("/admin/hubsoft/profiles");
}

export async function buscarRunsProfilesHubsoft(params = {}) {
	const searchParams = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim() !== "") {
			searchParams.set(key, String(value));
		}
	});
	return requestVpsApi(
		`/admin/hubsoft/profiles/runs?${searchParams.toString()}`,
	);
}

export async function executarProfileHubsoft(profile, payload = {}) {
	return requestVpsApi(
		`/admin/hubsoft/profiles/${encodeURIComponent(profile)}/run`,
		{
			method: "POST",
			body: JSON.stringify(payload || {}),
		},
	);
}

export async function buscarRegistrosHubsoft(params = {}) {
	const searchParams = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim() !== "") {
			searchParams.set(key, String(value));
		}
	});
	return requestVpsApi(`/admin/hubsoft/records?${searchParams.toString()}`);
}

export async function buscarTecnicosRetiradaHubsoft() {
	return requestVpsApi("/admin/hubsoft/withdrawal-technicians");
}

export async function descobrirTecnicosRetiradaHubsoft() {
	return requestVpsApi("/admin/hubsoft/withdrawal-technicians/discover", {
		method: "POST",
		body: JSON.stringify({}),
	});
}
