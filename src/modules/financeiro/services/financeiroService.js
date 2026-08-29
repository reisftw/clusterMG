import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/financeiro";

export async function buscarDashboardFinanceiro(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim())
			search.set(key, String(value));
	});
	return requestVpsApi(
		`${BASE_PATH}/dashboard${search.size ? `?${search.toString()}` : ""}`,
	);
}

export async function buscarCentrosCustoOrcamentoFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/orcamento/centros-custo`);
}

export async function salvarCentrosCustoOrcamentoFinanceiro(config) {
	return requestVpsApi(`${BASE_PATH}/orcamento/centros-custo`, {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function atualizarAprovacaoOrcamentoFinanceiro(
	approvalId,
	payload = {},
) {
	return requestVpsApi(
		`${BASE_PATH}/orcamento/aprovacoes/${encodeURIComponent(approvalId)}`,
		{
			method: "PATCH",
			body: JSON.stringify(payload || {}),
		},
	);
}

export async function buscarDadosOrcamentoFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/orcamento/dados`);
}

export async function importarDadosOrcamentoFinanceiro(payload) {
	return requestVpsApi(`${BASE_PATH}/orcamento/dados`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function limparDadosOrcamentoFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/orcamento/dados`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function buscarConfigPlanilhasFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/sheets-config`);
}

export async function salvarConfigPlanilhasFinanceiro(config) {
	return requestVpsApi(`${BASE_PATH}/sheets-config`, {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function testarPlanilhaFinanceiro(sourceId) {
	return requestVpsApi(
		`${BASE_PATH}/sheets-config/test/${encodeURIComponent(sourceId)}`,
		{
			method: "POST",
			body: "{}",
		},
	);
}

export async function sincronizarPlanilhasFinanceiro(payload = {}) {
	return requestVpsApi(`${BASE_PATH}/sheets-config/sync`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function buscarLogsPlanilhasFinanceiro(limit = 20) {
	return requestVpsApi(
		`${BASE_PATH}/sheets-config/logs?limit=${encodeURIComponent(limit)}`,
	);
}

export async function buscarSerasaReportFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/reports/serasa`);
}

export async function salvarSerasaReportFinanceiro(payload = {}) {
	return requestVpsApi(`${BASE_PATH}/reports/serasa`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function limparSerasaReportFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/reports/serasa`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function buscarTarifasReportFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/reports/tarifas`);
}

export async function salvarTarifasReportFinanceiro(payload = {}) {
	return requestVpsApi(`${BASE_PATH}/reports/tarifas`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function limparTarifasReportFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/reports/tarifas`, {
		method: "DELETE",
		body: "{}",
	});
}
