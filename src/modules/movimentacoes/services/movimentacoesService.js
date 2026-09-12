import { requestVpsApi } from "../../../services/vpsApiClient";

export async function buscarDashboardMovimentacoes({ dataInicio, dataFim } = {}) {
	const params = new URLSearchParams();
	if (dataInicio) params.set("dataInicio", dataInicio);
	if (dataFim) params.set("dataFim", dataFim);
	const query = params.toString();
	return requestVpsApi(`/movimentacoes/dashboard${query ? `?${query}` : ""}`);
}

export async function listarMovimentacoes({
	page = 1,
	limit = 20,
	dataInicio,
	dataFim,
	empresa,
	tecnico,
	produto,
	status,
} = {}) {
	const params = new URLSearchParams({ page: String(page), limit: String(limit) });
	if (dataInicio) params.set("dataInicio", dataInicio);
	if (dataFim) params.set("dataFim", dataFim);
	if (empresa) params.set("empresa", empresa);
	if (tecnico) params.set("tecnico", tecnico);
	if (produto) params.set("produto", produto);
	if (status) params.set("status", status);
	return requestVpsApi(`/movimentacoes/lista?${params.toString()}`);
}

export async function buscarConfigMovimentacoes() {
	return requestVpsApi("/movimentacoes/config");
}

export async function salvarConfigMovimentacoes(payload) {
	return requestVpsApi("/movimentacoes/config", {
		method: "PUT",
		body: JSON.stringify(payload || {}),
	});
}

export async function iniciarVarreduraMovimentacoes({ dataInicio, dataFim } = {}) {
	return requestVpsApi("/movimentacoes/scan", {
		method: "POST",
		body: JSON.stringify({ dataInicio, dataFim }),
	});
}

export async function buscarJobVarreduraMovimentacoes(jobId) {
	return requestVpsApi(`/movimentacoes/scan/${jobId}`);
}
