import { getApiBaseUrl } from "../../services/vpsApiClient";

export function normalizeMacInput(value) {
	return String(value || "")
		.replace(/[^a-fA-F0-9]/g, "")
		.toUpperCase()
		.slice(0, 12);
}

export async function consultarMacPublico(mac) {
	const normalized = normalizeMacInput(mac);
	const params = new URLSearchParams({ mac: normalized });
	const response = await fetch(
		`${getApiBaseUrl()}/public/sempre/equipment?${params.toString()}`,
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
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

	return data;
}
