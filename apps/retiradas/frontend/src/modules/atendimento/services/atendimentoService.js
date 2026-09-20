import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/atendimento";

function query(path, params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim())
			search.set(key, String(value));
	});
	return `${path}${search.size ? `?${search.toString()}` : ""}`;
}

export const buscarStatusAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/status`);
export const buscarEstatisticasAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/stats`);
export const buscarConfigAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/config`);
export const salvarConfigAtendimento = (config) =>
	requestVpsApi(`${BASE_PATH}/config`, {
		method: "PUT",
		body: JSON.stringify(config || {}),
	});
export const buscarTemplatesAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/templates`);
export const salvarTemplatesAtendimento = (templates) =>
	requestVpsApi(`${BASE_PATH}/templates`, {
		method: "PUT",
		body: JSON.stringify({ templates: templates || {} }),
	});
export const conectarAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/connect`, { method: "POST", body: "{}" });
export const desconectarAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/disconnect`, { method: "POST", body: "{}" });
export const reiniciarInstanciaAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/instance/reset`, { method: "POST", body: "{}" });
export const configurarWebhookAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/webhook`, { method: "POST", body: "{}" });
export const enviarTesteAtendimento = (payload) =>
	requestVpsApi(`${BASE_PATH}/test`, {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
export const listarCasosAtendimento = (params = {}) =>
	requestVpsApi(query(`${BASE_PATH}/cases`, params));
export const buscarCasoAtendimento = (id) =>
	requestVpsApi(`${BASE_PATH}/cases/${encodeURIComponent(id)}`);
export const atualizarCasoAtendimento = (id, patch) =>
	requestVpsApi(`${BASE_PATH}/cases/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(patch || {}),
	});
export const responderCasoAtendimento = (id, message) =>
	requestVpsApi(`${BASE_PATH}/cases/${encodeURIComponent(id)}/reply`, {
		method: "POST",
		body: JSON.stringify({ message }),
	});
export const listarTecnicosAtendimento = (params = {}) =>
	requestVpsApi(query(`${BASE_PATH}/technicians`, params));
export const atualizarTecnicoAtendimento = (phone, patch) =>
	requestVpsApi(`${BASE_PATH}/technicians/${encodeURIComponent(phone)}`, {
		method: "PATCH",
		body: JSON.stringify(patch || {}),
	});
export const excluirTecnicoAtendimento = (phone) =>
	requestVpsApi(`${BASE_PATH}/technicians/${encodeURIComponent(phone)}`, {
		method: "DELETE",
	});
export const listarAvaliacoesAtendimento = (params = {}) =>
	requestVpsApi(query(`${BASE_PATH}/ratings`, params));
export const listarLogsAtendimento = (params = {}) =>
	requestVpsApi(query(`${BASE_PATH}/logs`, params));
export const listarMensagensAtendimento = (params = {}) =>
	requestVpsApi(query(`${BASE_PATH}/messages`, params));
export const zerarDadosOperacionaisAtendimento = () =>
	requestVpsApi(`${BASE_PATH}/operational-data`, { method: "DELETE" });
