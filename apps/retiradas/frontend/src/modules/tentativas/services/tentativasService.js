import { getApiBaseUrl, requestVpsApi } from "../../../services/vpsApiClient";

function qs(params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") {
			query.set(key, String(value));
		}
	});
	const text = query.toString();
	return text ? `?${text}` : "";
}

export function listarCidadesTentativas(params = {}) {
	return requestVpsApi(`/tentativas/cidades${qs(params)}`);
}

export function buscarMinhaRotaTentativas(params = {}) {
	return requestVpsApi(`/tentativas/minha-rota${qs(params)}`);
}

export function buscarDetalheTentativa(id) {
	return requestVpsApi(`/tentativas/${encodeURIComponent(id)}`);
}

export function iniciarContatoTentativa(id, payload = {}) {
	return requestVpsApi(`/tentativas/${encodeURIComponent(id)}/iniciar`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function salvarResultadoTentativa(contactId, payload = {}) {
	return requestVpsApi(
		`/tentativas/contacts/${encodeURIComponent(contactId)}/resultado`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
}

export function buscarHistoricoTentativas(params = {}) {
	return requestVpsApi(`/tentativas/historico${qs(params)}`);
}

export function buscarResumoTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/resumo${qs(params)}`);
}

export function buscarRankingTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/ranking${qs(params)}`);
}

export function buscarDistribuicaoTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/distribuicao${qs(params)}`);
}

export function listarCidadesTecnicosTentativas() {
	return requestVpsApi("/tentativas/admin/cidades-tecnicos");
}

export function buscarUsuariosTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/usuarios${qs(params)}`);
}

export function salvarCidadeTecnicoTentativas(payload = {}) {
	return requestVpsApi("/tentativas/admin/cidades-tecnicos", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function removerCidadeTecnicoTentativas(id) {
	return requestVpsApi(
		`/tentativas/admin/cidades-tecnicos/${encodeURIComponent(id)}`,
		{ method: "DELETE" },
	);
}

export function criarCampanhaTentativas(payload = {}) {
	return requestVpsApi("/tentativas/admin/campanhas", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function listarTemplatesTentativas() {
	return requestVpsApi("/tentativas/admin/templates");
}

export function salvarTemplateTentativas(payload = {}) {
	return requestVpsApi("/tentativas/admin/templates", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function buscarConfiguracoesTentativas() {
	return requestVpsApi("/tentativas/admin/configuracoes");
}

export function salvarConfiguracoesTentativas(payload = {}) {
	return requestVpsApi("/tentativas/admin/configuracoes", {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export function baixarHistoricoTentativasCsv(params = {}) {
	window.location.assign(
		`${getApiBaseUrl()}/tentativas/historico/export.csv${qs(params)}`,
	);
}
