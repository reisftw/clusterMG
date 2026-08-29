import { requestVpsApi } from "./vpsApiClient";

export async function verificarAcessoVpn(route) {
	const search = new URLSearchParams({ route: route || "" });
	return requestVpsApi(`/vpn/access-check?${search.toString()}`);
}
