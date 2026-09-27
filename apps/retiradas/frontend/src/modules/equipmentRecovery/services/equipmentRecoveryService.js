import { getApiBaseUrl, requestVpsApi } from "../../../services/vpsApiClient";

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

export function buscarImpactoRecuperacao(params) {
	return requestVpsApi(`/equipment-recovery/impact${queryString(params)}`);
}

export function buscarResumoRecuperacao(params) {
	return requestVpsApi(`/equipment-recovery/summary${queryString(params)}`);
}

export function buscarTecnicosRecuperacao(params) {
	return requestVpsApi(`/equipment-recovery/technicians${queryString(params)}`);
}

export function buscarRegistrosRecuperacao(params) {
	return requestVpsApi(`/equipment-recovery/records${queryString(params)}`);
}

export function buscarPendenciasRecuperacao(params) {
	return requestVpsApi(`/equipment-recovery/pending${queryString(params)}`);
}

export function buscarOpcoesRecuperacao(params) {
	return requestVpsApi(`/equipment-recovery/options${queryString(params)}`);
}

export function reprocessarRecuperacao(payload) {
	return requestVpsApi("/equipment-recovery/reprocess", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}

export function buscarJobRecuperacao(jobId) {
	return requestVpsApi(`/equipment-recovery/jobs/${jobId}`);
}

export function buscarUltimoJobRecuperacao() {
	return requestVpsApi("/equipment-recovery/jobs/latest");
}

export function urlExportPendencias(params) {
	return `${getApiBaseUrl()}/equipment-recovery/pending.csv${queryString(params)}`;
}
