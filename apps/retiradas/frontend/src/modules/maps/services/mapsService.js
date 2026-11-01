import { requestVpsApi } from "../../../services/vpsApiClient";

function queryString(params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === "") return;
		query.set(key, String(value));
	});
	return query.toString();
}

function get(path, params, options = {}) {
	const query = queryString(params);
	return requestVpsApi(`/maps${path}${query ? `?${query}` : ""}`, options);
}

function send(path, method, body) {
	return requestVpsApi(`/maps${path}`, {
		method,
		body: JSON.stringify(body || {}),
	});
}

export const mapsService = {
	health: () => get("/health"),
	points: (params, signal) => get("/points", params, { signal }),
	nearby: (params, signal) => get("/nearby", params, { signal }),
	summary: (params, signal) => get("/summary", params, { signal }),
	order: (id) => get(`/orders/${encodeURIComponent(id)}`),
	navigation: (id, position) => get(`/orders/${encodeURIComponent(id)}/navigation`, position),
	requests: (params) => get("/requests", params),
	requestOrder: (orderId) => send("/requests", "POST", { orderId }),
	requestOrders: (orderIds) => send("/requests/batch", "POST", { orderIds }),
	approveRequest: (id, note = "") => send(`/requests/${encodeURIComponent(id)}/approve`, "POST", { note }),
	rejectRequest: (id, note = "") => send(`/requests/${encodeURIComponent(id)}/reject`, "POST", { note }),
	radarSettings: () => get("/radar/settings"),
	saveRadarSettings: (payload) => send("/radar/settings", "PUT", payload),
	evaluateRadar: (payload) => send("/radar/evaluate", "POST", payload),
	saveTechnicianPresence: (payload) => send("/technicians/presence", "POST", payload),
	liveTechnicians: (params) => get("/admin/technicians/live", params),
	technicianTrack: (id, params) => get(`/admin/technicians/${encodeURIComponent(id)}/track`, params),
	radarAlerts: (params) => get("/radar/alerts", params),
	dismissAlert: (id) => send(`/radar/alerts/${encodeURIComponent(id)}/dismiss`, "POST"),
	simulateRadar: (payload) => send("/radar/simulate", "POST", payload),
	routes: (params) => get("/routes", params),
	createRoute: (payload) => send("/routes", "POST", payload),
	updateRoute: (id, payload) => send(`/routes/${encodeURIComponent(id)}`, "PATCH", payload),
	optimizeRoute: (id, payload) => send(`/routes/${encodeURIComponent(id)}/optimize`, "POST", payload),
	queueGeocoding: (limit = 25000) => send("/geocoding/queue", "POST", { limit }),
};
