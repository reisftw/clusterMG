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

export async function buscarCidadesMovimentacoes({ dataInicio, dataFim } = {}) {
	const params = new URLSearchParams();
	if (dataInicio) params.set("dataInicio", dataInicio);
	if (dataFim) params.set("dataFim", dataFim);
	const query = params.toString();
	return requestVpsApi(`/movimentacoes/cidades${query ? `?${query}` : ""}`);
}

export async function buscarEquipamentosMovimentacoes({ dataInicio, dataFim } = {}) {
	const params = new URLSearchParams();
	if (dataInicio) params.set("dataInicio", dataInicio);
	if (dataFim) params.set("dataFim", dataFim);
	const query = params.toString();
	return requestVpsApi(`/movimentacoes/equipamentos${query ? `?${query}` : ""}`);
}

export async function buscarResumoCategoriaEquipamentos({ dataInicio, dataFim } = {}) {
	const params = new URLSearchParams();
	if (dataInicio) params.set("dataInicio", dataInicio);
	if (dataFim) params.set("dataFim", dataFim);
	const query = params.toString();
	return requestVpsApi(
		`/movimentacoes/equipamentos/resumo-categoria${query ? `?${query}` : ""}`,
	);
}

export async function salvarEquipamentoConfig(payload) {
	return requestVpsApi("/movimentacoes/equipamentos", {
		method: "PUT",
		body: JSON.stringify(payload || {}),
	});
}

export async function iniciarConciliacaoOrdensFechadas({ rows, dataInicio, dataFim }) {
	return requestVpsApi("/movimentacoes/ordens-fechadas/conciliar", {
		method: "POST",
		body: JSON.stringify({ rows, dataInicio, dataFim }),
	});
}

export async function buscarJobConciliacaoOrdensFechadas(jobId) {
	return requestVpsApi(`/movimentacoes/ordens-fechadas/conciliar/${jobId}`);
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
