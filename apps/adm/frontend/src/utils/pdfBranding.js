const CLUSTER_LOGO_URL = "/logo-adm.png";

let cachedClusterLogoDataUrl = "";

function getImageFormat(dataUrl) {
	if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
	if (dataUrl.startsWith("data:image/webp")) return "WEBP";
	return "PNG";
}

function getImageDimensions(dataUrl) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
		image.onerror = reject;
		image.src = dataUrl;
	});
}

export async function addPdfImageContained(pdf, dataUrl, options = {}) {
	const maxWidth = options.width ?? 80;
	const maxHeight = options.height ?? 40;
	const dimensions = await getImageDimensions(dataUrl);
	const ratio = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
	const width = dimensions.width * ratio;
	const height = dimensions.height * ratio;
	const x = options.align === "right"
		? (options.x ?? 0) + maxWidth - width
		: options.align === "center"
			? (options.x ?? 0) + (maxWidth - width) / 2
			: (options.x ?? 0);
	const y = options.valign === "middle"
		? (options.y ?? 0) + (maxHeight - height) / 2
		: (options.y ?? 0);
	pdf.addImage(dataUrl, getImageFormat(dataUrl), x, y, width, height);
	return { x, y, width, height };
}

async function imageUrlToDataUrl(url) {
	const response = await fetch(url, { cache: "force-cache" });
	if (!response.ok)
		throw new Error("Não foi possível carregar a logo do Administrativo.");
	const blob = await response.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

export async function getClusterLogoDataUrl() {
	if (cachedClusterLogoDataUrl) return cachedClusterLogoDataUrl;
	cachedClusterLogoDataUrl = await imageUrlToDataUrl(CLUSTER_LOGO_URL);
	return cachedClusterLogoDataUrl;
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

		await addPdfImageContained(pdf, dataUrl, { x, y, width, height, align: "right", valign: "middle" });
	} catch (error) {
		console.warn("[pdfBranding] Logo do Administrativo não foi adicionada:", error);
	}
}
