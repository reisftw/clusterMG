import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, MessageSquare, Plus, RefreshCw, Trash2 } from "lucide-react";
import { createRotNotice, deleteRotNotice, fetchRotNotices, fetchRotRegionals } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";

function formatDate(value) {
	if (!value) return "";
	return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Fiel a rot/src/pages/NoticesPage.tsx — quadro de avisos com imagem
// opcional, alvo GLOBAL ou por regional.
export default function NoticesPage() {
	const [items, setItems] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [showForm, setShowForm] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [notices, regionalList] = await Promise.all([fetchRotNotices(), fetchRotRegionals()]);
			setItems(notices);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os avisos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleDelete = async (notice) => {
		if (!window.confirm(`Excluir o aviso "${notice.title}"?`)) return;
		setError("");
		try {
			await deleteRotNotice(notice.id);
			setItems((current) => current.filter((item) => item.id !== notice.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o aviso.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<MessageSquare size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Quadro de Avisos</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} aviso(s) publicado(s).</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					<button type="button" onClick={() => setShowForm(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
						<Plus size={17} /> Novo Aviso
					</button>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="space-y-4">
				{items.length ? (
					items.map((notice) => (
						<article key={notice.id} className="rot-card-hover flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row">
							{notice.imageUrl ? (
								<div className="h-48 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 md:w-48">
									<img src={notice.imageUrl} className="h-full w-full object-cover" alt={notice.title} />
								</div>
							) : null}
							<div className="min-w-0 flex-1">
								<div className="mb-2 flex items-start justify-between gap-3">
									<h3 className="text-xl font-black text-slate-900">{notice.title}</h3>
									<div className="flex shrink-0 items-center gap-2">
										<span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">{formatDate(notice.createdAt)}</span>
										<button type="button" onClick={() => handleDelete(notice)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
											<Trash2 size={15} />
										</button>
									</div>
								</div>
								<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{notice.content}</p>
								<div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-400">
									<span>Por: {notice.createdByName || "Sistema"}</span>
									<span>•</span>
									<span>{notice.targetRegionalId === "GLOBAL" ? "Para Todos" : regionals.find((r) => r.id === notice.targetRegionalId)?.name || "Regional"}</span>
								</div>
							</div>
						</article>
					))
				) : (
					<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum aviso encontrado.</div>
				)}
			</div>

			{showForm ? (
				<NoticeFormModal
					regionals={regionals}
					onClose={() => setShowForm(false)}
					onCreated={(created) => {
						setItems((current) => [created, ...current]);
						setShowForm(false);
					}}
				/>
			) : null}
		</div>
	);
}

function NoticeFormModal({ regionals, onClose, onCreated }) {
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [targetRegionalId, setTargetRegionalId] = useState("GLOBAL");
	const [imageFile, setImageFile] = useState(null);
	const [preview, setPreview] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const fileRef = useRef(null);

	const handleFile = (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setImageFile(file);
		setPreview(URL.createObjectURL(file));
	};

	const submit = async (event) => {
		event.preventDefault();
		if (!title.trim()) {
			setError("Informe um título para o aviso.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const created = await createRotNotice({ title: title.trim(), content, targetRegionalId, imageFile });
			onCreated(created);
		} catch (err) {
			setError(err?.message || "Não foi possível publicar o aviso.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell
			open
			title="Novo aviso"
			description="Visível no quadro de avisos para os destinatários selecionados."
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><MessageSquare size={22} /></span>}
			onClose={onClose}
			size="lg"
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Título</span>
					<input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Conteúdo</span>
					<textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Destinatário</span>
					<select value={targetRegionalId} onChange={(e) => setTargetRegionalId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						<option value="GLOBAL">Para todos</option>
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
				</label>
				<div>
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Imagem (opcional)</span>
					<button type="button" onClick={() => fileRef.current?.click()} className="rot-btn-tactile flex h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-400 hover:border-orange-300 hover:text-orange-600">
						{preview ? <img src={preview} alt="Prévia" className="h-full w-24 rounded-lg object-cover" /> : <><ImageIcon size={20} /> Selecionar imagem</>}
					</button>
					<input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
				</div>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
						{saving ? "Publicando..." : "Publicar aviso"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}
