import { getApiBaseUrl, requestVpsApi } from "../../../../services/vpsApiClient";

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

export function competenciaAtual() {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function buscarCancelamentos(params = {}) {
	return requestVpsApi(
		`/service-orders/cancellations${queryString({
			competencia: params.competencia,
			empresa: params.empresa,
			classificacao: params.classificacao,
			tecnologia: params.tecnologia,
			regional: params.regional,
			cidade: params.cidade,
			motivo: params.motivo,
			servico: params.servico,
			q: params.q,
			page: params.page || 1,
			limit: params.limit || 50,
		})}`,
	);
}

export async function buscarResumoCancelamentos(competencia) {
	return requestVpsApi(
		`/service-orders/cancellations/resumo${queryString({ competencia })}`,
	);
}

export async function buscarCompetenciasCancelamentos() {
	return requestVpsApi("/service-orders/cancellations/competencias");
}

export async function buscarFiltrosCancelamentos(competencia) {
	return requestVpsApi(
		`/service-orders/cancellations/filters${queryString({ competencia })}`,
	);
}

export async function buscarHistoricoSyncCancelamentos() {
	return requestVpsApi("/service-orders/cancellations/sync/history?limit=20");
}

export async function sincronizarCompetenciaCancelamentos(competencia) {
	return requestVpsApi("/service-orders/cancellations/sync", {
		method: "POST",
		body: JSON.stringify({ competencia }),
	});
}

export async function sincronizarHistoricoCancelamentos(payload = {}) {
	return requestVpsApi("/service-orders/cancellations/sync/history", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function validarCompetenciaCancelamentos(competencia) {
	return requestVpsApi(
		`/service-orders/cancellations/${encodeURIComponent(competencia)}/validate`,
		{ method: "POST", body: JSON.stringify({}) },
	);
}

export async function buscarDetalheCancelamento(id) {
	return requestVpsApi(
		`/service-orders/cancellations/${encodeURIComponent(id)}`,
	);
}

export function buildCancelamentosExportUrl(params = {}) {
	return `${getApiBaseUrl()}/service-orders/cancellations/export.csv${queryString(params)}`;
}
