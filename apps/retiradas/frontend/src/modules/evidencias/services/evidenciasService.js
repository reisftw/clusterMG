import { requestVpsApi } from "../../../services/vpsApiClient";

export function buscarDashboardEvidencias() {
	return requestVpsApi("/evidencias/dashboard");
}

export function buscarEvidencias(filters = {}) {
	const params = new URLSearchParams();
	Object.entries(filters).forEach(([key, value]) => {
		if (value !== undefined && value !== null && String(value).trim() !== "") {
			params.set(key, String(value));
		}
	});
	return requestVpsApi(`/evidencias?${params.toString()}`);
}

export function buscarEvidencia(id) {
	return requestVpsApi(`/evidencias/${encodeURIComponent(id)}`);
}

export function tentarNovamenteEvidencia(id, stepType) {
	return requestVpsApi(`/evidencias/${encodeURIComponent(id)}/retry`, {
		method: "POST",
		body: JSON.stringify({ stepType }),
	});
}
