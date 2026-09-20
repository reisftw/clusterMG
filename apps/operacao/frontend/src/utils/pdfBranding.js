const CLUSTER_LOGO_URL = "/sempre-logo-documento.webp";

let cachedClusterLogoDataUrl = "";
let cachedClusterLogoAspect = 0; // height / width da imagem real

function getImageFormat(dataUrl) {
	if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
	if (dataUrl.startsWith("data:image/webp")) return "WEBP";
	return "PNG";
}

async function imageUrlToDataUrl(url) {
	const response = await fetch(url, { cache: "force-cache" });
	if (!response.ok)
		throw new Error("Não foi possível carregar a logo da Sempre Internet.");
	const blob = await response.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

function loadImageAspect(dataUrl) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1);
		img.onerror = reject;
		img.src = dataUrl;
	});
}

export async function getClusterLogoDataUrl() {
	if (cachedClusterLogoDataUrl) return cachedClusterLogoDataUrl;
	cachedClusterLogoDataUrl = await imageUrlToDataUrl(CLUSTER_LOGO_URL);
	return cachedClusterLogoDataUrl;
}

// addClusterLogo sempre desenhava numa caixa larga fixa (~2:1) mesmo a
// logo real sendo um PNG quadrado (240x240) — ficava visivelmente
// achatada em todo PDF que usa esse helper (bug real visto em
// producao). Agora a altura e sempre derivada da largura pela
// proporcao REAL da imagem, nunca de um valor fixo adivinhado.
export async function addClusterLogo(pdf, options = {}) {
	try {
		const pageWidth = pdf.internal.pageSize.getWidth();
		const unitScale = pageWidth > 400 ? "pt" : "mm";
		const width = options.width ?? (unitScale === "pt" ? 38 : 13);
		const marginRight = options.marginRight ?? (unitScale === "pt" ? 36 : 12);
		const dataUrl = await getClusterLogoDataUrl();
		if (!cachedClusterLogoAspect) cachedClusterLogoAspect = await loadImageAspect(dataUrl);
		const height = Math.round(width * cachedClusterLogoAspect * 100) / 100;
		const x = options.x ?? pageWidth - marginRight - width;
		const y = options.y ?? (unitScale === "pt" ? 18 : 7);

		if (options.background !== false) {
			const padding = options.padding ?? (unitScale === "pt" ? 5 : 1.5);
			const radius = options.radius ?? (unitScale === "pt" ? 8 : 2);
			pdf.setFillColor(255, 255, 255);
			pdf.roundedRect(
				x - padding,
				y - padding,
				width + padding * 2,
				height + padding * 2,
				radius,
				radius,
				"F",
			);
		}

		pdf.addImage(dataUrl, getImageFormat(dataUrl), x, y, width, height);
	} catch (error) {
		console.warn("[pdfBranding] Logo da Sempre Internet não foi adicionada:", error);
	}
}
