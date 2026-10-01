import { requestRotApi } from "../../../api/rotApi";

function query(filters = {}) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, value);
	}
	return params.toString() ? `?${params}` : "";
}

export function fetchAtivacoesDashboard(filters = {}) {
	return requestRotApi(`/admin/ativacoes/dashboard${query(filters)}`);
}

export function fetchAtivacoesKanban(filters = {}) {
	return requestRotApi(`/admin/ativacoes/kanban${query(filters)}`);
}

export function fetchAtivacoesList(filters = {}) {
	return requestRotApi(`/admin/ativacoes${query(filters)}`);
}

export function fetchAtivacaoDetail(id) {
	return requestRotApi(`/admin/ativacoes/${encodeURIComponent(id)}`);
}

export function fetchAtivacoesFilters() {
	return requestRotApi("/admin/ativacoes/filtros");
}

export function startAtivacoesSync(payload = {}) {
	return requestRotApi("/admin/ativacoes/sync", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function ativacoesExportUrl(filters = {}) {
	return `/api/admin/ativacoes/export.csv${query(filters)}`;
}
