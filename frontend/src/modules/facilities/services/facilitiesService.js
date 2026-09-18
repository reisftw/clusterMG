import { getApiBaseUrl, requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/facilities";

export async function obterDashboardFacilities() {
	return requestVpsApi(`${BASE_PATH}/dashboard`);
}

export async function listarModulosFacilities() {
	const response = await requestVpsApi(`${BASE_PATH}/modules`);
	return response?.modules || [];
}

export async function listarAtivosPatrimoniais() {
	const response = await requestVpsApi(`${BASE_PATH}/patrimonio/assets`);
	return response?.assets || [];
}

export async function obterRegistroPublicoQrFacilities(token) {
	const response = await fetch(
		`${getApiBaseUrl()}/public/facilities/qr/${encodeURIComponent(token || "")}`,
		{
			cache: "no-store",
			credentials: "omit",
			headers: { Accept: "application/json" },
		},
	);
	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	if (!response.ok) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data?.record || null;
}

export async function obterAvaliacaoPublicaFornecedor(token, fornecedorId = "") {
	const params = fornecedorId ? `?fornecedor=${encodeURIComponent(fornecedorId)}` : "";
	const response = await fetch(
		`${getApiBaseUrl()}/public/facilities/supplier-evaluation/${encodeURIComponent(token || "")}${params}`,
		{
			cache: "no-store",
			credentials: "omit",
			headers: { Accept: "application/json" },
		},
	);
	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	if (!response.ok) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data?.evaluation || null;
}

export async function enviarAvaliacaoPublicaFornecedor(token, payload = {}) {
	const response = await fetch(
		`${getApiBaseUrl()}/public/facilities/supplier-evaluation/${encodeURIComponent(token || "")}`,
		{
			method: "POST",
			cache: "no-store",
			credentials: "omit",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		},
	);
	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	if (!response.ok) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data?.evaluation || null;
}

export async function salvarAtivoPatrimonial(asset) {
	const id = asset?.id;
	const response = await requestVpsApi(
		id
			? `${BASE_PATH}/patrimonio/assets/${encodeURIComponent(id)}`
			: `${BASE_PATH}/patrimonio/assets`,
		{
			method: id ? "PUT" : "POST",
			body: JSON.stringify(asset || {}),
		},
	);
	return response?.asset || null;
}

export async function excluirAtivoPatrimonial(id) {
	const response = await requestVpsApi(
		`${BASE_PATH}/patrimonio/assets/${encodeURIComponent(id || "")}`,
		{ method: "DELETE" },
	);
	return response?.asset || null;
}

export async function listarInventariosPatrimoniais() {
	const response = await requestVpsApi(`${BASE_PATH}/inventories`);
	return response?.inventories || [];
}

export async function criarInventarioPatrimonial(inventory = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/inventories`, {
		method: "POST",
		body: JSON.stringify(inventory),
	});
	return response?.inventory || null;
}

export async function atualizarInventarioPatrimonial(id, inventory = {}) {
	const response = await requestVpsApi(
		`${BASE_PATH}/inventories/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify(inventory),
		},
	);
	return response?.inventory || null;
}

export async function listarMovimentacoesPatrimoniais() {
	const response = await requestVpsApi(`${BASE_PATH}/patrimonio/movements`);
	return response?.movements || [];
}

export async function criarMovimentacaoPatrimonial(movement = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/patrimonio/movements`, {
		method: "POST",
		body: JSON.stringify(movement),
	});
	return response?.movement || null;
}

export async function obterConfigPatrimonio() {
	const response = await requestVpsApi(`${BASE_PATH}/patrimonio/config`);
	return response?.config || {};
}

export async function salvarConfigPatrimonio(config = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/patrimonio/config`, {
		method: "PUT",
		body: JSON.stringify(config),
	});
	return response?.config || {};
}

export async function listarItensSeguranca() {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/items`);
	return response?.items || [];
}

export async function buscarImoveisSeguranca(params = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/properties/search${toQueryString(params)}`);
	return response?.items || [];
}

export async function salvarItemSeguranca(item = {}) {
	const id = item?.id;
	const response = await requestVpsApi(
		id
			? `${BASE_PATH}/seguranca/items/${encodeURIComponent(id)}`
			: `${BASE_PATH}/seguranca/items`,
		{
			method: id ? "PUT" : "POST",
			body: JSON.stringify(item),
		},
	);
	return response?.item || null;
}

export async function listarInspecoesSeguranca() {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/inspections`);
	return response?.inspections || [];
}

export async function criarInspecaoSeguranca(inspection = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/inspections`, {
		method: "POST",
		body: JSON.stringify(inspection),
	});
	return response?.inspection || null;
}

export async function listarDocumentosSeguranca() {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/documents`);
	return response?.documents || [];
}

export async function criarDocumentoSeguranca(document = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/documents`, {
		method: "POST",
		body: JSON.stringify(document),
	});
	return response?.document || null;
}

export async function listarNaoConformidadesSeguranca() {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/nonconformities`);
	return response?.nonconformities || [];
}

export async function criarNaoConformidadeSeguranca(nonconformity = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/seguranca/nonconformities`, {
		method: "POST",
		body: JSON.stringify(nonconformity),
	});
	return response?.nonconformity || null;
}

function toQueryString(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params || {}).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value) !== "") {
			search.set(key, String(value));
		}
	});
	const text = search.toString();
	return text ? `?${text}` : "";
}

export async function obterDashboardChavesFacilities() {
	const response = await requestVpsApi(`${BASE_PATH}/acessos-chaves/dashboard`);
	return response?.dashboard || null;
}

export async function listarChavesFacilities(params = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/acessos-chaves/keys${toQueryString(params)}`);
	return {
		items: response?.items || response?.keys || [],
		pagination: response?.pagination || { page: 1, pageSize: 25, total: response?.keys?.length || 0, totalPages: 1 },
	};
}

export async function salvarChaveFacilities(key = {}) {
	const id = key?.id;
	const response = await requestVpsApi(
		id
			? `${BASE_PATH}/acessos-chaves/keys/${encodeURIComponent(id)}`
			: `${BASE_PATH}/acessos-chaves/keys`,
		{
			method: id ? "PUT" : "POST",
			body: JSON.stringify(key),
		},
	);
	return response?.key || null;
}

export async function retirarChaveFacilities(id, payload = {}) {
	const response = await requestVpsApi(
		`${BASE_PATH}/acessos-chaves/keys/${encodeURIComponent(id)}/checkout`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response?.key || null;
}

export async function devolverChaveFacilities(id, payload = {}) {
	const response = await requestVpsApi(
		`${BASE_PATH}/acessos-chaves/keys/${encodeURIComponent(id)}/return`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response?.key || null;
}

export async function declararChavePerdidaFacilities(id, payload = {}) {
	const response = await requestVpsApi(
		`${BASE_PATH}/acessos-chaves/keys/${encodeURIComponent(id)}/lost`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response?.key || null;
}

export async function inativarChaveFacilities(id, payload = {}) {
	const response = await requestVpsApi(
		`${BASE_PATH}/acessos-chaves/keys/${encodeURIComponent(id)}`,
		{
			method: "DELETE",
			body: JSON.stringify(payload),
		},
	);
	return response?.key || null;
}

export async function regenerarQrChaveFacilities(id) {
	const response = await requestVpsApi(
		`${BASE_PATH}/acessos-chaves/keys/${encodeURIComponent(id)}/regenerate-qr`,
		{ method: "POST" },
	);
	return response?.key || null;
}

export async function listarHistoricoChaveFacilities(id) {
	const response = await requestVpsApi(
		`${BASE_PATH}/acessos-chaves/keys/${encodeURIComponent(id)}/history`,
	);
	return response?.history || [];
}

export const listarChavesOperacao = async () => (await listarChavesFacilities({ pageSize: 100 })).items;
export const listarHistoricoChaveOperacao = listarHistoricoChaveFacilities;

export async function obterRelatorioMigracaoChaves() {
	const response = await requestVpsApi(`${BASE_PATH}/acessos-chaves/migration-report`);
	return response?.report || null;
}

export async function listarChecklistsPrediais() {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/checklists`);
	return response?.checklists || [];
}

export async function criarChecklistPredial(checklist = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/checklists`, {
		method: "POST",
		body: JSON.stringify(checklist),
	});
	return response?.checklist || null;
}

export async function listarExecucoesChecklistPredial() {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/checklist-runs`);
	return response?.runs || [];
}

export async function criarExecucaoChecklistPredial(run = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/checklist-runs`, {
		method: "POST",
		body: JSON.stringify(run),
	});
	return response?.run || null;
}

export async function listarRotinasPrediais() {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/routines`);
	return response?.routines || [];
}

export async function criarRotinaPredial(routine = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/routines`, {
		method: "POST",
		body: JSON.stringify(routine),
	});
	return response?.routine || null;
}

export async function listarManutencoesPrediais() {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/maintenance`);
	return response?.maintenance || [];
}

export async function criarManutencaoPredial(maintenance = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/maintenance`, {
		method: "POST",
		body: JSON.stringify(maintenance),
	});
	return response?.maintenance || null;
}

export async function listarOcorrenciasPrediais() {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/incidents`);
	return response?.incidents || [];
}

export async function criarOcorrenciaPredial(incident = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/incidents`, {
		method: "POST",
		body: JSON.stringify(incident),
	});
	return response?.incident || null;
}

export async function listarAchadosPerdidos() {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/lost-found`);
	return response?.items || [];
}

export async function criarAchadoPerdido(item = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/operacao-predial/lost-found`, {
		method: "POST",
		body: JSON.stringify(item),
	});
	return response?.item || null;
}

export async function listarFornecedoresFacilities() {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/suppliers`);
	return response?.suppliers || [];
}

export async function buscarFornecedoresFacilities(params = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/suppliers/search${toQueryString(params)}`);
	return response?.suppliers || [];
}

export async function buscarImoveisContratosFacilities(params = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/properties/search${toQueryString(params)}`);
	return response?.items || [];
}

export async function salvarFornecedorFacilities(supplier = {}) {
	const id = supplier?.id;
	const response = await requestVpsApi(
		id
			? `${BASE_PATH}/fornecedores-contratos/suppliers/${encodeURIComponent(id)}`
			: `${BASE_PATH}/fornecedores-contratos/suppliers`,
		{
			method: id ? "PUT" : "POST",
			body: JSON.stringify(supplier),
		},
	);
	return response?.supplier || null;
}

export async function listarContratosFacilities() {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/contracts`);
	return response?.contracts || [];
}

export async function salvarContratoFacilities(contract = {}) {
	const id = contract?.id;
	const response = await requestVpsApi(
		id
			? `${BASE_PATH}/fornecedores-contratos/contracts/${encodeURIComponent(id)}`
			: `${BASE_PATH}/fornecedores-contratos/contracts`,
		{
			method: id ? "PUT" : "POST",
			body: JSON.stringify(contract),
		},
	);
	return response?.contract || null;
}

export async function listarDocumentosContratosFacilities() {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/documents`);
	return response?.documents || [];
}

export async function criarDocumentoContratoFacilities(document = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/documents`, {
		method: "POST",
		body: JSON.stringify(document),
	});
	return response?.document || null;
}

export async function listarReajustesContratosFacilities() {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/adjustments`);
	return response?.adjustments || [];
}

export async function criarReajusteContratoFacilities(adjustment = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/adjustments`, {
		method: "POST",
		body: JSON.stringify(adjustment),
	});
	return response?.adjustment || null;
}

export async function listarAvaliacoesFornecedoresFacilities() {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/evaluations`);
	return response?.evaluations || [];
}

export async function criarAvaliacaoFornecedorFacilities(evaluation = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/evaluations`, {
		method: "POST",
		body: JSON.stringify(evaluation),
	});
	return response?.evaluation || null;
}

export async function enviarLinkAvaliacaoFornecedorFacilities(payload = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/fornecedores-contratos/evaluation-links`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return response?.link || null;
}

export async function buscarImoveisConsumosFacilities(params = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/consumos/properties/search${toQueryString(params)}`);
	return response?.items || [];
}

export async function listarConsumosFacilities(params = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/consumos/items${toQueryString(params)}`);
	return response?.consumptions || [];
}

export async function criarConsumoFacilities(consumption = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/consumos/items`, {
		method: "POST",
		body: JSON.stringify(consumption),
	});
	return response?.consumption || null;
}

export async function previewImportacaoConsumosFacilities(rows = []) {
	const response = await requestVpsApi(`${BASE_PATH}/consumos/import/preview`, {
		method: "POST",
		body: JSON.stringify({ rows }),
	});
	return response?.preview || [];
}

export async function obterRelatorioFacilities() {
	return requestVpsApi(`${BASE_PATH}/relatorios/consolidado`);
}
