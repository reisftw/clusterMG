import { requestVpsApi } from "../../../../services/vpsApiClient";

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

export async function buscarAuditoriaMultas(params = {}) {
	return requestVpsApi(
		`/service-orders/fines/audit${queryString({
			page: params.page || 1,
			limit: params.limit || 500,
			q: params.q,
			start_date: params.startDate,
			end_date: params.endDate,
		})}`,
	);
}

export async function simularAuditoriaMultas(payload = {}) {
	return requestVpsApi("/service-orders/fines/simulate", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}
