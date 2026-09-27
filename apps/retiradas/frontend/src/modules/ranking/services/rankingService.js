import { getApiBaseUrl, requestVpsApi } from "../../../services/vpsApiClient";

function buildSearchParams(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === "") return;
		search.set(key, String(value));
	});
	return search.toString();
}

export async function buscarRanking(params = {}) {
	const query = buildSearchParams(params);
	return requestVpsApi(`/ranking${query ? `?${query}` : ""}`);
}

export async function buscarRankingDetalhe(params = {}) {
	const query = buildSearchParams(params);
	return requestVpsApi(`/ranking/detail${query ? `?${query}` : ""}`);
}

export function baixarRankingXlsx(params = {}) {
	const query = buildSearchParams(params);
	const url = `${getApiBaseUrl()}/ranking/export.xlsx${query ? `?${query}` : ""}`;
	window.location.assign(url);
}
