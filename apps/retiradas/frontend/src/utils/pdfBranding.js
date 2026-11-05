const REVO_LOGO_URL = "/brand/revo/revo_logo_horizontal_dark_700px.png";

let cachedRevoLogoDataUrl = "";

function getImageFormat(dataUrl) {
	if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
	if (dataUrl.startsWith("data:image/webp")) return "WEBP";
	return "PNG";
}

async function imageUrlToDataUrl(url) {
	const response = await fetch(url, { cache: "force-cache" });
	if (!response.ok)
		throw new Error("Não foi possível carregar a logo REVO.");
	const blob = await response.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

export async function getClusterLogoDataUrl() {
	if (cachedRevoLogoDataUrl) return cachedRevoLogoDataUrl;
	cachedRevoLogoDataUrl = await imageUrlToDataUrl(REVO_LOGO_URL);
	return cachedRevoLogoDataUrl;
}

export async function addClusterLogo(pdf, options = {}) {
	try {
		const pageWidth = pdf.internal.pageSize.getWidth();
		const unitScale = pageWidth > 400 ? "pt" : "mm";
		const width = options.width ?? (unitScale === "pt" ? 76 : 26);
		const height = options.height ?? (unitScale === "pt" ? 38 : 13);
		const marginRight = options.marginRight ?? (unitScale === "pt" ? 36 : 12);
		const x = options.x ?? pageWidth - marginRight - width;
		const y = options.y ?? (unitScale === "pt" ? 18 : 7);
		const dataUrl = await getClusterLogoDataUrl();

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
		console.warn("[pdfBranding] Logo REVO não foi adicionada:", error);
	}
}
