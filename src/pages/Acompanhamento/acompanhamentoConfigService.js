import { getVpsDocument, updateVpsDocument } from "../../services/vpsApiClient";

function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

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

export async function deleteAcompanhamentoAd() {
	return null;
}
