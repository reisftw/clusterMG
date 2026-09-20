import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/admin/vpn";

export async function buscarConfigVpn() {
	return requestVpsApi(`${BASE_PATH}/config`);
}

export async function salvarConfigVpn(config) {
	return requestVpsApi(`${BASE_PATH}/config`, {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function buscarLogsVpn(limit = 100) {
	return requestVpsApi(`${BASE_PATH}/logs?limit=${encodeURIComponent(limit)}`);
}

export async function testarAcessoVpn(route) {
	const search = new URLSearchParams({ route: route || "" });
	return requestVpsApi(`/vpn/access-check?${search.toString()}`);
}
