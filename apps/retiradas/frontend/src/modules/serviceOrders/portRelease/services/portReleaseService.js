import { getApiBaseUrl, requestVpsApi } from "../../../../services/vpsApiClient";

function query(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => value !== "" && value != null && search.set(key, value));
	return search.toString() ? `?${search}` : "";
}

export const getPortReleaseConfig = () => requestVpsApi("/service-orders/port-release/config");
export const getPortReleaseCatalog = () => requestVpsApi("/service-orders/port-release/catalog");
export const savePortReleaseConfig = (body) => requestVpsApi("/service-orders/port-release/config", { method: "PUT", body: JSON.stringify(body) });
export const searchPortReleaseOrders = (body) => requestVpsApi("/service-orders/port-release/search", { method: "POST", body: JSON.stringify(body) });
export const getPortReleaseSearch = (id, params) => requestVpsApi(`/service-orders/port-release/search/${encodeURIComponent(id)}${query(params)}`);
export const createPortReleaseBatch = (body) => requestVpsApi("/service-orders/port-release/batches", { method: "POST", body: JSON.stringify(body) });
export const getPortReleaseBatch = (id) => requestVpsApi(`/service-orders/port-release/batches/${encodeURIComponent(id)}`);
export const startPortReleaseScan = (body) => requestVpsApi("/service-orders/port-release/scans", { method: "POST", body: JSON.stringify(body) });
export const getPortReleaseScan = (id) => requestVpsApi(`/service-orders/port-release/scans/${encodeURIComponent(id)}`);
export const stopPortReleaseScan = (id) => requestVpsApi(`/service-orders/port-release/scans/${encodeURIComponent(id)}/stop`, { method: "POST" });
export const listPortReleaseScans = (params) => requestVpsApi(`/service-orders/port-release/scans${query(params)}`);
export const retryPortReleaseOperation = (id) => requestVpsApi(`/service-orders/port-release/operations/${encodeURIComponent(id)}/retry`, { method: "POST" });
export const listPortReleaseHistory = (params) => requestVpsApi(`/service-orders/port-release/history${query(params)}`);
export const getPortReleaseStats = (params) => requestVpsApi(`/service-orders/port-release/stats${query(params)}`);
export const portReleaseExportUrl = (format, params = {}) => `${getApiBaseUrl()}/service-orders/port-release/export.${format}${query(params)}`;
