import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, Trash2, UploadCloud } from "lucide-react";
import { confirmRotAttachment, deleteRotAttachment, fetchRotAttachments, requestRotAttachmentUpload } from "../api/rotApi";

const MAX_IMAGES = 10;
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

async function compressImage(file) {
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

export default function ImageUploader({ entityType, entityId, required = false, onCountChange }) {
	const [items, setItems] = useState([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const inputRef = useRef(null);
	const confirmedCount = items.filter((item) => item.status === "CONFIRMED" || item.url).length;
	const remaining = Math.max(0, MAX_IMAGES - confirmedCount);

	const load = async () => {
		if (!entityType || !entityId) return;
		setError("");
		try {
			const data = await fetchRotAttachments(entityType, entityId);
			setItems(data.items || []);
			onCountChange?.((data.items || []).length);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as imagens.");
		}
	};

	useEffect(() => {
		load();
	}, [entityType, entityId]);

	useEffect(() => {
		onCountChange?.(confirmedCount);
	}, [confirmedCount]);

	const uploadOne = async (file) => {
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
	};

	const selectFiles = async (event) => {
		const files = Array.from(event.target.files || []);
		event.target.value = "";
		if (!files.length) return;
		if (remaining <= 0) {
			setError("Limite máximo de 10 fotos atingido.");
			return;
		}
		const accepted = files.slice(0, remaining);
		if (files.length > remaining) setError(`Limite máximo de 10 fotos. Existem ${remaining} vaga(s) disponível(is).`);
		else setError("");
		setBusy(true);
		try {
			for (const file of accepted) {
				const uploaded = await uploadOne(file);
				setItems((current) => [...current, uploaded]);
			}
		} catch (err) {
			setError(err?.message || "Não foi possível enviar a imagem.");
		} finally {
			setBusy(false);
			await load();
		}
	};

	const remove = async (id) => {
		setBusy(true);
		setError("");
		try {
			await deleteRotAttachment(id);
			setItems((current) => current.filter((item) => item.id !== id));
		} catch (err) {
			setError(err?.message || "Não foi possível remover a imagem.");
		} finally {
			setBusy(false);
		}
	};

	const helper = useMemo(() => {
		if (required && confirmedCount === 0) return "Obrigatório anexar pelo menos 1 imagem.";
		if (remaining === 0) return "Limite máximo de 10 fotos atingido.";
		return "As imagens são otimizadas no aparelho e enviadas direto ao storage.";
	}, [required, confirmedCount, remaining]);

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ImageIcon size={18} /></span>
					<div>
						<h3 className="text-sm font-black uppercase text-slate-900">Fotos</h3>
						<p className={`text-xs font-bold ${required && confirmedCount === 0 ? "text-red-600" : "text-slate-500"}`}>{confirmedCount}/10 · {helper}</p>
					</div>
				</div>
				<button
					type="button"
					disabled={busy || remaining === 0}
					onClick={() => inputRef.current?.click()}
					className="rot-btn-tactile inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 text-xs font-black uppercase text-white shadow-sm hover:bg-blue-900 disabled:opacity-60"
				>
					{busy ? <UploadCloud size={16} /> : <Camera size={16} />}
					{busy ? "Enviando..." : "Adicionar foto"}
				</button>
				<input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" onChange={selectFiles} />
			</div>
			{error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p> : null}
			{items.length ? (
				<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
					{items.map((item) => (
						<figure key={item.id} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
							<img src={item.url} alt="Foto anexada" className="aspect-video w-full object-cover" />
							<button type="button" disabled={busy} onClick={() => remove(item.id)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-red-600 shadow-sm disabled:opacity-60" aria-label="Remover foto">
								<Trash2 size={15} />
							</button>
						</figure>
					))}
				</div>
			) : null}
		</section>
	);
}
