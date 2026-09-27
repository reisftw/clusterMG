import { requestVpsApi } from "../../../services/vpsApiClient";

function paramsFrom(values = {}) {
	const params = new URLSearchParams();
	Object.entries(values).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") {
			params.set(key, String(value));
		}
	});
	const query = params.toString();
	return query ? `?${query}` : "";
}

export async function listarAtualizacoesMapa(params = {}) {
	return requestVpsApi(`/mapas/atualizacoes${paramsFrom(params)}`);
}

export async function buscarAtualizacaoMapa(id) {
	return requestVpsApi(`/mapas/atualizacoes/${encodeURIComponent(id)}`);
}

export async function buscarUltimaAtualizacaoMapa(params = {}) {
	return requestVpsApi(`/mapas/atualizacoes/latest${paramsFrom(params)}`);
}

export async function buscarResumoOperacionalAcompanhamento(params = {}) {
	return requestVpsApi(
		`/acompanhamento/operational-summary${paramsFrom(params)}`,
	);
}
