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

export async function buscarDreOrcamentoFinanceiro(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim()) {
			search.set(key, String(value));
		}
	});
	return requestVpsApi(
		`${BASE_PATH}/gestao-orcamento/dre${search.size ? `?${search.toString()}` : ""}`,
	);
}

export async function importarDreOrcamentoFinanceiro(payload = {}) {
	return requestVpsApi(`${BASE_PATH}/gestao-orcamento/dre/import`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function criarDadosFicticiosDreFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/gestao-orcamento/dre/fake-data`, {
		method: "POST",
		body: "{}",
	});
}

export async function apagarDadosFicticiosDreFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/gestao-orcamento/dre/fake-data`, {
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

export async function buscarEquipeFinanceiro() {
	return requestVpsApi(`${BASE_PATH}/equipe`);
}

export async function criarSetorEquipeFinanceiro(payload = {}) {
	return requestVpsApi(`${BASE_PATH}/equipe/setores`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function atualizarSetorEquipeFinanceiro(id, payload = {}) {
	return requestVpsApi(`${BASE_PATH}/equipe/setores/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload || {}),
	});
}

export async function removerSetorEquipeFinanceiro(id) {
	return requestVpsApi(`${BASE_PATH}/equipe/setores/${encodeURIComponent(id)}`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function criarCargoEquipeFinanceiro(payload = {}) {
	return requestVpsApi(`${BASE_PATH}/equipe/cargos`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function atualizarCargoEquipeFinanceiro(id, payload = {}) {
	return requestVpsApi(`${BASE_PATH}/equipe/cargos/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload || {}),
	});
}

export async function removerCargoEquipeFinanceiro(id) {
	return requestVpsApi(`${BASE_PATH}/equipe/cargos/${encodeURIComponent(id)}`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function criarColaboradorEquipeFinanceiro(payload = {}) {
	return requestVpsApi(`${BASE_PATH}/equipe/colaboradores`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function atualizarColaboradorEquipeFinanceiro(id, payload = {}) {
	return requestVpsApi(
		`${BASE_PATH}/equipe/colaboradores/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify(payload || {}),
		},
	);
}

export async function moverColaboradorEquipeFinanceiro(id, payload = {}) {
	return requestVpsApi(
		`${BASE_PATH}/equipe/colaboradores/${encodeURIComponent(id)}/move`,
		{
			method: "PATCH",
			body: JSON.stringify(payload || {}),
		},
	);
}

export async function removerColaboradorEquipeFinanceiro(id) {
	return requestVpsApi(
		`${BASE_PATH}/equipe/colaboradores/${encodeURIComponent(id)}`,
		{
			method: "DELETE",
			body: "{}",
		},
	);
}
