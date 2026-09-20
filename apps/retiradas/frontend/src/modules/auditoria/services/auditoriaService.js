import { requestVpsApi } from "../../../services/vpsApiClient";

function appendParam(params, key, value) {
	const normalized = String(value || "").trim();
	if (normalized) params.set(key, normalized);
}

export async function listarLogsAuditoria(filters = {}) {
	const params = new URLSearchParams();
	appendParam(params, "userId", filters.userId);
	appendParam(params, "setorId", filters.setorId);
	appendParam(params, "module", filters.module);
	appendParam(params, "entity", filters.entity);
	appendParam(params, "action", filters.action);
	appendParam(params, "startDate", filters.startDate);
	appendParam(params, "endDate", filters.endDate);
	appendParam(params, "limit", filters.limit || 50);
	appendParam(params, "offset", filters.offset || 0);

	return requestVpsApi(`/admin/audit-logs?${params.toString()}`);
}

export async function obterLogAuditoria(id) {
	const response = await requestVpsApi(
		`/admin/audit-logs/${encodeURIComponent(String(id || ""))}`,
	);
	return response?.item || null;
}

export async function listarOpcoesLogsAuditoria() {
	return requestVpsApi("/admin/audit-logs/options");
}
