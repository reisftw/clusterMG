export async function listarEnviosDocumentos() {
	return [];
}

export async function obterCobrancaDocumentos() {
	return null;
}

export async function listarPastaDriveEmpresa() {
	return { ok: true, items: [], folder: null };
}

export async function criarPastaEmpresa() {
	return { ok: true, folder: null, items: [] };
}

export async function baixarDriveItemEmpresa() {
	throw new Error("Arquivo não disponível na Operação.");
}

export async function carregarDriveItemEmpresaUrl() {
	throw new Error("Pré-visualização não disponível na Operação.");
}

export async function baixarEnvioDocumentosZip() {
	throw new Error("ZIP não disponível na Operação.");
}
