import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, BookOpen, FileText, Plus, Save, Send, Trash2, Upload } from "lucide-react";
import { archiveDssTheme, deleteRotAttachment, fetchDssTheme, fetchRotAttachments, publishDssTheme, saveDssThemeWeeks, updateDssTheme } from "../../api/rotApi";
import Field from "../../components/ui/Field";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { uploadPdf } from "../../utils/imageUpload";
import { CATEGORY_OPTIONS, CONTENT_TYPE_OPTIONS, THEME_STATUS_BADGE, THEME_STATUS_LABEL } from "./DssThemesPage";

const BLOCK_TYPE_OPTIONS = [
	{ id: "titulo", name: "Título" },
	{ id: "subtitulo", name: "Subtítulo" },
	{ id: "paragrafo", name: "Parágrafo" },
	{ id: "lista", name: "Lista" },
	{ id: "destaque", name: "Destaque" },
	{ id: "conclusao", name: "Conclusão" },
];

export function ContentBlockEditor({ blocks, onChange }) {
	const addBlock = () => onChange([...blocks, { type: "paragrafo", text: "", items: [] }]);
	const updateBlock = (index, patch) => onChange(blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)));
	const removeBlock = (index) => onChange(blocks.filter((_, i) => i !== index));

	return (
		<div className="space-y-3">
			{blocks.map((block, index) => (
				<div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
					<div className="mb-2 flex items-center gap-2">
						<Select value={block.type} onChange={(v) => updateBlock(index, { type: v })} items={BLOCK_TYPE_OPTIONS} />
						<button type="button" onClick={() => removeBlock(index)} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Remover bloco"><Trash2 size={15} /></button>
					</div>
					{block.type === "lista" ? (
						<textarea
							value={(block.items || []).join("\n")}
							onChange={(e) => updateBlock(index, { items: e.target.value.split("\n") })}
							rows={4}
							className="rot-input min-h-20 py-2"
							placeholder="Um item por linha"
						/>
					) : (
						<textarea
							value={block.text || ""}
							onChange={(e) => updateBlock(index, { text: e.target.value })}
							rows={block.type === "titulo" || block.type === "subtitulo" ? 1 : 3}
							className="rot-input min-h-12 py-2"
							placeholder={block.type === "titulo" ? "Texto do título" : "Texto"}
						/>
					)}
				</div>
			))}
			<button type="button" onClick={addBlock} className="rot-btn-tactile inline-flex h-10 items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-bold text-slate-600 hover:border-orange-300 hover:text-orange-600">
				<Plus size={15} /> Adicionar bloco
			</button>
		</div>
	);
}

function PdfAttachment({ entityId, canEdit }) {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		try {
			const data = await fetchRotAttachments("DSS_THEME", entityId);
			setItems(data.items || []);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o PDF.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entityId]);

	const onSelect = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setUploading(true);
		setError("");
		try {
			for (const existing of items) await deleteRotAttachment(existing.id);
			await uploadPdf(file, "DSS_THEME", entityId);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o PDF.");
		} finally {
			setUploading(false);
		}
	};

	if (loading) return <Spinner />;
	return (
		<div className="space-y-2">
			{error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			{items.map((item) => (
				<a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-orange-300">
					<FileText size={16} className="text-orange-600" /> {item.originalName || "PDF do tema"}
				</a>
			))}
			{!items.length ? <p className="text-sm font-semibold text-slate-400">Nenhum PDF anexado ainda.</p> : null}
			{canEdit ? (
				<label className="rot-btn-tactile inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-bold text-slate-600 hover:border-orange-300 hover:text-orange-600">
					<Upload size={15} /> {uploading ? "Enviando..." : items.length ? "Substituir PDF" : "Anexar PDF"}
					<input type="file" accept="application/pdf" className="hidden" onChange={onSelect} disabled={uploading} />
				</label>
			) : null}
		</div>
	);
}

function WeeksEditor({ theme, onSaved }) {
	const [weeks, setWeeks] = useState(() => {
		const byNumber = new Map((theme.weeks || []).map((week) => [week.weekNumber, week]));
		return [1, 2, 3, 4].map((weekNumber) => byNumber.get(weekNumber) || { weekNumber, title: "", contentType: "editor", contentBlocks: [] });
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const updateWeek = (weekNumber, patch) => setWeeks((current) => current.map((week) => (week.weekNumber === weekNumber ? { ...week, ...patch } : week)));

	const save = async () => {
		setSaving(true);
		setError("");
		try {
			const filled = weeks.filter((week) => week.title.trim());
			if (!filled.length) throw new Error("Preencha ao menos uma semana.");
			await saveDssThemeWeeks(theme.id, filled);
			onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar os desdobramentos semanais.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-4">
			{error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			{weeks.map((week) => (
				<div key={week.weekNumber} className="rounded-2xl border border-slate-200 bg-white p-4">
					<h3 className="mb-3 text-sm font-black text-slate-900">Semana {week.weekNumber}</h3>
					<div className="space-y-3">
						<Field label="Título"><input value={week.title} onChange={(e) => updateWeek(week.weekNumber, { title: e.target.value })} className="rot-input" /></Field>
						<Field label="Conteúdo"><Select value={week.contentType} onChange={(v) => updateWeek(week.weekNumber, { contentType: v })} items={CONTENT_TYPE_OPTIONS} /></Field>
						{week.contentType === "editor" ? (
							<ContentBlockEditor blocks={week.contentBlocks || []} onChange={(blocks) => updateWeek(week.weekNumber, { contentBlocks: blocks })} />
						) : (
							<p className="text-sm font-semibold text-slate-400">Anexe o PDF desta semana depois de salvar (fase seguinte).</p>
						)}
					</div>
				</div>
			))}
			<button type="button" onClick={save} disabled={saving} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
				<Save size={16} /> {saving ? "Salvando..." : "Salvar semanas"}
			</button>
		</div>
	);
}

export default function DssThemeDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canEdit = hasPermission("dss.tema.editar");
	const canArchive = hasPermission("dss.tema.arquivar");
	const [theme, setTheme] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setTheme(await fetchDssTheme(id));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o tema.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	const saveField = async (patch) => {
		setSaving(true);
		setError("");
		try {
			setTheme(await updateDssTheme(id, patch));
		} catch (err) {
			setError(err?.message || "Não foi possível salvar.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <Spinner />;
	if (!theme) return <p className="text-sm font-bold text-red-600">{error || "Tema não encontrado."}</p>;

	return (
		<div className="space-y-6">
			<button type="button" onClick={() => navigate("/seguranca-trabalho/dss/temas")} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800">
				<ArrowLeft size={15} /> Voltar para temas
			</button>

			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><BookOpen size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">{theme.title}</h1>
						<span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-black ${THEME_STATUS_BADGE[theme.status] || ""}`}>{THEME_STATUS_LABEL[theme.status] || theme.status}</span>
					</div>
				</div>
				<div className="flex gap-2">
					{canEdit && theme.status === "rascunho" ? (
						<button type="button" onClick={async () => setTheme(await publishDssTheme(id))} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"><Send size={15} /> Publicar</button>
					) : null}
					{canArchive && theme.status !== "arquivado" ? (
						<button type="button" onClick={async () => setTheme(await archiveDssTheme(id))} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"><Archive size={15} /> Arquivar</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Categoria"><Select value={theme.category} onChange={(v) => saveField({ category: v })} items={CATEGORY_OPTIONS} /></Field>
				<Field label="Modalidade" hint="Definida na criação, não pode ser alterada."><input value={theme.modality === "mensal" ? "Mensal" : "Semanal"} disabled className="rot-input opacity-60" /></Field>
			</div>
			<Field label="Descrição resumida"><textarea defaultValue={theme.description || ""} onBlur={(e) => saveField({ description: e.target.value })} rows={2} className="rot-input min-h-16 py-2" /></Field>
			<Field label="Objetivo"><textarea defaultValue={theme.objective || ""} onBlur={(e) => saveField({ objective: e.target.value })} rows={2} className="rot-input min-h-16 py-2" /></Field>
			<Field label="Observações"><textarea defaultValue={theme.notes || ""} onBlur={(e) => saveField({ notes: e.target.value })} rows={2} className="rot-input min-h-16 py-2" /></Field>

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
				<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">
					{theme.modality === "mensal" ? "Conteúdo geral do tema" : "Conteúdo"}
				</h2>
				<div className="mb-3">
					<Select value={theme.contentType} onChange={(v) => saveField({ contentType: v })} items={CONTENT_TYPE_OPTIONS} />
				</div>
				{theme.contentType === "editor" ? (
					<ContentBlockEditor blocks={theme.contentBlocks || []} onChange={(blocks) => setTheme((c) => ({ ...c, contentBlocks: blocks }))} />
				) : (
					<PdfAttachment entityId={theme.id} canEdit={canEdit} />
				)}
				{theme.contentType === "editor" ? (
					<button type="button" disabled={saving} onClick={() => saveField({ contentBlocks: theme.contentBlocks })} className="rot-btn-tactile mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
						<Save size={15} /> {saving ? "Salvando..." : "Salvar conteúdo"}
					</button>
				) : null}
			</section>

			{theme.modality === "mensal" ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
					<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Desdobramentos semanais</h2>
					<WeeksEditor theme={theme} onSaved={load} />
				</section>
			) : null}
		</div>
	);
}
