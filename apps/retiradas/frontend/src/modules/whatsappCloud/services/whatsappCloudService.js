import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/admin/whatsapp-cloud";

function withQuery(path, params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") {
			query.set(key, String(value));
		}
	});
	const suffix = query.toString();
	return suffix ? `${path}?${suffix}` : path;
}

export const whatsappCloudApi = {
	overview: () => requestVpsApi(`${BASE_PATH}/overview`),
	config: () => requestVpsApi(`${BASE_PATH}/config`),
	saveConfig: (payload) =>
		requestVpsApi(`${BASE_PATH}/config`, {
			method: "PUT",
			body: JSON.stringify(payload || {}),
		}),
	generateVerifyToken: () =>
		requestVpsApi(`${BASE_PATH}/verify-token`, {
			method: "POST",
			body: JSON.stringify({}),
		}),
	saveSecrets: (payload) =>
		requestVpsApi(`${BASE_PATH}/secrets`, {
			method: "PUT",
			body: JSON.stringify(payload || {}),
		}),
	deleteSecret: (name) =>
		requestVpsApi(`${BASE_PATH}/secrets/${encodeURIComponent(name)}`, {
			method: "DELETE",
		}),
	diagnostics: () =>
		requestVpsApi(`${BASE_PATH}/diagnostics`, {
			method: "POST",
			body: JSON.stringify({}),
		}),
	recipients: () => requestVpsApi(`${BASE_PATH}/recipients`),
	addRecipient: (payload) =>
		requestVpsApi(`${BASE_PATH}/recipients`, {
			method: "POST",
			body: JSON.stringify(payload || {}),
		}),
	revokeRecipient: (id) =>
		requestVpsApi(`${BASE_PATH}/recipients/${encodeURIComponent(id)}`, {
			method: "DELETE",
		}),
	templates: () => requestVpsApi(`${BASE_PATH}/templates`),
	syncTemplates: () =>
		requestVpsApi(`${BASE_PATH}/templates/sync`, {
			method: "POST",
			body: JSON.stringify({}),
		}),
	tests: (params) => requestVpsApi(withQuery(`${BASE_PATH}/tests`, params)),
	sendTest: (payload) =>
		requestVpsApi(`${BASE_PATH}/tests/send`, {
			method: "POST",
			body: JSON.stringify(payload || {}),
		}),
	testFlows: () => requestVpsApi(`${BASE_PATH}/tests/flows`),
	startTestFlow: (payload) =>
		requestVpsApi(`${BASE_PATH}/tests/flows/start`, {
			method: "POST",
			body: JSON.stringify(payload || {}),
		}),
	webhooks: (params) =>
		requestVpsApi(withQuery(`${BASE_PATH}/webhooks`, params)),
	readiness: () => requestVpsApi(`${BASE_PATH}/activation/readiness`),
	activate: (reason) =>
		requestVpsApi(`${BASE_PATH}/activation`, {
			method: "POST",
			body: JSON.stringify({ reason }),
		}),
	rollback: (reason) =>
		requestVpsApi(`${BASE_PATH}/rollback`, {
			method: "POST",
			body: JSON.stringify({ reason }),
		}),
};
