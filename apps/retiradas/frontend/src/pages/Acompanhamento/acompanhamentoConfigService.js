import { getVpsDocument, updateVpsDocument } from "../../services/vpsApiClient";

function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

export const ACOMPANHAMENTO_SOUND_MIN_BYTES = 10 * 1024;
export const ACOMPANHAMENTO_SOUND_MAX_BYTES = 1024 * 1024;
export const ACOMPANHAMENTO_SOUND_MAX_ITEMS = 5;
const ACOMPANHAMENTO_SOUND_FORMATS = new Set(["mp3", "wav", "ogg"]);

export async function loadAcompanhamentoConfig() {
	return getVpsDocument("acompanhamento_config/painel").catch(() => null);
}

export async function saveAcompanhamentoConfig(config) {
	await updateVpsDocument("acompanhamento_config/painel", {
		...config,
		updatedAt: new Date().toISOString(),
	});
}

export async function uploadAcompanhamentoAd({ blob, name }) {
	const safeName = String(name || "anuncio.jpg").replace(
		/[^a-zA-Z0-9._-]/g,
		"-",
	);
	return {
		id: crypto.randomUUID(),
		name: safeName || "anuncio.jpg",
		src: await blobToDataUrl(blob),
		storagePath: null,
	};
}

export async function uploadAcompanhamentoSound({ blob, name }) {
	const soundName = String(name || "").trim();
	const extension = String(blob?.name || "")
		.split(".")
		.pop()
		.toLowerCase();
	if (soundName.length < 2 || soundName.length > 60) {
		throw new Error("Informe um nome entre 2 e 60 caracteres.");
	}
	if (!blob || !ACOMPANHAMENTO_SOUND_FORMATS.has(extension)) {
		throw new Error("Envie um arquivo MP3, WAV ou OGG.");
	}
	if (blob.size < ACOMPANHAMENTO_SOUND_MIN_BYTES) {
		throw new Error("O arquivo precisa ter pelo menos 10 KB.");
	}
	if (blob.size > ACOMPANHAMENTO_SOUND_MAX_BYTES) {
		throw new Error("O arquivo pode ter no maximo 1 MB.");
	}
	return {
		id: crypto.randomUUID(),
		name: soundName,
		fileName: blob.name,
		mimeType: blob.type || `audio/${extension}`,
		size: blob.size,
		src: await blobToDataUrl(blob),
	};
}

export async function deleteAcompanhamentoAd() {
	return null;
}
