export const AVATAR_MAX_BYTES = 600 * 1024;
export const AVATAR_ACCEPT = "image/png,image/jpeg";

export function validateImageFile(file, { maxBytes = AVATAR_MAX_BYTES } = {}) {
	if (!file) throw new Error("Selecione uma imagem.");
	if (!["image/png", "image/jpeg"].includes(file.type)) {
		throw new Error("Use apenas imagem JPG ou PNG.");
	}
	if (file.size > maxBytes) {
		throw new Error(
			`A imagem deve ter no máximo ${Math.round(maxBytes / 1024)} KB.`,
		);
	}
}

export function fileToDataUrl(file, options = {}) {
	validateImageFile(file, options);
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
		reader.readAsDataURL(file);
	});
}
