import { requestVpsApi } from "../../../services/vpsApiClient";

export async function listarCargosPermissoes() {
	const response = await requestVpsApi("/admin/roles");
	return {
		roles: response?.roles || [],
		permissions: response?.permissions || [],
	};
}

export async function salvarCargoPermissoes(role) {
	const id = String(role?.id || "")
		.trim()
		.toLowerCase();
	return requestVpsApi(`/admin/roles/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify({
			name: role?.name || id,
			description: role?.description || "",
			active: role?.active !== false,
			permissions: role?.permissions || [],
		}),
	});
}

export async function excluirCargoPermissoes(id) {
	const roleId = String(id || "")
		.trim()
		.toLowerCase();
	return requestVpsApi(`/admin/roles/${encodeURIComponent(roleId)}`, {
		method: "DELETE",
	});
}
