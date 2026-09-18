// Compressao + upload de imagem, extraido do ImageUploader pra poder
// ser reaproveitado tambem em fluxos que precisam enviar fotos ANTES
// da entidade existir (ex.: criar protocolo SST com fotos no mesmo
// envio, sem depender de um entityId que so existe depois de salvar).
import { confirmRotAttachment, requestRotAttachmentUpload } from "../api/rotApi";

const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1920;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

async function loadBitmap(file) {
	if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Não foi possível ler a imagem."));
		};
		img.src = url;
	});
}

function canvasBlob(canvas, type, quality) {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file) {
	if (!ACCEPTED.has(file.type)) throw new Error("Use apenas JPEG, PNG ou WebP.");
	const bitmap = await loadBitmap(file);
	const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * ratio));
	const height = Math.max(1, Math.round(bitmap.height * ratio));
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { alpha: false });
	ctx.drawImage(bitmap, 0, 0, width, height);
	let blob = await canvasBlob(canvas, "image/webp", 0.8);
	if (!blob || blob.size > MAX_BYTES) blob = await canvasBlob(canvas, "image/webp", 0.68);
	if (!blob || blob.size > MAX_BYTES) throw new Error("A imagem ficou acima de 1 MB após otimização.");
	return {
		blob,
		width,
		height,
		mimeType: "image/webp",
		originalName: file.name || "foto.webp",
	};
}

export async function uploadImage(file, entityType, entityId) {
	const optimized = await compressImage(file);
	const reservation = await requestRotAttachmentUpload({
		entityType,
		entityId,
		file: {
			mimeType: optimized.mimeType,
			sizeBytes: optimized.blob.size,
			width: optimized.width,
			height: optimized.height,
			originalName: optimized.originalName,
		},
	});
	const response = await fetch(reservation.uploadUrl, {
		method: reservation.method || "PUT",
		headers: reservation.headers || { "Content-Type": optimized.mimeType },
		body: optimized.blob,
	});
	if (!response.ok) throw new Error(`Falha no upload da imagem (${response.status}).`);
	return confirmRotAttachment(reservation.attachmentId);
}
