import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, ClipboardList, HardHat, Plus, Search, Trash2 } from "lucide-react";
import { createSstProtocol, fetchSstProtocols } from "../../api/rotApi";
import Field from "../../components/ui/Field";
import ModalShell from "../../components/ui/ModalShell";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";
import { uploadImage } from "../../utils/imageUpload";
import {
	CONSEQUENCE_OPTIONS,
	MAX_REQUEST_PHOTOS,
	MIN_REQUEST_PHOTOS,
	PRIORITY_BADGE,
	PRIORITY_OPTIONS,
	STATUS_BADGE,
	STATUS_OPTIONS,
	TYPE_OPTIONS,
	statusLabel,
	typeLabel,
} from "./sstProtocolConstants";

export default function SstProtocolsPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { hasPermission } = useRotAuth();
	const canCreateFull = hasPermission("sst.protocolo.criar");
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [filters, setFilters] = useState({ status: "", priority: "", type: "", q: "" });
	const [createOpen, setCreateOpen] = useState(searchParams.get("novo") === "1");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchSstProtocols(filters);
			setItems(data);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os protocolos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (searchParams.get("novo") === "1") {
			setCreateOpen(true);
			setSearchParams((current) => {
				const next = new URLSearchParams(current);
				next.delete("novo");
				return next;
			}, { replace: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<ClipboardList size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Protocolos SST</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} protocolo(s) visíveis para você.</p>
					</div>
				</div>
				<button type="button" onClick={() => setCreateOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
					<Plus size={17} /> Reportar para Segurança do Trabalho
				</button>
			</header>

			<div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-card md:grid-cols-[1fr_160px_160px_160px_auto]">
				<div className="relative">
					<Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input value={filters.q} onChange={(e) => setFilters((c) => ({ ...c, q: e.target.value }))} placeholder="Buscar por número ou assunto..." className="h-11 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</div>
				<Select value={filters.status} onChange={(v) => setFilters((c) => ({ ...c, status: v }))} items={STATUS_OPTIONS} empty="Todos status" />
				<Select value={filters.priority} onChange={(v) => setFilters((c) => ({ ...c, priority: v }))} items={PRIORITY_OPTIONS} empty="Toda prioridade" />
				<Select value={filters.type} onChange={(v) => setFilters((c) => ({ ...c, type: v }))} items={TYPE_OPTIONS} empty="Todo tipo" />
				<button type="button" onClick={load} className="rot-btn-tactile h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Filtrar</button>
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? <Spinner /> : (
				<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
					<table className="w-full min-w-[880px] text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Protocolo</th>
								<th className="px-4 py-3">Tipo</th>
								<th className="px-4 py-3">Colaborador</th>
								<th className="px-4 py-3">Prioridade</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Responsável SST</th>
								<th className="px-4 py-3">Atualizado em</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{items.map((item) => (
								<tr key={item.id} onClick={() => navigate(`/seguranca-trabalho/protocolos/${item.id}`)} className="cursor-pointer hover:bg-slate-50">
									<td className="px-4 py-3">
										<p className="font-mono text-xs font-black text-orange-600">{item.protocolNumber}</p>
										<p className="max-w-[220px] truncate text-sm font-bold text-slate-900">{item.subject}</p>
									</td>
									<td className="px-4 py-3 font-bold text-slate-600">{typeLabel(item.type)}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.employeeName || "—"}</td>
									<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${PRIORITY_BADGE[item.priority] || ""}`}>{PRIORITY_OPTIONS.find((p) => p.id === item.priority)?.name || item.priority}</span></td>
									<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${STATUS_BADGE[item.status] || ""}`}>{statusLabel(item.status)}</span></td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.assignedToName || "Não atribuído"}</td>
									<td className="px-4 py-3 font-bold text-slate-500">{new Date(item.updatedAt).toLocaleString("pt-BR")}</td>
								</tr>
							))}
						</tbody>
					</table>
					{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum protocolo encontrado.</p> : null}
				</div>
			)}

			{createOpen ? (
				<CreateProtocolModal
					canFull={canCreateFull}
					onClose={() => setCreateOpen(false)}
					onCreated={(protocol) => {
						setCreateOpen(false);
						navigate(`/seguranca-trabalho/protocolos/${protocol.id}`);
					}}
				/>
			) : null}
		</div>
	);
}

function CreateProtocolModal({ canFull, onClose, onCreated }) {
	const [form, setForm] = useState({ type: "solicitacao", subject: "", description: "", location: "", riskPresent: false, priority: "media", potentialConsequence: "", immediateAction: "" });
	const [photos, setPhotos] = useState([]);
	const [saving, setSaving] = useState(false);
	const [savingStep, setSavingStep] = useState("");
	const [error, setError] = useState("");
	const inputRef = useRef(null);
	const setField = (key, value) => setForm((c) => ({ ...c, [key]: value }));

	const addPhotos = (event) => {
		const files = Array.from(event.target.files || []);
		event.target.value = "";
		if (!files.length) return;
		const remaining = MAX_REQUEST_PHOTOS - photos.length;
		if (remaining <= 0) {
			setError(`Máximo de ${MAX_REQUEST_PHOTOS} fotos.`);
			return;
		}
		const accepted = files.slice(0, remaining);
		setPhotos((current) => [...current, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
		setError("");
	};

	const removePhoto = (index) => {
		setPhotos((current) => {
			URL.revokeObjectURL(current[index].previewUrl);
			return current.filter((_, i) => i !== index);
		});
	};

	const canSubmit = photos.length >= MIN_REQUEST_PHOTOS && photos.length <= MAX_REQUEST_PHOTOS;

	const submit = async (event) => {
		event.preventDefault();
		if (!form.subject.trim()) {
			setError("Informe o assunto.");
			return;
		}
		if (!canSubmit) {
			setError(`Anexe entre ${MIN_REQUEST_PHOTOS} e ${MAX_REQUEST_PHOTOS} foto(s) antes de enviar.`);
			return;
		}
		setSaving(true);
		setError("");
		try {
			setSavingStep("Criando protocolo...");
			const { potentialConsequence, immediateAction, ...rest } = form;
			const protocol = await createSstProtocol({ ...rest, details: { potentialConsequence, immediateAction } });
			for (let i = 0; i < photos.length; i += 1) {
				setSavingStep(`Enviando foto ${i + 1}/${photos.length}...`);
				await uploadImage(photos[i].file, "SST_PROTOCOL", protocol.id);
			}
			onCreated(protocol);
		} catch (err) {
			setError(err?.message || "Não foi possível enviar a solicitação.");
		} finally {
			setSaving(false);
			setSavingStep("");
		}
	};

	return (
		<ModalShell open title="Reportar para Segurança do Trabalho" description="Sua solicitação gera um protocolo com número único, rastreável do início ao fim." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><HardHat size={22} /></span>} onClose={onClose} size="lg">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<Field label="Categoria" required><Select value={form.type} onChange={(v) => setField("type", v)} items={TYPE_OPTIONS} /></Field>
				<Field label="Assunto" required><input value={form.subject} onChange={(e) => setField("subject", e.target.value)} className="rot-input" placeholder="Ex.: Escada com degrau solto na base" autoFocus /></Field>
				<Field label="Descrição"><textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={4} className="rot-input min-h-28 py-3" placeholder="Descreva o que aconteceu ou o que precisa de atenção." /></Field>
				<Field label="Local"><input value={form.location} onChange={(e) => setField("location", e.target.value)} className="rot-input" placeholder="Ex.: Base Betim, poste 42" /></Field>
				{form.type === "quase_acidente" ? (
					<Field label="Potencial de consequência" hint="Se não tivesse sido evitado, o que poderia ter acontecido?"><Select value={form.potentialConsequence} onChange={(v) => setField("potentialConsequence", v)} items={CONSEQUENCE_OPTIONS} /></Field>
				) : null}
				{form.type === "desvio" ? (
					<Field label="Ação imediata tomada"><textarea value={form.immediateAction} onChange={(e) => setField("immediateAction", e.target.value)} rows={2} className="rot-input min-h-16 py-2" placeholder="O que foi feito no momento, se algo foi feito." /></Field>
				) : null}
				{canFull ? (
					<Field label="Prioridade" hint="Só a Segurança do Trabalho define prioridade na criação."><Select value={form.priority} onChange={(v) => setField("priority", v)} items={PRIORITY_OPTIONS} /></Field>
				) : null}
				<div>
					<span className="mb-1.5 flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-500">Fotos<span className="text-red-500">*</span></span>
					<p className="mb-2 text-[11px] font-semibold text-slate-400">Mínimo {MIN_REQUEST_PHOTOS}, máximo {MAX_REQUEST_PHOTOS} foto(s) — escolha da galeria ou tire uma nova.</p>
					<div className="flex flex-wrap gap-2">
						{photos.map((photo, index) => (
							<div key={photo.previewUrl} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200">
								<img src={photo.previewUrl} alt="Prévia" className="h-full w-full object-cover" />
								<button type="button" onClick={() => removePhoto(index)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-lg bg-white/90 text-red-600 hover:bg-white" aria-label="Remover foto">
									<Trash2 size={12} />
								</button>
							</div>
						))}
						{photos.length < MAX_REQUEST_PHOTOS ? (
							<button type="button" onClick={() => inputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-orange-300 hover:text-orange-500">
								<Camera size={18} />
								<span className="text-[10px] font-bold">Adicionar</span>
							</button>
						) : null}
					</div>
					<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={addPhotos} />
					<p className={`mt-1.5 text-[11px] font-bold ${photos.length < MIN_REQUEST_PHOTOS ? "text-red-600" : "text-slate-400"}`}>{photos.length}/{MAX_REQUEST_PHOTOS} foto(s) selecionada(s){photos.length < MIN_REQUEST_PHOTOS ? " · obrigatório anexar pelo menos 1" : ""}.</p>
				</div>
				<label className="flex items-center gap-2 text-sm font-bold text-slate-700">
					<input type="checkbox" checked={form.riskPresent} onChange={(e) => setField("riskPresent", e.target.checked)} />
					O risco ainda está presente no local
				</label>
				<div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
					{saving ? <span className="mr-auto text-xs font-bold text-slate-500">{savingStep}</span> : null}
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving || !canSubmit} className="rot-btn-tactile rounded-xl bg-orange-600 px-5 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Enviando..." : "Enviar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}
