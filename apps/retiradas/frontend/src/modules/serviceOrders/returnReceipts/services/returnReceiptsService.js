import { getApiBaseUrl, requestVpsApi } from "../../../../services/vpsApiClient";
import { getVpsAuthToken } from "../../../../services/vpsAuthSession";

function queryString(params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") query.set(key, value);
	});
	return query.toString();
}

export async function consultarComprovante(clientCode) {
	return requestVpsApi(
		`/service-orders/return-receipts/lookup?${queryString({ clientCode })}`,
	);
}

export async function gerarComprovante(clientCode) {
	return requestVpsApi("/service-orders/return-receipts", {
		method: "POST",
		body: JSON.stringify({ clientCode }),
	});
}

export async function listarMeusComprovantes(limit = 20) {
	return requestVpsApi(
		`/service-orders/return-receipts/mine?${queryString({ limit })}`,
	);
}

export async function listarHistoricoComprovantes(params = {}) {
	return requestVpsApi(
		`/service-orders/return-receipts/history?${queryString({
			page: params.page || 1,
			limit: params.limit || 20,
			q: params.q,
		})}`,
	);
}

export async function baixarComprovante(item) {
	const token = getVpsAuthToken();
	const response = await fetch(
		`${getApiBaseUrl()}/service-orders/return-receipts/${encodeURIComponent(item.id)}/download`,
		{
			cache: "no-store",
			credentials: "include",
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		},
	);
	if (!response.ok) {
		let message = `Erro HTTP ${response.status}.`;
		try {
			const body = await response.json();
			message = body?.error || message;
		} catch {
			// A resposta de erro pode nao ser JSON.
		}
		throw new Error(message);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = item.filename || "comprovante-de-devolucao.pdf";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
