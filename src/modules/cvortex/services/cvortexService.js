import { getApiBaseUrl, requestVpsApi } from "../../../services/vpsApiClient";

export const DEFAULT_CVORTEX_CONFIG = {
	enabled: false,
	useCvortexForMessaging: false,
	baseUrl: "",
	apiToken: "",
	accountId: "",
	inboxId: "",
	sendEndpoint: "",
	statusEndpoint: "",
	webhookSecret: "",
	defaultFrom: "",
	notes: "",
	lastValidatedAt: "",
	lastError: "",
	associationStartedAt: "",
	associationStartedBy: "",
};

export function getCvortexWebhookUrl(secret = "") {
	const baseUrl = getApiBaseUrl().replace(/\/+$/, "");
	const query = secret ? `?secret=${encodeURIComponent(secret)}` : "";
	return `${baseUrl}/webhooks/cvortex${query}`;
}

export async function buscarConfigCvortex() {
	return requestVpsApi("/admin/cvortex/config");
}

export async function salvarConfigCvortex(config) {
	return requestVpsApi("/admin/cvortex/config", {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function testarConexaoCvortex() {
	return requestVpsApi("/admin/cvortex/test", {
		method: "POST",
		body: JSON.stringify({}),
	});
}

export async function enviarTesteCvortex(payload = {}) {
	return requestVpsApi("/admin/cvortex/send-test", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function associarCvortex() {
	return requestVpsApi("/admin/cvortex/associate", {
		method: "POST",
		body: JSON.stringify({}),
	});
}
