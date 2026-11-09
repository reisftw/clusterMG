import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE = "/retorninho";

function queryString(params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== "" && value !== null && value !== undefined) query.set(key, String(value));
	});
	const suffix = query.toString();
	return suffix ? `?${suffix}` : "";
}

function write(path, method, body) {
	return requestVpsApi(`${BASE}${path}`, {
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

export const retorninhoApi = {
	dashboard: (params) => requestVpsApi(`${BASE}/dashboard${queryString(params)}`),
	config: () => requestVpsApi(`${BASE}/config`),
	saveConfig: (payload) => write("/config", "PUT", payload),
	clearSecret: (name) => write(`/config/secrets/${encodeURIComponent(name)}`, "DELETE"),
	instance: () => requestVpsApi(`${BASE}/instance`),
	connect: () => write("/instance/connect", "POST", {}),
	disconnect: () => write("/instance/disconnect", "POST", {}),
	users: (params) => requestVpsApi(`${BASE}/authorized-users${queryString(params)}`),
	authorizeUser: (payload) => write("/authorized-users", "POST", payload),
	updateAuthorization: (id, payload) => write(`/authorized-users/${encodeURIComponent(id)}`, "PATCH", payload),
	knowledge: (params) => requestVpsApi(`${BASE}/knowledge${queryString(params)}`),
	saveKnowledge: (id, payload) => write(id ? `/knowledge/${encodeURIComponent(id)}` : "/knowledge", id ? "PUT" : "POST", payload),
	conversations: (params) => requestVpsApi(`${BASE}/conversations${queryString(params)}`),
	messages: (id, params) => requestVpsApi(`${BASE}/conversations/${encodeURIComponent(id)}/messages${queryString(params)}`),
	setConversationStatus: (id, status) => write(`/conversations/${encodeURIComponent(id)}`, "PATCH", { status }),
	protocols: (params) => requestVpsApi(`${BASE}/protocols${queryString(params)}`),
	events: (category, params) => requestVpsApi(`${BASE}/events/${encodeURIComponent(category)}${queryString(params)}`),
	exportEvents: (category, params) => requestVpsApi(`${BASE}/events/${encodeURIComponent(category)}/export${queryString(params)}`),
	queue: (params) => requestVpsApi(`${BASE}/queue${queryString(params)}`),
	reprocessQueue: (id) => write(`/queue/${encodeURIComponent(id)}/reprocess`, "POST", {}),
};
