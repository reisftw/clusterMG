import { getApiBaseUrl, requestVpsApi } from "../../../services/vpsApiClient";
import {
	getVpsAuthToken,
	getVpsCsrfToken,
} from "../../../services/vpsAuthSession";

export async function listarDocumentos({
	status,
	empresaId,
	limit = 20,
	offset = 0,
} = {}) {
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset),
	});
	if (status) params.set("status", status);
	if (empresaId) params.set("empresaId", empresaId);
	const response = await requestVpsApi(`/documentos?${params.toString()}`);
	return response?.items || [];
}

export async function listarCamposDocumentos({ includeInactive = false } = {}) {
	const response = await requestVpsApi(
		`/documentos/fields?includeInactive=${includeInactive ? "true" : "false"}`,
	);
	return response?.items || [];
}

export async function salvarCampoDocumento(field) {
	const response = await requestVpsApi("/documentos/fields", {
		method: "POST",
		body: JSON.stringify(field),
	});
	return response?.field;
}

export async function listarCamposNotasFiscais({
	includeInactive = false,
} = {}) {
	const response = await requestVpsApi(
		`/documentos/invoice-fields?includeInactive=${includeInactive ? "true" : "false"}`,
	);
	return response?.items || [];
}

export async function salvarCampoNotaFiscal(field) {
	const response = await requestVpsApi("/documentos/invoice-fields", {
		method: "POST",
		body: JSON.stringify(field),
	});
	return response?.field;
}

export async function obterCobrancaDocumentos() {
	return requestVpsApi("/documentos/billing-config");
}

export async function salvarCobrancaDocumentos(config) {
	const response = await requestVpsApi("/documentos/billing-config", {
		method: "POST",
		body: JSON.stringify(config),
	});
	return response?.config;
}

export async function limparHistoricoDocumentos({
	confirmation,
	deleteDriveFiles = false,
	resetFolders = false,
}) {
	return requestVpsApi("/documentos/admin/purge-history", {
		method: "POST",
		body: JSON.stringify({ confirmation, deleteDriveFiles, resetFolders }),
	});
}

export async function listarEnviosDocumentos({
	status,
	mine = false,
	empresaId,
	limit = 20,
	offset = 0,
} = {}) {
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset),
	});
	if (status) params.set("status", status);
	if (mine) params.set("mine", "true");
	if (empresaId) params.set("empresaId", empresaId);
	const response = await requestVpsApi(
		`/documentos/submissions?${params.toString()}`,
	);
	return response?.items || [];
}

export async function listarTratativasDocumentos({
	limit = 20,
	offset = 0,
} = {}) {
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset),
	});
	const response = await requestVpsApi(
		`/documentos/submissions/tratativas?${params.toString()}`,
	);
	return response?.items || [];
}

export async function obterEnvioDocumento(id) {
	return requestVpsApi(`/documentos/submissions/${encodeURIComponent(id)}`);
}

export async function enviarDocumentosMensais({ mesReferencia, filesByField }) {
	const formData = new FormData();
	const fieldIds = [];
	formData.append("mesReferencia", mesReferencia);
	filesByField.forEach(({ fieldId, file }) => {
		if (!file) return;
		fieldIds.push(fieldId);
		formData.append("files", file);
	});
	formData.append("fieldIds", JSON.stringify(fieldIds));
	return requestVpsApi("/documentos/submissions", {
		method: "POST",
		body: formData,
	});
}

export async function enviarNotasFiscaisMensais({
	submissionId,
	filesByField,
}) {
	const formData = new FormData();
	const fieldIds = [];
	const valores = [];
	filesByField.forEach(({ fieldId, file, valor }) => {
		if (!file) return;
		fieldIds.push(fieldId);
		valores.push(valor);
		formData.append("files", file);
	});
	formData.append("fieldIds", JSON.stringify(fieldIds));
	formData.append("valores", JSON.stringify(valores));
	return requestVpsApi(
		`/documentos/submissions/${encodeURIComponent(submissionId)}/invoices`,
		{
			method: "POST",
			body: formData,
		},
	);
}

export async function revisarEnvioDocumento(id, { status, motivo = "" }) {
	return requestVpsApi(
		`/documentos/submissions/${encodeURIComponent(id)}/review`,
		{
			method: "PATCH",
			body: JSON.stringify({ status, motivo }),
		},
	);
}

export async function obterStatusGoogleDrive() {
	return requestVpsApi("/documentos/google/status");
}

export async function obterConfigGoogleDrive() {
	return requestVpsApi("/documentos/google/config");
}

export async function salvarConfigGoogleDrive(config) {
	return requestVpsApi("/documentos/google/config", {
		method: "POST",
		body: JSON.stringify(config),
	});
}

export async function conectarGoogleDrive() {
	const response = await requestVpsApi("/documentos/google/auth-url");
	if (!response?.url)
		throw new Error("Backend não retornou URL de autorização do Google.");
	window.location.href = response.url;
}

export async function criarPastaEmpresa(empresaId) {
	return requestVpsApi(`/documentos/folders/${encodeURIComponent(empresaId)}`, {
		method: "POST",
		body: JSON.stringify({}),
	});
}

export async function criarSubpastaEmpresa(empresaId, name) {
	return requestVpsApi(
		`/documentos/folders/${encodeURIComponent(empresaId)}/subfolders`,
		{
			method: "POST",
			body: JSON.stringify({ name }),
		},
	);
}

export async function listarPastaDriveEmpresa(empresaId, folderId = "") {
	const params = new URLSearchParams();
	if (folderId) params.set("folderId", folderId);
	const suffix = params.toString() ? `?${params.toString()}` : "";
	return requestVpsApi(
		`/documentos/folders/${encodeURIComponent(empresaId)}/browser${suffix}`,
	);
}

function buildDriveItemUrl(empresaId, item, folderId = "", inline = false) {
	const params = new URLSearchParams();
	if (folderId) params.set("folderId", folderId);
	if (inline) params.set("inline", "true");
	const suffix = params.toString() ? `?${params.toString()}` : "";
	return `${getApiBaseUrl()}/documentos/folders/${encodeURIComponent(empresaId)}/browser/${encodeURIComponent(item.id)}/download${suffix}`;
}

export async function enviarDocumento({ empresaId, tipo, file }) {
	const formData = new FormData();
	formData.append("empresaId", empresaId);
	formData.append("tipo", tipo || "");
	formData.append("file", file);
	return requestVpsApi("/documentos/upload", {
		method: "POST",
		body: formData,
	});
}

export async function renomearDocumento(id, name) {
	return requestVpsApi(`/documentos/${encodeURIComponent(id)}/rename`, {
		method: "PATCH",
		body: JSON.stringify({ name }),
	});
}

export async function alterarStatusDocumento(id, status, motivo = "") {
	return requestVpsApi(`/documentos/${encodeURIComponent(id)}/approval`, {
		method: "PATCH",
		body: JSON.stringify({ status, motivo }),
	});
}

export async function excluirDocumento(id) {
	return requestVpsApi(`/documentos/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function baixarDocumento(documento) {
	const token = getVpsAuthToken();
	const response = await fetch(
		`${getApiBaseUrl()}/documentos/${encodeURIComponent(documento.id)}/download`,
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(getVpsCsrfToken() ? { "X-CSRF-Token": getVpsCsrfToken() } : {}),
			},
		},
	);
	if (!response.ok) {
		let data = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = documento.nome || "documento";
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export async function baixarDriveItemEmpresa(empresaId, item, folderId = "") {
	const token = getVpsAuthToken();
	const response = await fetch(buildDriveItemUrl(empresaId, item, folderId), {
		cache: "no-store",
		credentials: "include",
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(getVpsCsrfToken() ? { "X-CSRF-Token": getVpsCsrfToken() } : {}),
		},
	});
	if (!response.ok) {
		let data = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = item.name || "documento";
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export async function carregarDriveItemEmpresaUrl(
	empresaId,
	item,
	folderId = "",
) {
	const token = getVpsAuthToken();
	const response = await fetch(
		buildDriveItemUrl(empresaId, item, folderId, true),
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(getVpsCsrfToken() ? { "X-CSRF-Token": getVpsCsrfToken() } : {}),
			},
		},
	);
	if (!response.ok) {
		let data = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	const blob = await response.blob();
	return URL.createObjectURL(blob);
}

export async function baixarEnvioDocumentosZip(submission) {
	const token = getVpsAuthToken();
	const response = await fetch(
		`${getApiBaseUrl()}/documentos/submissions/${encodeURIComponent(submission.id)}/zip`,
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(getVpsCsrfToken() ? { "X-CSRF-Token": getVpsCsrfToken() } : {}),
			},
		},
	);
	if (!response.ok) {
		let data = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${submission.empresaNome || "Empresa"} - ${submission.mesReferencia || "documentos"}.zip`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export async function carregarDocumentoUrl(documento) {
	const token = getVpsAuthToken();
	const response = await fetch(
		`${getApiBaseUrl()}/documentos/${encodeURIComponent(documento.id)}/download`,
		{
			cache: "no-store",
			credentials: "include",
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(getVpsCsrfToken() ? { "X-CSRF-Token": getVpsCsrfToken() } : {}),
			},
		},
	);
	if (!response.ok) {
		let data = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	const blob = await response.blob();
	return URL.createObjectURL(blob);
}
