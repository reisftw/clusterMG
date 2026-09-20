import { jsPDF } from "jspdf";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, FileText, Image as ImageIcon, Plus, QrCode, RefreshCw, Trash2, X } from "lucide-react";
import { createRotQrCode, deleteRotQrCode, fetchRotQrCodes, updateRotQrCode } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";

// Gerenciador de QR Codes — marcado P0 pelo usuario ("hiper importante
// mantermos ele funcionando"). Mesmo padrao visual das demais paginas
// administrativas. A imagem do QR usa o gerador publico api.qrserver.com
// (sem dependencia nova no bundle) apontando pra pagina publica /qr/:id
// do proprio Operação.
function qrImageUrl(publicUrl, size = 220) {
	return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(publicUrl)}`;
}

export default function QrCodesPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.qrcodes.manage");
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null); // { qrcode: null | object }

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchRotQrCodes());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os QR Codes.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleDelete = async (qrcode) => {
		if (!window.confirm(`Excluir o QR Code "${qrcode.title}"? Essa ação não pode ser desfeita.`)) return;
		setError("");
		try {
			await deleteRotQrCode(qrcode.id);
			setItems((current) => current.filter((item) => item.id !== qrcode.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o QR Code.");
		}
	};

	const toggleActive = async (qrcode) => {
		setError("");
		try {
			const updated = await updateRotQrCode(qrcode.id, { active: !qrcode.active });
			setItems((current) => current.map((item) => (item.id === qrcode.id ? updated : item)));
		} catch (err) {
			setError(err?.message || "Não foi possível atualizar o QR Code.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<QrCode size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">QR Codes</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} código(s) · páginas públicas de links, sem login.</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={load}
						className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
					>
						<RefreshCw size={16} />
						Atualizar
					</button>
					{canManage ? (
						<button
							type="button"
							onClick={() => setModal({ qrcode: null })}
							className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
						>
							<Plus size={17} /> Novo QR Code
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{items.length ? (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{items.map((qrcode) => (
						<QrCard
							key={qrcode.id}
							qrcode={qrcode}
							onEdit={() => setModal({ qrcode })}
							onDelete={() => handleDelete(qrcode)}
							onToggleActive={() => toggleActive(qrcode)}
							canManage={canManage}
						/>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
					Nenhum QR Code cadastrado ainda.
				</div>
			)}

			{modal ? (
				<QrCodeFormModal
					qrcode={modal.qrcode}
					onClose={() => setModal(null)}
					onCreated={(created) => {
						setItems((current) => [created, ...current]);
						setModal(null);
					}}
					onUpdated={(updated) => {
						setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
						setModal(null);
					}}
				/>
			) : null}
		</div>
	);
}

// Busca o PNG do QR direto via fetch (em vez de capturar o <img> da
// tela com html2canvas) — mais confiavel: um <img> cross-origin pode
// ficar "tainted" (cache do navegador reaproveitando uma carga anterior
// sem CORS pra mesma URL) e quebrar canvas.toDataURL() de forma
// intermitente. fetch() sempre faz a requisicao em modo CORS de
// verdade; o servidor (api.qrserver.com) ja manda
// Access-Control-Allow-Origin: *, entao o blob resultante nunca
// contamina o canvas.
async function fetchQrImageElement(qrId, size = 480) {
	const publicUrl = `${window.location.origin}/qr/${qrId}`;
	const response = await fetch(qrImageUrl(publicUrl, size), { mode: "cors" });
	if (!response.ok) throw new Error("Falha ao buscar a imagem do QR Code.");
	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	try {
		return await new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error("Falha ao carregar a imagem do QR Code."));
			img.src = objectUrl;
		});
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

// Moldura branca ao redor do QR puro, pra ficar bom tanto no PNG solto
// quanto embutido no PDF — mesmo respiro visual que o container da tela
// já tinha.
async function buildQrCanvas(qrId) {
	const img = await fetchQrImageElement(qrId);
	const padding = Math.round(img.width * 0.12);
	const canvas = document.createElement("canvas");
	canvas.width = img.width + padding * 2;
	canvas.height = img.height + padding * 2;
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(img, padding, padding, img.width, img.height);
	return canvas;
}

async function exportQrImage(qrId, title) {
	const canvas = await buildQrCanvas(qrId);
	const link = document.createElement("a");
	link.download = `ROT_GESTAO_${title.replace(/\s+/g, "_")}.png`;
	link.href = canvas.toDataURL("image/png");
	link.click();
}

async function exportQrPdf(qrId, title) {
	const canvas = await buildQrCanvas(qrId);
	const imgData = canvas.toDataURL("image/png");
	const pdf = new jsPDF("p", "mm", "a4");
	pdf.setFillColor(2, 6, 23);
	pdf.rect(0, 0, 210, 15, "F");
	pdf.setFontSize(24);
	pdf.setTextColor(249, 115, 22);
	pdf.text("OPERAÇÃO", 105, 45, { align: "center" });
	pdf.setFontSize(18);
	pdf.setTextColor(2, 6, 23);
	pdf.text(title.toUpperCase(), 105, 60, { align: "center" });
	pdf.setDrawColor(249, 115, 22);
	pdf.line(80, 65, 130, 65);
	pdf.addImage(imgData, "PNG", 55, 85, 100, 100);
	pdf.setFontSize(10);
	pdf.setTextColor(150);
	pdf.text("Este QR Code aponta para o sistema oficial de verificação.", 105, 200, { align: "center" });
	pdf.text("OPERAÇÃO | Cluster MG", 105, 280, { align: "center" });
	pdf.save(`ROT_GESTAO_${title.replace(/\s+/g, "_")}.pdf`);
}

function QrCard({ qrcode, onEdit, onDelete, onToggleActive, canManage }) {
	const [copied, setCopied] = useState(false);
	const [exporting, setExporting] = useState("");
	const [exportError, setExportError] = useState("");
	const publicUrl = `${window.location.origin}/qr/${qrcode.id}`;

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(publicUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			window.prompt("Copie o link:", publicUrl);
		}
	};

	const handleExport = async (kind) => {
		setExporting(kind);
		setExportError("");
		try {
			if (kind === "png") await exportQrImage(qrcode.id, qrcode.title);
			else await exportQrPdf(qrcode.id, qrcode.title);
		} catch {
			setExportError(`Não foi possível gerar o ${kind === "png" ? "PNG" : "PDF"}.`);
		} finally {
			setExporting("");
		}
	};

	return (
		<article className={`rot-card-hover flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm ${qrcode.active ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<h3 className="truncate text-base font-black text-slate-950">{qrcode.title}</h3>
					<p className="mt-0.5 text-xs font-semibold text-slate-400">{qrcode.links.length} link(s)</p>
				</div>
				<span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${qrcode.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
					{qrcode.active ? "Ativo" : "Inativo"}
				</span>
			</div>

			<div className="flex items-center gap-3">
				<div id={`qr-container-${qrcode.id}`} className="shrink-0 rounded-lg border border-slate-100 bg-white p-1">
					<img src={qrImageUrl(publicUrl, 96)} crossOrigin="anonymous" alt={`QR Code de ${qrcode.title}`} className="h-20 w-20 block" />
				</div>
				<div className="min-w-0 flex-1 space-y-1">
					{qrcode.links.slice(0, 3).map((link, index) => (
						<p key={index} className="truncate text-xs font-semibold text-slate-500">
							{link.label}
						</p>
					))}
					{qrcode.links.length > 3 ? <p className="text-xs font-bold text-blue-600">+{qrcode.links.length - 3} mais</p> : null}
				</div>
			</div>

			{exportError ? <p className="text-[11px] font-bold text-red-600">{exportError}</p> : null}

			<div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
				<span>{qrcode.visits} visita(s)</span>
				<div className="flex gap-1">
					<button type="button" onClick={copyLink} title="Copiar link" className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
						{copied ? <Check size={15} /> : <Copy size={15} />}
					</button>
					<a href={publicUrl} target="_blank" rel="noreferrer" title="Abrir página pública" className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
						<ExternalLink size={15} />
					</a>
					{canManage ? (
						<button type="button" onClick={onToggleActive} title={qrcode.active ? "Desativar" : "Ativar"} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600">
							{qrcode.active ? <EyeOff size={15} /> : <Eye size={15} />}
						</button>
					) : null}
				</div>
			</div>

			<div className="flex flex-wrap justify-end gap-2">
				<button type="button" disabled={Boolean(exporting)} onClick={() => handleExport("png")} className="rot-btn-tactile inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
					<ImageIcon size={14} /> {exporting === "png" ? "Gerando..." : "PNG"}
				</button>
				<button type="button" disabled={Boolean(exporting)} onClick={() => handleExport("pdf")} className="rot-btn-tactile inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
					<FileText size={14} /> {exporting === "pdf" ? "Gerando..." : "PDF"}
				</button>
				{canManage ? (
					<>
						<button type="button" onClick={onEdit} className="rot-btn-tactile rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
							Editar
						</button>
						<button type="button" onClick={onDelete} className="rot-btn-tactile rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100">
							Excluir
						</button>
					</>
				) : null}
			</div>
		</article>
	);
}

function QrCodeFormModal({ qrcode, onClose, onCreated, onUpdated }) {
	const isEdit = Boolean(qrcode);
	const [title, setTitle] = useState(qrcode?.title || "");
	const [links, setLinks] = useState(qrcode?.links?.length ? qrcode.links : [{ label: "", url: "" }]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const setLink = (index, field, value) =>
		setLinks((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

	const addLink = () => setLinks((current) => [...current, { label: "", url: "" }]);
	const removeLink = (index) => setLinks((current) => current.filter((_, i) => i !== index));

	const submit = async (event) => {
		event.preventDefault();
		const validLinks = links.filter((link) => link.label.trim() && link.url.trim());
		if (!title.trim() || !validLinks.length) {
			setError("Informe um título e pelo menos um link com rótulo e URL.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			if (isEdit) {
				const updated = await updateRotQrCode(qrcode.id, { title: title.trim(), links: validLinks });
				onUpdated(updated);
			} else {
				const created = await createRotQrCode({ title: title.trim(), links: validLinks });
				onCreated(created);
			}
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o QR Code.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell
			open
			title={isEdit ? "Editar QR Code" : "Novo QR Code"}
			description="A página pública mostra o título e a lista de links, sem exigir login."
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><QrCode size={22} /></span>}
			onClose={onClose}
			size="md"
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Título</span>
					<input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						autoFocus
						placeholder="Ex.: Materiais — Base Sul"
						className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>

				<div>
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Links</span>
					<div className="space-y-2">
						{links.map((link, index) => (
							<div key={index} className="flex gap-2">
								<input
									value={link.label}
									onChange={(event) => setLink(index, "label", event.target.value)}
									placeholder="Rótulo"
									className="h-10 w-32 shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								/>
								<input
									value={link.url}
									onChange={(event) => setLink(index, "url", event.target.value)}
									placeholder="https://..."
									className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
								/>
								<button
									type="button"
									onClick={() => removeLink(index)}
									disabled={links.length === 1}
									title="Remover link"
									className="rot-btn-tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
								>
									<X size={16} />
								</button>
							</div>
						))}
					</div>
					<button type="button" onClick={addLink} className="rot-btn-tactile mt-2 inline-flex items-center gap-1.5 text-xs font-black text-blue-600 hover:underline">
						<Plus size={14} /> Adicionar link
					</button>
				</div>

				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
						Cancelar
					</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar QR Code"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}
