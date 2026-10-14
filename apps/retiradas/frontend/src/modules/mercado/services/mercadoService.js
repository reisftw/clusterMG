import { requestVpsApi } from "../../../services/vpsApiClient";

function queryString(params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") {
			query.set(key, value);
		}
	});
	const text = query.toString();
	return text ? `?${text}` : "";
}

export const mercadoApi = {
	dashboard: (params) => requestVpsApi(`/mercado/dashboard${queryString(params)}`),
	config: () => requestVpsApi("/mercado/config"),
	saveConfig: (config) =>
		requestVpsApi("/mercado/config", {
			method: "PUT",
			body: JSON.stringify({ config }),
		}),
	simularConfig: (payload) =>
		requestVpsApi("/mercado/config/simular", {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	empresas: (params) => requestVpsApi(`/mercado/empresas${queryString(params)}`),
	habilitacoes: () => requestVpsApi("/mercado/empresas/habilitacoes"),
	saveHabilitacao: (payload) =>
		requestVpsApi("/mercado/empresas/habilitacoes", {
			method: "PUT",
			body: JSON.stringify(payload),
		}),
	lotes: (params) => requestVpsApi(`/mercado/lotes${queryString(params)}`),
	lote: (id) => requestVpsApi(`/mercado/lotes/${encodeURIComponent(id)}`),
	criarLote: (payload) =>
		requestVpsApi("/mercado/lotes", {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	gerarLotes: (payload) =>
		requestVpsApi("/mercado/lotes/gerar", {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	aceitarLote: (id) =>
		requestVpsApi(`/mercado/lotes/${encodeURIComponent(id)}/aceitar`, {
			method: "POST",
			body: JSON.stringify({}),
		}),
	desistirLote: (id) =>
		requestVpsApi(`/mercado/lotes/${encodeURIComponent(id)}/desistir`, {
			method: "POST",
			body: JSON.stringify({}),
		}),
	execucao: (params) => requestVpsApi(`/mercado/execucao${queryString(params)}`),
	atualizarOs: (id, payload) =>
		requestVpsApi(`/mercado/os/${encodeURIComponent(id)}/execucao`, {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	tentativa: (id, payload) =>
		requestVpsApi(`/mercado/os/${encodeURIComponent(id)}/tentativas`, {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	agendamento: (id, payload) =>
		requestVpsApi(`/mercado/os/${encodeURIComponent(id)}/agendamentos`, {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	evidencia: (id, payload) =>
		requestVpsApi(`/mercado/os/${encodeURIComponent(id)}/evidencias`, {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	backoffice: (params) =>
		requestVpsApi(`/mercado/backoffice${queryString(params)}`),
	aprovarOs: (id, payload) =>
		requestVpsApi(`/mercado/os/${encodeURIComponent(id)}/aprovar`, {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	financeiro: (params) =>
		requestVpsApi(`/mercado/financeiro${queryString(params)}`),
	gerarApuracao: (payload) =>
		requestVpsApi("/mercado/financeiro/apuracoes", {
			method: "POST",
			body: JSON.stringify(payload),
		}),
	historico: (params) => requestVpsApi(`/mercado/historico${queryString(params)}`),
};
