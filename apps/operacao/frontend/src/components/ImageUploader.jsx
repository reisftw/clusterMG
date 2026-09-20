import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, Trash2, UploadCloud } from "lucide-react";
import { deleteRotAttachment, fetchRotAttachments } from "../api/rotApi";
import { uploadImage } from "../utils/imageUpload";

const MAX_IMAGES = 10;

export default function ImageUploader({ entityType, entityId, required = false, minImages = 0, maxImages = MAX_IMAGES, onCountChange }) {
	const [items, setItems] = useState([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const inputRef = useRef(null);
	const confirmedCount = items.filter((item) => item.status === "CONFIRMED" || item.url).length;
	const remaining = Math.max(0, maxImages - confirmedCount);

	// onCountChange vem do componente pai e nem sempre chega memoizado — um
	// ref sempre atualizado evita que a identidade dele force o efeito de
	// carregar imagens a rodar de novo a cada render (ver mensagem do
	// eslint-plugin-react-hooks: "se onCountChange muda com frequencia,
	// envolva a definicao no pai em useCallback" — preferimos nao depender
	// disso em varios pontos de chamada, ja que o valor mais recente do
	// callback e sempre lido via ref no momento da chamada).
	const onCountChangeRef = useRef(onCountChange);
	useEffect(() => {
		onCountChangeRef.current = onCountChange;
	}, [onCountChange]);

	const load = useCallback(async () => {
		if (!entityType || !entityId) return;
		setError("");
		try {
			const data = await fetchRotAttachments(entityType, entityId);
			setItems(data.items || []);
			onCountChangeRef.current?.((data.items || []).length);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as imagens.");
		}
	}, [entityType, entityId]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		onCountChangeRef.current?.(confirmedCount);
	}, [confirmedCount]);

	const selectFiles = async (event) => {
		const files = Array.from(event.target.files || []);
		event.target.value = "";
		if (!files.length) return;
		if (remaining <= 0) {
			setError(`Limite máximo de ${maxImages} fotos atingido.`);
			return;
		}
		const accepted = files.slice(0, remaining);
		if (files.length > remaining) setError(`Limite máximo de ${maxImages} fotos. Existem ${remaining} vaga(s) disponível(is).`);
		else setError("");
		setBusy(true);
		try {
			for (const file of accepted) {
				const uploaded = await uploadImage(file, entityType, entityId);
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
		if (minImages > 0 && confirmedCount < minImages) return `Obrigatório anexar pelo menos ${minImages} imagem(ns).`;
		if (required && confirmedCount === 0) return "Obrigatório anexar pelo menos 1 imagem.";
		if (remaining === 0) return `Limite máximo de ${maxImages} fotos atingido.`;
		return "As imagens são otimizadas no aparelho e enviadas direto ao storage.";
	}, [required, confirmedCount, remaining, minImages, maxImages]);

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ImageIcon size={18} /></span>
					<div>
						<h3 className="text-sm font-black uppercase text-slate-900">Fotos</h3>
						<p className={`text-xs font-bold ${(minImages > 0 && confirmedCount < minImages) || (required && confirmedCount === 0) ? "text-red-600" : "text-slate-500"}`}>{confirmedCount}/{maxImages} · {helper}</p>
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
				<input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectFiles} />
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
