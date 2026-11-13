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

export function listarLocalidadesTentativas(params = {}) {
	return requestVpsApi(`/tentativas/localidades${qs(params)}`);
}

export function solicitarBairroTentativas(payload = {}) {
	return requestVpsApi("/tentativas/bairros/solicitar", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function listarRetornosTentativas(params = {}) {
	return requestVpsApi(`/tentativas/retornos${qs(params)}`);
}

export function atualizarRetornoTentativas(id, payload = {}) {
	return requestVpsApi(`/tentativas/retornos/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export function criarRetornoTentativa(opportunityId, payload = {}) {
	return requestVpsApi(`/tentativas/${encodeURIComponent(opportunityId)}/retornos`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function listarRecuperacoesTentativas(params = {}) {
	return requestVpsApi(`/tentativas/recuperacoes${qs(params)}`);
}

export function buscarMinhaProdutividadeTentativas(params = {}) {
	return requestVpsApi(`/tentativas/produtividade${qs(params)}`);
}

export function registrarAcessoTentativas(payload = {}) {
	return requestVpsApi("/tentativas/acessos", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function atualizarRecuperacaoTentativas(id, payload = {}) {
	return requestVpsApi(`/tentativas/recuperacoes/${encodeURIComponent(id)}/status`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export function enviarEvidenciaRecuperacaoTentativas(id, file) {
	const formData = new FormData();
	formData.append("file", file);
	return requestVpsApi(`/tentativas/recuperacoes/${encodeURIComponent(id)}/evidencias`, {
		method: "POST",
		body: formData,
	});
}

export function buscarTimelineTentativa(id) {
	return requestVpsApi(`/tentativas/${encodeURIComponent(id)}/timeline`);
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

export function corrigirContatoTentativa(contactId, payload = {}) {
	return requestVpsApi(`/tentativas/contacts/${encodeURIComponent(contactId)}/corrigir`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export function buscarHistoricoTentativas(params = {}) {
	return requestVpsApi(`/tentativas/historico${qs(params)}`);
}

export function buscarResumoTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/resumo${qs(params)}`);
}

export function buscarAnalyticsTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/analytics${qs(params)}`);
}

export function baixarAnalyticsTentativasCsv(params = {}) {
	window.location.assign(
		`${getApiBaseUrl()}/tentativas/admin/analytics/export.csv${qs(params)}`,
	);
}

export function buscarInteligenciaTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/inteligencia${qs(params)}`);
}

export function buscarNovosContatosTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/novos-contatos${qs(params)}`);
}

export function buscarAdocaoTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/adocao${qs(params)}`);
}

export function buscarHistoricoAlertasTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/alertas${qs(params)}`);
}

export function executarAlertasTentativas() {
	return requestVpsApi("/tentativas/admin/alertas/executar", { method: "POST" });
}

export function buscarAuditoriaTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/auditoria${qs(params)}`);
}

export function recalcularPrioridadesTentativas(payload = {}) {
	return requestVpsApi("/tentativas/admin/recalcular-prioridades", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function transferirAtribuicaoTentativas(id, payload = {}) {
	return requestVpsApi(`/tentativas/admin/atribuicoes/${encodeURIComponent(id)}/transferir`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
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

export function listarBairrosResponsaveisTentativas(cidade) {
	return requestVpsApi(`/tentativas/admin/bairros${qs({ cidade })}`);
}

export function transferirBairroTentativas(payload = {}) {
	return requestVpsApi("/tentativas/admin/bairros/transferir", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function listarSolicitacoesBairroTentativas(params = {}) {
	return requestVpsApi(`/tentativas/admin/bairros/solicitacoes${qs(params)}`);
}

export function resolverSolicitacaoBairroTentativas(id, action, payload = {}) {
	return requestVpsApi(`/tentativas/admin/bairros/solicitacoes/${encodeURIComponent(id)}/${action}`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
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
