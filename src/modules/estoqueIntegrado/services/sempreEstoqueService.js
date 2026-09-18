import { requestVpsApi } from "../../../services/vpsApiClient";

export function normalizeMacInput(value) {
	return String(value || "")
		.replace(/[^a-fA-F0-9]/g, "")
		.toUpperCase()
		.slice(0, 12);
}

export async function consultarEquipamentoSempre(mac) {
	const normalized = normalizeMacInput(mac);
	const params = new URLSearchParams({ mac: normalized });
	return requestVpsApi(`/integrations/sempre/equipment?${params.toString()}`);
}

export async function consultarHistoricoSempre(
	mac,
	{ limit = 20, page = 1 } = {},
) {
	const normalized = normalizeMacInput(mac);
	const params = new URLSearchParams({
		mac: normalized,
		limit: String(limit),
		page: String(page),
	});
	return requestVpsApi(
		`/integrations/sempre/equipment/history?${params.toString()}`,
	);
}

export async function listarEquipamentosMapaSempre({
	limit = 20,
	page = 1,
	refresh = false,
	filters = {},
} = {}) {
	const params = new URLSearchParams({
		limit: String(limit),
		page: String(page),
	});
	if (refresh) params.set("refresh", "true");
	Object.entries(filters || {}).forEach(([key, value]) => {
		const normalized = String(value || "").trim();
		if (normalized) params.set(key, normalized);
	});
	return requestVpsApi(
		`/integrations/sempre/equipment/mapa?${params.toString()}`,
	);
}

export async function salvarTratativaEquipamentoSempre(payload) {
	return requestVpsApi("/integrations/sempre/equipment/treatments", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});
}
