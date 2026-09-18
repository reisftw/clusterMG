import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/imoveis";

export async function listarImoveis({ status = "" } = {}) {
	const params = new URLSearchParams();
	if (status) params.set("status", status);
	const query = params.toString();
	const response = await requestVpsApi(
		`${BASE_PATH}${query ? `?${query}` : ""}`,
	);
	return response?.items || [];
}

export async function salvarImovel(dados = {}) {
	const id = dados.id;
	const response = id
		? await requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}`, {
				method: "PUT",
				body: JSON.stringify(dados),
			})
		: await requestVpsApi(BASE_PATH, {
				method: "POST",
				body: JSON.stringify(dados),
			});
	return response?.imovel || null;
}

export async function excluirImovel(id) {
	return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function excluirImoveisMassa(ids = []) {
	return requestVpsApi(`${BASE_PATH}/excluir-massa`, {
		method: "POST",
		body: JSON.stringify({ ids }),
	});
}

export async function garantirPastaImovel(id) {
	const response = await requestVpsApi(
		`${BASE_PATH}/${encodeURIComponent(id)}/pasta`,
		{
			method: "POST",
			body: JSON.stringify({}),
		},
	);
	return response;
}

export async function obterConfigImoveis() {
	const response = await requestVpsApi(`${BASE_PATH}/config`);
	return response?.config || {};
}

export async function salvarConfigImoveis(config = {}) {
	const response = await requestVpsApi(`${BASE_PATH}/config`, {
		method: "PUT",
		body: JSON.stringify(config),
	});
	return response?.config || {};
}

export async function importarImoveis(items = [], options = {}) {
	return requestVpsApi(`${BASE_PATH}/importar`, {
		method: "POST",
		body: JSON.stringify({ items, limparAntes: Boolean(options.limparAntes) }),
	});
}

export async function obterRegistrosImovel(id) {
	return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/registros`);
}

export async function registrarReajusteImovel(id, dados = {}) {
	if (dados.file) {
		const formData = new FormData();
		Object.entries(dados).forEach(([key, value]) => {
			if (key === "file") formData.append("file", value);
			else formData.append(key, value ?? "");
		});
		return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/reajustes`, {
			method: "POST",
			body: formData,
		});
	}
	return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/reajustes`, {
		method: "POST",
		body: JSON.stringify(dados),
	});
}

export async function registrarIptuImovel(id, dados = {}) {
	if (dados.file) {
		const formData = new FormData();
		Object.entries(dados).forEach(([key, value]) => {
			if (key === "file") formData.append("file", value);
			else formData.append(key, value ?? "");
		});
		return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/iptu`, {
			method: "POST",
			body: formData,
		});
	}
	return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/iptu`, {
		method: "POST",
		body: JSON.stringify(dados),
	});
}

export async function registrarAluguelImovel(id, dados = {}) {
	return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/alugueis`, {
		method: "POST",
		body: JSON.stringify(dados),
	});
}

export async function cadastrarContratoLink(id, dados = {}) {
	return requestVpsApi(
		`${BASE_PATH}/${encodeURIComponent(id)}/contratos/link`,
		{
			method: "POST",
			body: JSON.stringify(dados),
		},
	);
}

export async function enviarContratoImovel(
	id,
	{ file, nome = "", observacao = "" } = {},
) {
	const formData = new FormData();
	formData.append("file", file);
	formData.append("nome", nome);
	formData.append("observacao", observacao);
	return requestVpsApi(
		`${BASE_PATH}/${encodeURIComponent(id)}/contratos/upload`,
		{
			method: "POST",
			body: formData,
		},
	);
}

export async function enviarAnexoImovel(
	id,
	{
		file,
		nome = "",
		categoria = "",
		tipo = "",
		data = "",
		observacao = "",
	} = {},
) {
	const formData = new FormData();
	formData.append("file", file);
	formData.append("nome", nome || file?.name || "");
	formData.append("categoria", categoria);
	formData.append("tipo", tipo);
	formData.append("data", data);
	formData.append("observacao", observacao);
	return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/anexos/upload`, {
		method: "POST",
		body: formData,
	});
}

export async function enviarAditivoImovel(
	id,
	{ file, nome = "", data = "", observacao = "" } = {},
) {
	const formData = new FormData();
	if (file) formData.append("file", file);
	formData.append("nome", nome || file?.name || "Aditivo");
	formData.append("data", data);
	formData.append("observacao", observacao);
	return requestVpsApi(`${BASE_PATH}/${encodeURIComponent(id)}/aditivos`, {
		method: "POST",
		body: formData,
	});
}

export async function editarContratoImovel(id, contratoId, dados = {}) {
	return requestVpsApi(
		`${BASE_PATH}/${encodeURIComponent(id)}/contratos/${encodeURIComponent(contratoId)}`,
		{
			method: "PUT",
			body: JSON.stringify(dados),
		},
	);
}

export async function excluirContratoImovel(id, contratoId) {
	return requestVpsApi(
		`${BASE_PATH}/${encodeURIComponent(id)}/contratos/${encodeURIComponent(contratoId)}`,
		{
			method: "DELETE",
		},
	);
}

export async function obterRelatoriosImoveis({ mes = "", ano = "" } = {}) {
	const params = new URLSearchParams();
	if (mes) params.set("mes", mes);
	if (ano) params.set("ano", ano);
	const query = params.toString();
	return requestVpsApi(
		`${BASE_PATH}/relatorios/dados${query ? `?${query}` : ""}`,
	);
}

export async function obterDashboardImoveis() {
	return requestVpsApi(`${BASE_PATH}/dashboard`);
}

export async function obterStatusArmazenamentoContratos() {
	const response = await requestVpsApi(`${BASE_PATH}/storage/contracts/status`);
	return response?.storage || null;
}

export async function limparArmazenamentoContratos() {
	const response = await requestVpsApi(`${BASE_PATH}/storage/contracts`, {
		method: "DELETE",
	});
	return response?.storage || null;
}

export function urlDownloadZipContratos() {
	return `${BASE_PATH}/storage/contracts/download`;
}
