import { requestVpsApi } from "../../../../services/vpsApiClient";

function queryString(params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") {
			query.set(key, value);
		}
	});
	const value = query.toString();
	return value ? `?${value}` : "";
}

export async function criarSolicitacaoOrdemServico(
	clientCode,
	technician = null,
) {
	const selected =
		technician && typeof technician === "object"
			? technician
			: { name: String(technician || "") };
	return requestVpsApi("/service-orders/requests", {
		method: "POST",
		body: JSON.stringify({
			clientCode,
			technicianHubsoftId: selected.id || null,
			technicianHubsoftName: selected.name || "",
		}),
	});
}

export async function buscarTecnicosSolicitacao() {
	return requestVpsApi("/service-orders/requests/technicians");
}

export async function atualizarTecnicosSolicitacao() {
	return requestVpsApi("/service-orders/requests/technicians/refresh", {
		method: "POST",
	});
}

export async function criarSolicitacaoPorEquipamento(mac, technician) {
	return requestVpsApi("/service-orders/requests/equipment", {
		method: "POST",
		body: JSON.stringify({
			mac,
			technicianHubsoftId: technician?.id || null,
			technicianHubsoftName: technician?.name || "",
		}),
	});
}

export async function buscarSolicitacaoOrdemServico(id) {
	return requestVpsApi(`/service-orders/requests/${encodeURIComponent(id)}`);
}

export async function buscarMinhasSolicitacoes(limit = 10) {
	return requestVpsApi(
		`/service-orders/requests/mine${queryString({ limit })}`,
	);
}

export async function buscarHistoricoSolicitacoes(params = {}) {
	return requestVpsApi(
		`/service-orders/requests/history${queryString({
			page: params.page || 1,
			limit: params.limit || 20,
			q: params.q,
			status: params.status,
		})}`,
	);
}
