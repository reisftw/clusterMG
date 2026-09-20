import { requestRotApi } from "../../../api/rotApi";

const BASE_PATH = "/admin/tecnicos/auditoria/bolsa";

export async function buscarAuditoriaBolsaTecnico() {
	return requestRotApi(BASE_PATH);
}

export async function buscarConfiguracaoAuditoriaBolsa() {
	return requestRotApi(`${BASE_PATH}/config`);
}

export async function salvarConfiguracaoAuditoriaBolsa(config) {
	return requestRotApi(`${BASE_PATH}/config`, {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function buscarLogsAuditoriaBolsa({ page = 1, limit = 20 } = {}) {
	const params = new URLSearchParams({
		page: String(page),
		limit: String(limit),
	});
	return requestRotApi(`${BASE_PATH}/logs?${params.toString()}`);
}

export async function buscarHistoricoAuditoriaBolsa({ tipo = "tecnico", id, ano, periodo, dataInicio, dataFim } = {}) {
	const params = new URLSearchParams();
	params.set("tipo", tipo);
	if (id) params.set("id", String(id));
	if (ano) params.set("ano", String(ano));
	if (periodo) params.set("periodo", String(periodo));
	if (dataInicio) params.set("dataInicio", String(dataInicio));
	if (dataFim) params.set("dataFim", String(dataFim));
	return requestRotApi(`${BASE_PATH}/historico?${params.toString()}`);
}

export async function atualizarTodasBolsas() {
	return requestRotApi(`${BASE_PATH}/refresh`, { method: "POST", body: "{}" });
}

export async function buscarJobAuditoriaBolsa(jobId) {
	return requestRotApi(`${BASE_PATH}/jobs/${encodeURIComponent(jobId)}`);
}

export async function atualizarBolsaTecnico(id) {
	return requestRotApi(`${BASE_PATH}/refresh/${encodeURIComponent(id)}`, {
		method: "POST",
		body: "{}",
	});
}

export async function rodarRotinaBolsaTecnico() {
	return requestRotApi(`${BASE_PATH}/run-daily`, {
		method: "POST",
		body: "{}",
	});
}

export async function buscarRelatorioAuditoriaBolsa(filters = {}) {
	const params = new URLSearchParams();
	Object.entries(filters).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim()) {
			params.set(key, String(value));
		}
	});
	return requestRotApi(`${BASE_PATH}/relatorios?${params.toString()}`);
}

export async function atualizarMovimentacoesRelatorioBolsa(filters = {}) {
	return requestRotApi(`${BASE_PATH}/relatorios/refresh`, {
		method: "POST",
		body: JSON.stringify(filters || {}),
	});
}

export async function enviarRelatorioAuditoriaBolsaEmail(payload = {}) {
	return requestRotApi(`${BASE_PATH}/relatorios/email`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
}
