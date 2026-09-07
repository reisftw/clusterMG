import { requestFinanFinanceiroApi } from "../../../api/finanApi";

const BASE_PATH = "";

export async function buscarDashboardFinanceiro(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim())
			search.set(key, String(value));
	});
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/dashboard${search.size ? `?${search.toString()}` : ""}`,
	);
}

export async function buscarCentrosCustoOrcamentoFinanceiro(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim()) {
			search.set(key, String(value));
		}
	});
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/orcamento/centros-custo${search.size ? `?${search.toString()}` : ""}`,
	);
}

export async function salvarCentrosCustoOrcamentoFinanceiro(config) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/orcamento/centros-custo`, {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function atualizarAprovacaoOrcamentoFinanceiro(
	approvalId,
	payload = {},
) {
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/orcamento/aprovacoes/${encodeURIComponent(approvalId)}`,
		{
			method: "PATCH",
			body: JSON.stringify(payload || {}),
		},
	);
}

export async function buscarDadosOrcamentoFinanceiro() {
	const params = new URLSearchParams({ _: String(Date.now()) });
	return requestFinanFinanceiroApi(`${BASE_PATH}/orcamento/dados?${params.toString()}`, {
		cache: "no-store",
	});
}

export async function importarDadosOrcamentoFinanceiro(payload) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/orcamento/dados`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function iniciarImportacaoDadosOrcamentoFinanceiro(files = []) {
	const formData = new FormData();
	files.forEach((file) => formData.append("files", file));
	return requestFinanFinanceiroApi(`${BASE_PATH}/orcamento/dados/import-jobs`, {
		method: "POST",
		body: formData,
	});
}

export async function buscarImportacaoDadosOrcamentoFinanceiro(jobId) {
	const params = new URLSearchParams({ _: String(Date.now()) });
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/orcamento/dados/import-jobs/${encodeURIComponent(jobId)}?${params.toString()}`,
		{ cache: "no-store" },
	);
}

export async function limparDadosOrcamentoFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/orcamento/dados`, {
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
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/gestao-orcamento/dre${search.size ? `?${search.toString()}` : ""}`,
	);
}

export async function importarDreOrcamentoFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/gestao-orcamento/dre/import`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function criarDadosFicticiosDreFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/gestao-orcamento/dre/fake-data`, {
		method: "POST",
		body: "{}",
	});
}

export async function apagarDadosFicticiosDreFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/gestao-orcamento/dre/fake-data`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function buscarConfigPlanilhasFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/sheets-config`);
}

export async function salvarConfigPlanilhasFinanceiro(config) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/sheets-config`, {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
}

export async function testarPlanilhaFinanceiro(sourceId) {
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/sheets-config/test/${encodeURIComponent(sourceId)}`,
		{
			method: "POST",
			body: "{}",
		},
	);
}

export async function sincronizarPlanilhasFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/sheets-config/sync`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function buscarLogsPlanilhasFinanceiro(limit = 20) {
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/sheets-config/logs?limit=${encodeURIComponent(limit)}`,
	);
}

export async function buscarSerasaReportFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/reports/serasa`);
}

export async function salvarSerasaReportFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/reports/serasa`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function limparSerasaReportFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/reports/serasa`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function buscarTarifasReportFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/reports/tarifas`);
}

export async function salvarTarifasReportFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/reports/tarifas`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function limparTarifasReportFinanceiro() {
	return requestFinanFinanceiroApi(`${BASE_PATH}/reports/tarifas`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function buscarEquipeFinanceiro() {
	const params = new URLSearchParams({ _: String(Date.now()) });
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe?${params.toString()}`, {
		cache: "no-store",
	});
}

export async function atualizarConfigEquipeFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/config`, {
		method: "PUT",
		body: JSON.stringify(payload || {}),
	});
}

export async function criarSetorEquipeFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/setores`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function atualizarSetorEquipeFinanceiro(id, payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/setores/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload || {}),
	});
}

export async function removerSetorEquipeFinanceiro(id) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/setores/${encodeURIComponent(id)}`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function criarCargoEquipeFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/cargos`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function atualizarCargoEquipeFinanceiro(id, payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/cargos/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload || {}),
	});
}

export async function removerCargoEquipeFinanceiro(id) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/cargos/${encodeURIComponent(id)}`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function criarColaboradorEquipeFinanceiro(payload = {}) {
	return requestFinanFinanceiroApi(`${BASE_PATH}/equipe/colaboradores`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export async function atualizarColaboradorEquipeFinanceiro(id, payload = {}) {
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/equipe/colaboradores/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify(payload || {}),
		},
	);
}

export async function moverColaboradorEquipeFinanceiro(id, payload = {}) {
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/equipe/colaboradores/${encodeURIComponent(id)}/move`,
		{
			method: "PATCH",
			body: JSON.stringify(payload || {}),
		},
	);
}

export async function removerColaboradorEquipeFinanceiro(id) {
	return requestFinanFinanceiroApi(
		`${BASE_PATH}/equipe/colaboradores/${encodeURIComponent(id)}`,
		{
			method: "DELETE",
			body: "{}",
		},
	);
}
